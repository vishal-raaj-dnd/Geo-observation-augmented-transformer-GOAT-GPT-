"""
pipeline_water_dataset.py

COMBINED pipeline: download → process → save results → delete ZIP
Processes one scene at a time to stay within Kaggle's ~20 GB disk limit.

Each Sentinel-2 ZIP is ~1 GB. After processing, the useful outputs
(cropped bands, NDWI, water mask, preview) are only ~5–10 MB.
So we download, extract what we need, and delete the ZIP immediately.

Output: A training-ready dataset with:
  - Cropped satellite tiles per reservoir
  - NDWI rasters
  - Water masks
  - Preview PNGs
  - A manifest CSV with metadata for caption generation

Runs inside Kaggle.
"""

import os
import csv
import glob
import time
import shutil
import zipfile
import json
import numpy as np
import requests

try:
    import rasterio
    from rasterio.windows import from_bounds
    from rasterio.warp import transform_bounds
except ImportError:
    os.system("pip install rasterio")
    import rasterio
    from rasterio.windows import from_bounds
    from rasterio.warp import transform_bounds

try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
except ImportError:
    os.system("pip install matplotlib")
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

try:
    from kaggle_secrets import UserSecretsClient
    user_secrets = UserSecretsClient()
    CDSE_USERNAME = user_secrets.get_secret("CDSE_USERNAME")
    CDSE_PASSWORD = user_secrets.get_secret("CDSE_PASSWORD")
except Exception:
    CDSE_USERNAME = os.environ.get("CDSE_USERNAME", "")
    CDSE_PASSWORD = os.environ.get("CDSE_PASSWORD", "")


# ═══════════════════════════════════════════════════════════════════════════
# CONFIG
# ═══════════════════════════════════════════════════════════════════════════
OUTPUT_DIR = "/kaggle/working/water_dataset"
TEMP_DIR   = "/kaggle/working/_temp_downloads"   # ZIPs go here, get deleted

MAX_CLOUD_COVER = 30
MAX_PRODUCTS_PER_SEASON = 1   # Keep at 1 to save disk space
NDWI_THRESHOLD = 0.0

SEASONS = {
    "pre_monsoon":  ("2024-03-01", "2024-05-31"),
    "post_monsoon": ("2024-10-01", "2024-12-31"),
    # Monsoon has too much cloud cover — skip by default
    # "monsoon":    ("2024-07-01", "2024-09-30"),
}

RESERVOIRS = {
    # ── SOUTH INDIA ──
    "Krishnaraja_Sagar":       (76.53, 12.39, 76.64, 12.47),
    "Kabini_Reservoir":        (76.28, 11.90, 76.40, 11.98),
    "Tungabhadra_Dam":         (76.30, 15.25, 76.42, 15.33),
    "Bhadra_Reservoir":        (75.58, 13.68, 75.72, 13.78),
    "Nagarjuna_Sagar":         (79.25, 16.50, 79.40, 16.60),
    "Srisailam_Dam":           (78.85, 15.80, 78.98, 15.92),
    "Idukki_Reservoir":        (76.95, 9.80, 77.05, 9.88),
    "Mettur_Dam":              (77.75, 11.75, 77.88, 11.85),
    "Vaigai_Dam":              (77.42, 10.02, 77.52, 10.10),
    "Periyar_Lake":            (77.12, 9.44, 77.22, 9.52),
    # ── WEST INDIA ──
    "Sardar_Sarovar":          (73.70, 21.80, 73.85, 21.92),
    "Ukai_Dam":                (73.55, 21.22, 73.68, 21.32),
    "Koyna_Dam":               (73.72, 17.38, 73.82, 17.46),
    "Jayakwadi_Dam":           (75.32, 19.42, 75.50, 19.55),
    "Ujjani_Dam":              (75.05, 18.02, 75.18, 18.12),
    # ── CENTRAL INDIA ──
    "Gandhi_Sagar":            (75.55, 24.65, 75.72, 24.78),
    "Bargi_Dam":               (79.90, 22.92, 80.05, 23.05),
    "Tawa_Reservoir":          (77.82, 22.60, 77.98, 22.72),
    "Bansagar_Dam":            (81.00, 24.18, 81.15, 24.28),
    # ── NORTH INDIA ──
    "Bhakra_Dam_Gobind_Sagar": (76.40, 31.35, 76.55, 31.48),
    "Pong_Dam":                (75.92, 31.92, 76.08, 32.05),
    "Tehri_Dam":               (78.42, 30.35, 78.55, 30.45),
    "Rihand_Dam":              (83.00, 24.18, 83.15, 24.30),
    # ── EAST INDIA ──
    "Hirakud_Dam":             (83.80, 21.48, 84.00, 21.62),
    "Maithon_Dam":             (86.75, 23.75, 86.88, 23.85),
    "Panchet_Dam":             (86.72, 23.65, 86.85, 23.72),
    "Massanjore_Dam":          (87.35, 24.05, 87.48, 24.15),
    "Tilaiya_Dam":             (85.52, 24.28, 85.62, 24.35),
    # ── NORTHEAST INDIA ──
    "Umiam_Lake":              (91.85, 25.62, 91.95, 25.70),
    "Doyang_Reservoir":        (93.55, 26.25, 93.68, 26.35),
    # ── NATURAL LAKES ──
    "Chilika_Lake":            (85.20, 19.60, 85.55, 19.82),
    "Pulicat_Lake":            (80.25, 13.42, 80.38, 13.60),
    "Vembanad_Lake":           (76.30, 9.50, 76.45, 9.72),
    "Wular_Lake":              (74.52, 34.32, 74.65, 34.42),
    "Dal_Lake":                (74.82, 34.08, 74.90, 34.14),
    "Loktak_Lake":             (93.75, 24.52, 93.88, 24.62),
    "Sambhar_Salt_Lake":       (75.02, 26.85, 75.20, 27.00),
    # ── RIVERS ──
    "Ganga_Allahabad":         (81.82, 25.40, 81.92, 25.48),
    "Brahmaputra_Guwahati":    (91.68, 26.15, 91.82, 26.22),
    "Godavari_Rajahmundry":    (81.72, 16.92, 81.88, 17.02),
}

# Region metadata for captions
REGION_INFO = {
    "Krishnaraja_Sagar":       {"state": "Karnataka",        "river": "Cauvery",        "type": "reservoir"},
    "Kabini_Reservoir":        {"state": "Karnataka",        "river": "Kabini",         "type": "reservoir"},
    "Tungabhadra_Dam":         {"state": "Karnataka",        "river": "Tungabhadra",    "type": "reservoir"},
    "Bhadra_Reservoir":        {"state": "Karnataka",        "river": "Bhadra",         "type": "reservoir"},
    "Nagarjuna_Sagar":         {"state": "Telangana",        "river": "Krishna",        "type": "reservoir"},
    "Srisailam_Dam":           {"state": "Andhra Pradesh",   "river": "Krishna",        "type": "reservoir"},
    "Idukki_Reservoir":        {"state": "Kerala",           "river": "Periyar",        "type": "reservoir"},
    "Mettur_Dam":              {"state": "Tamil Nadu",       "river": "Cauvery",        "type": "reservoir"},
    "Vaigai_Dam":              {"state": "Tamil Nadu",       "river": "Vaigai",         "type": "reservoir"},
    "Periyar_Lake":            {"state": "Kerala",           "river": "Periyar",        "type": "lake"},
    "Sardar_Sarovar":          {"state": "Gujarat",          "river": "Narmada",        "type": "reservoir"},
    "Ukai_Dam":                {"state": "Gujarat",          "river": "Tapi",           "type": "reservoir"},
    "Koyna_Dam":               {"state": "Maharashtra",      "river": "Koyna",          "type": "reservoir"},
    "Jayakwadi_Dam":           {"state": "Maharashtra",      "river": "Godavari",       "type": "reservoir"},
    "Ujjani_Dam":              {"state": "Maharashtra",      "river": "Bhima",          "type": "reservoir"},
    "Gandhi_Sagar":            {"state": "Madhya Pradesh",   "river": "Chambal",        "type": "reservoir"},
    "Bargi_Dam":               {"state": "Madhya Pradesh",   "river": "Narmada",        "type": "reservoir"},
    "Tawa_Reservoir":          {"state": "Madhya Pradesh",   "river": "Tawa",           "type": "reservoir"},
    "Bansagar_Dam":            {"state": "Madhya Pradesh",   "river": "Sone",           "type": "reservoir"},
    "Bhakra_Dam_Gobind_Sagar": {"state": "Himachal Pradesh", "river": "Sutlej",         "type": "reservoir"},
    "Pong_Dam":                {"state": "Himachal Pradesh", "river": "Beas",           "type": "reservoir"},
    "Tehri_Dam":               {"state": "Uttarakhand",      "river": "Bhagirathi",     "type": "reservoir"},
    "Rihand_Dam":              {"state": "Uttar Pradesh",    "river": "Rihand",         "type": "reservoir"},
    "Hirakud_Dam":             {"state": "Odisha",           "river": "Mahanadi",       "type": "reservoir"},
    "Maithon_Dam":             {"state": "Jharkhand",        "river": "Barakar",        "type": "reservoir"},
    "Panchet_Dam":             {"state": "Jharkhand",        "river": "Damodar",        "type": "reservoir"},
    "Massanjore_Dam":          {"state": "Jharkhand",        "river": "Mayurakshi",     "type": "reservoir"},
    "Tilaiya_Dam":             {"state": "Jharkhand",        "river": "Barakar",        "type": "reservoir"},
    "Umiam_Lake":              {"state": "Meghalaya",        "river": "Umiam",          "type": "lake"},
    "Doyang_Reservoir":        {"state": "Nagaland",         "river": "Doyang",         "type": "reservoir"},
    "Chilika_Lake":            {"state": "Odisha",           "river": "N/A",            "type": "brackish lagoon"},
    "Pulicat_Lake":            {"state": "Tamil Nadu/AP",    "river": "N/A",            "type": "brackish lagoon"},
    "Vembanad_Lake":           {"state": "Kerala",           "river": "N/A",            "type": "backwater lake"},
    "Wular_Lake":              {"state": "J&K",              "river": "Jhelum",         "type": "freshwater lake"},
    "Dal_Lake":                {"state": "J&K",              "river": "N/A",            "type": "urban lake"},
    "Loktak_Lake":             {"state": "Manipur",          "river": "N/A",            "type": "floating lake"},
    "Sambhar_Salt_Lake":       {"state": "Rajasthan",        "river": "N/A",            "type": "salt lake"},
    "Ganga_Allahabad":         {"state": "Uttar Pradesh",    "river": "Ganga/Yamuna",   "type": "river confluence"},
    "Brahmaputra_Guwahati":    {"state": "Assam",            "river": "Brahmaputra",    "type": "braided river"},
    "Godavari_Rajahmundry":    {"state": "Andhra Pradesh",   "river": "Godavari",       "type": "river delta"},
}


# ═══════════════════════════════════════════════════════════════════════════
# AUTH
# ═══════════════════════════════════════════════════════════════════════════
def get_access_token() -> str:
    url = (
        "https://identity.dataspace.copernicus.eu"
        "/auth/realms/CDSE/protocol/openid-connect/token"
    )
    data = {
        "client_id":  "cdse-public",
        "username":   CDSE_USERNAME,
        "password":   CDSE_PASSWORD,
        "grant_type": "password",
    }
    r = requests.post(url, data=data)
    if r.status_code != 200:
        print(f"AUTH FAILED ({r.status_code}): {r.text[:300]}")
        r.raise_for_status()
    return r.json()["access_token"]


# ═══════════════════════════════════════════════════════════════════════════
# SEARCH
# ═══════════════════════════════════════════════════════════════════════════
def search_products(bbox, date_from, date_to, max_cloud, top=3):
    min_lon, min_lat, max_lon, max_lat = bbox
    aoi = (
        f"POLYGON(({min_lon} {min_lat},{max_lon} {min_lat},"
        f"{max_lon} {max_lat},{min_lon} {max_lat},{min_lon} {min_lat}))"
    )
    clauses = [
        "Collection/Name eq 'SENTINEL-2'",
        f"OData.CSC.Intersects(area=geography'SRID=4326;{aoi}')",
        f"ContentDate/Start gt {date_from}T00:00:00.000Z",
        f"ContentDate/Start lt {date_to}T23:59:59.999Z",
        ("Attributes/OData.CSC.StringAttribute/any("
         "att:att/Name eq 'productType' and "
         "att/OData.CSC.StringAttribute/Value eq 'S2MSI2A')"),
        ("Attributes/OData.CSC.DoubleAttribute/any("
         f"att:att/Name eq 'cloudCover' and "
         f"att/OData.CSC.DoubleAttribute/Value le {max_cloud}.00)"),
    ]
    url = "https://catalogue.dataspace.copernicus.eu/odata/v1/Products"
    params = {"$filter": " and ".join(clauses), "$top": top,
              "$orderby": "ContentDate/Start desc"}
    r = requests.get(url, params=params)
    return r.json().get("value", []) if r.status_code == 200 else []


# ═══════════════════════════════════════════════════════════════════════════
# DOWNLOAD (one product at a time)
# ═══════════════════════════════════════════════════════════════════════════
def download_product(product_id, product_name, token):
    """Download a single product to TEMP_DIR. Returns path or None."""
    url = f"https://zipper.dataspace.copernicus.eu/odata/v1/Products({product_id})/$value"
    headers = {"Authorization": f"Bearer {token}"}
    out_path = os.path.join(TEMP_DIR, f"{product_name}.zip")
    os.makedirs(TEMP_DIR, exist_ok=True)

    session = requests.Session()
    r = session.get(url, headers=headers, stream=True, allow_redirects=False)

    # Follow redirects manually to preserve auth header
    for _ in range(5):
        if r.status_code not in (301, 302, 303, 307, 308):
            break
        redirect_url = r.headers.get("Location")
        if not redirect_url:
            break
        r = session.get(redirect_url, headers=headers, stream=True, allow_redirects=False)

    content_type = r.headers.get("Content-Type", "")
    if "json" in content_type.lower() or "html" in content_type.lower():
        try:
            msg = r.json().get("detail", r.text[:200])
        except Exception:
            msg = r.text[:200]
        print(f"    Download error: {msg}")
        return None

    if r.status_code != 200:
        print(f"    Download failed: HTTP {r.status_code}")
        return None

    downloaded = 0
    with open(out_path, "wb") as f:
        for chunk in r.iter_content(chunk_size=8192):
            f.write(chunk)
            downloaded += len(chunk)

    mb = downloaded / 1024 / 1024
    if mb < 1:
        os.remove(out_path)
        print(f"    Download too small ({mb:.2f} MB) — skipping")
        return None

    print(f"    ✓ Downloaded ({mb:.0f} MB)")
    return out_path


# ═══════════════════════════════════════════════════════════════════════════
# PROCESS (extract bands, crop, compute NDWI, water mask)
# ═══════════════════════════════════════════════════════════════════════════
def unzip_and_find_safe(zip_path):
    """Unzip and return .SAFE directory path."""
    extract_dir = zip_path.replace(".zip", "_extracted")
    with zipfile.ZipFile(zip_path, "r") as z:
        z.extractall(extract_dir)
    safe_dirs = glob.glob(os.path.join(extract_dir, "*.SAFE"))
    if not safe_dirs:
        safe_dirs = glob.glob(os.path.join(extract_dir, "*", "*.SAFE"))
    return safe_dirs[0] if safe_dirs else None


def find_band(safe_dir, band, resolution="R10m"):
    """Find a band file within the .SAFE structure."""
    patterns = [
        os.path.join(safe_dir, "GRANULE", "*", "IMG_DATA", resolution, f"*_{band}_*.jp2"),
        os.path.join(safe_dir, "GRANULE", "*", "IMG_DATA", resolution, f"*_{band}_*.tif"),
    ]
    for p in patterns:
        matches = glob.glob(p)
        if matches:
            return matches[0]
    return None


def crop_band(band_path, bbox):
    """Read and crop a band to a lat/lon bounding box. Returns (array, transform, crs)."""
    min_lon, min_lat, max_lon, max_lat = bbox
    with rasterio.open(band_path) as src:
        left, bottom, right, top = transform_bounds(
            "EPSG:4326", src.crs, min_lon, min_lat, max_lon, max_lat
        )
        window = from_bounds(left, bottom, right, top, src.transform)
        try:
            data = src.read(1, window=window).astype(np.float32)
            transform = src.window_transform(window)
            return data, transform, src.crs
        except Exception as e:
            print(f"    Crop error: {e}")
            return None, None, None


def compute_ndwi(green, nir):
    """NDWI = (Green - NIR) / (Green + NIR). Water > 0, land < 0."""
    denom = green + nir
    return np.where(denom > 0, (green - nir) / denom, 0.0).astype(np.float32)


def save_geotiff(data, transform, crs, path, dtype="float32"):
    """Save a single-band GeoTIFF."""
    with rasterio.open(path, "w", driver="GTiff",
                       height=data.shape[0], width=data.shape[1],
                       count=1, dtype=dtype, crs=crs, transform=transform) as dst:
        dst.write(data, 1)


def save_rgb_png(green, nir, ndwi, water_mask, res_name, water_km2, water_pct, path):
    """Save a 4-panel preview PNG."""
    fig, axes = plt.subplots(1, 4, figsize=(24, 6))

    # Green band
    vmin, vmax = np.percentile(green[green > 0], [2, 98]) if green.any() else (0, 1)
    axes[0].imshow(green, cmap="gray", vmin=vmin, vmax=vmax)
    axes[0].set_title("B03 (Green)")
    axes[0].axis("off")

    # NIR band
    vmin2, vmax2 = np.percentile(nir[nir > 0], [2, 98]) if nir.any() else (0, 1)
    axes[1].imshow(nir, cmap="gray", vmin=vmin2, vmax=vmax2)
    axes[1].set_title("B08 (NIR)")
    axes[1].axis("off")

    # NDWI
    im = axes[2].imshow(ndwi, cmap="RdYlBu", vmin=-0.5, vmax=0.5)
    axes[2].set_title("NDWI")
    axes[2].axis("off")
    plt.colorbar(im, ax=axes[2], fraction=0.046)

    # Water mask
    axes[3].imshow(water_mask, cmap="Blues", vmin=0, vmax=1)
    axes[3].set_title(f"Water: {water_km2:.2f} km² ({water_pct:.1f}%)")
    axes[3].axis("off")

    plt.suptitle(res_name.replace("_", " "), fontsize=14, fontweight="bold")
    plt.tight_layout()
    plt.savefig(path, dpi=100, bbox_inches="tight")
    plt.close()


def process_scene(zip_path, reservoir_name, bbox, out_dir):
    """
    Full processing pipeline for one downloaded scene.
    Returns a result dict or None.
    """
    # Unzip
    safe_dir = unzip_and_find_safe(zip_path)
    if not safe_dir:
        print(f"    No .SAFE directory found")
        return None

    # Find bands
    b03_path = find_band(safe_dir, "B03")
    b08_path = find_band(safe_dir, "B08")
    if not b03_path or not b08_path:
        print(f"    Missing B03 or B08 band")
        return None

    # Crop
    green, transform, crs = crop_band(b03_path, bbox)
    nir, _, _ = crop_band(b08_path, bbox)
    if green is None or nir is None:
        print(f"    Crop failed — reservoir outside this tile")
        return None

    # NDWI + water mask
    ndwi = compute_ndwi(green, nir)
    water_mask = (ndwi > NDWI_THRESHOLD).astype(np.uint8)

    total_px = ndwi.size
    water_px = water_mask.sum()
    water_pct = (water_px / total_px) * 100 if total_px > 0 else 0
    water_km2 = water_px * (10 * 10) / 1_000_000  # 10m resolution

    # Extract acquisition date from the .SAFE directory name
    safe_name = os.path.basename(safe_dir)
    # Format: S2B_MSIL2A_20240505T051649_...
    acq_date = safe_name.split("_")[2][:8]  # "20240505"
    acq_date_fmt = f"{acq_date[:4]}-{acq_date[4:6]}-{acq_date[6:8]}"

    # Save outputs
    scene_id = f"{reservoir_name}_{acq_date}"
    scene_dir = os.path.join(out_dir, reservoir_name, scene_id)
    os.makedirs(scene_dir, exist_ok=True)

    save_geotiff(green, transform, crs, os.path.join(scene_dir, "B03_green.tif"))
    save_geotiff(nir, transform, crs, os.path.join(scene_dir, "B08_nir.tif"))
    save_geotiff(ndwi, transform, crs, os.path.join(scene_dir, "ndwi.tif"))
    save_geotiff(water_mask, transform, crs,
                 os.path.join(scene_dir, "water_mask.tif"), dtype="uint8")
    save_rgb_png(green, nir, ndwi, water_mask,
                 reservoir_name, water_km2, water_pct,
                 os.path.join(scene_dir, "preview.png"))

    print(f"    ✓ Processed: {water_km2:.2f} km² water ({water_pct:.1f}%)")
    print(f"      Image: {green.shape[1]}×{green.shape[0]} px | Date: {acq_date_fmt}")

    return {
        "reservoir":    reservoir_name,
        "scene_id":     scene_id,
        "date":         acq_date_fmt,
        "safe_name":    safe_name,
        "image_width":  green.shape[1],
        "image_height": green.shape[0],
        "water_area_km2":   round(water_km2, 3),
        "water_percentage": round(water_pct, 1),
        "ndwi_min":     round(float(ndwi.min()), 3),
        "ndwi_max":     round(float(ndwi.max()), 3),
        "output_dir":   scene_dir,
    }


# ═══════════════════════════════════════════════════════════════════════════
# CAPTION GENERATION
# ═══════════════════════════════════════════════════════════════════════════
def generate_caption(result, reservoir_name):
    """
    Generate a training caption for this scene.
    These template captions bootstrap VLM training.
    """
    info = REGION_INFO.get(reservoir_name, {})
    state = info.get("state", "India")
    river = info.get("river", "N/A")
    wtype = info.get("type", "water body")
    name_clean = reservoir_name.replace("_", " ")

    water_km2 = result["water_area_km2"]
    water_pct = result["water_percentage"]
    date = result["date"]
    w, h = result["image_width"], result["image_height"]

    # Determine season from date
    month = int(date.split("-")[1])
    if month in (3, 4, 5):
        season = "pre-monsoon (dry season)"
    elif month in (6, 7, 8, 9):
        season = "monsoon (wet season)"
    else:
        season = "post-monsoon"

    # Determine water level description
    if water_pct > 60:
        level_desc = "high water levels with extensive surface coverage"
    elif water_pct > 30:
        level_desc = "moderate water levels"
    elif water_pct > 10:
        level_desc = "low water levels with significant exposed shoreline"
    else:
        level_desc = "very low water levels or the water body is largely dry"

    caption = (
        f"This is a Sentinel-2 satellite image of {name_clean}, a {wtype} "
        f"in {state}, India"
        f"{f', on the {river} river' if river != 'N/A' else ''}. "
        f"The image was acquired on {date} during the {season}. "
        f"The visible water surface covers approximately {water_km2:.2f} km², "
        f"representing {water_pct:.1f}% of the cropped area. "
        f"The scene shows {level_desc}. "
        f"The image covers a {w}×{h} pixel area at 10-metre resolution from "
        f"Sentinel-2 bands B03 (green, 560 nm) and B08 (near-infrared, 842 nm)."
    )

    # VQA pairs
    vqa = [
        {"q": "Is there a water body visible in this image?",
         "a": f"Yes, {name_clean} is visible as a {wtype} covering approximately {water_km2:.2f} km²."},
        {"q": "What is the approximate water coverage in this image?",
         "a": f"Water covers approximately {water_pct:.1f}% of the image area, or about {water_km2:.2f} km²."},
        {"q": f"What season was this image captured in?",
         "a": f"This image was captured on {date}, during the {season} in {state}."},
        {"q": "Does the water level appear high or low?",
         "a": f"The image shows {level_desc}."},
        {"q": "What type of water body is this?",
         "a": f"This is {name_clean}, a {wtype}{f' on the {river} river' if river != 'N/A' else ''} in {state}."},
    ]

    return caption, vqa


# ═══════════════════════════════════════════════════════════════════════════
# CLEANUP
# ═══════════════════════════════════════════════════════════════════════════
def cleanup_temp():
    """Delete all temporary files (ZIPs and extracted directories)."""
    if os.path.exists(TEMP_DIR):
        shutil.rmtree(TEMP_DIR, ignore_errors=True)
        os.makedirs(TEMP_DIR, exist_ok=True)


# ═══════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════
def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(TEMP_DIR, exist_ok=True)

    print("=" * 65)
    print("  Water Resource Dataset Builder")
    print(f"  Reservoirs:  {len(RESERVOIRS)}")
    print(f"  Seasons:     {list(SEASONS.keys())}")
    print(f"  Disk-safe:   download → process → delete (one at a time)")
    print("=" * 65)

    token = get_access_token()
    print(f"✓ Authenticated\n")

    # Manifest and captions accumulator
    manifest = []
    all_captions = []
    all_vqa = []
    processed_count = 0
    token_counter = 0

    for res_idx, (res_name, bbox) in enumerate(RESERVOIRS.items(), 1):
        print(f"\n{'━'*55}")
        print(f"[{res_idx}/{len(RESERVOIRS)}] {res_name}")
        print(f"{'━'*55}")

        for season_name, (date_from, date_to) in SEASONS.items():
            print(f"\n  Season: {season_name}")

            # Search
            products = search_products(bbox, date_from, date_to,
                                       MAX_CLOUD_COVER, top=MAX_PRODUCTS_PER_SEASON)
            if not products:
                print(f"    No products found")
                continue

            # Pick first online product
            product = None
            for p in products:
                if p.get("Online") is not False:
                    product = p
                    break
            if not product:
                print(f"    All products offline — skipping")
                continue

            print(f"    Product: {product['Name'][:50]}...")

            # Download
            zip_path = download_product(product["Id"], product["Name"], token)
            if not zip_path:
                continue

            # Process
            result = process_scene(zip_path, res_name, bbox, OUTPUT_DIR)

            if result:
                # Generate caption + VQA
                caption, vqa = generate_caption(result, res_name)
                result["caption"] = caption
                result["vqa"] = vqa
                manifest.append(result)
                all_captions.append({"scene_id": result["scene_id"], "caption": caption})
                all_vqa.extend([{"scene_id": result["scene_id"], **q} for q in vqa])
                processed_count += 1

            # ── DELETE the ZIP and extracted files immediately ──
            cleanup_temp()
            print(f"    ✓ Temp files cleaned")

            # Refresh token periodically
            token_counter += 1
            if token_counter % 15 == 0:
                token = get_access_token()
                print(f"    ✓ Token refreshed")

            time.sleep(1)  # Rate limiting

    # ── Save manifest ──
    manifest_path = os.path.join(OUTPUT_DIR, "manifest.json")
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)

    # ── Save captions ──
    captions_path = os.path.join(OUTPUT_DIR, "captions.jsonl")
    with open(captions_path, "w") as f:
        for c in all_captions:
            f.write(json.dumps(c) + "\n")

    # ── Save VQA pairs ──
    vqa_path = os.path.join(OUTPUT_DIR, "vqa_pairs.jsonl")
    with open(vqa_path, "w") as f:
        for q in all_vqa:
            f.write(json.dumps(q) + "\n")

    # ── Save CSV manifest ──
    csv_path = os.path.join(OUTPUT_DIR, "manifest.csv")
    if manifest:
        keys = [k for k in manifest[0].keys() if k not in ("caption", "vqa")]
        with open(csv_path, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=keys)
            writer.writeheader()
            for row in manifest:
                writer.writerow({k: row[k] for k in keys})

    # ── Summary ──
    print(f"\n{'='*65}")
    print(f"  DATASET COMPLETE")
    print(f"  Scenes processed:  {processed_count}")
    print(f"  Captions generated: {len(all_captions)}")
    print(f"  VQA pairs:         {len(all_vqa)}")
    print(f"  Output directory:  {OUTPUT_DIR}")
    print(f"{'='*65}")
    print(f"\n  Files:")
    print(f"    {manifest_path}")
    print(f"    {captions_path}")
    print(f"    {vqa_path}")
    print(f"    {csv_path}")
    print(f"    + Per-scene: B03, B08, NDWI, water_mask GeoTIFFs + preview PNGs")

    # Disk usage
    total_size = 0
    for dirpath, dirnames, filenames in os.walk(OUTPUT_DIR):
        for fname in filenames:
            total_size += os.path.getsize(os.path.join(dirpath, fname))
    print(f"\n  Total dataset size: {total_size / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    main()
