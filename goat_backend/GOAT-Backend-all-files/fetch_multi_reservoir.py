"""
fetch_multi_reservoir.py

Fetch Sentinel-2 L2A data for 40+ major Indian reservoirs.
One reservoir is NOT enough to train a water monitoring model — you need
geographic diversity, size diversity, seasonal variation, and varied
surrounding land cover.

This script:
  1. Defines bounding boxes for ~40 major Indian reservoirs/lakes
  2. Fetches Sentinel-2 L2A scenes across multiple seasons
  3. Downloads the products to organised directories
  4. Generates a manifest CSV tracking what was downloaded

Runs inside Kaggle. Uses the same CDSE OAuth as fetch_sentinel2_in_kaggle.py.

WHY 40+ RESERVOIRS?
  • One reservoir = one shape, one landscape, one spectral signature → overfitting
  • Water looks different in different geographies (turbidity, depth, algae, soil)
  • Surrounding land cover varies (urban, agricultural, forested, arid)
  • Monsoon vs dry season changes water extent dramatically
  • Model needs to learn "what water looks like" generically, not "what KRS looks like"
"""

import os
import csv
import time
import requests

try:
    from kaggle_secrets import UserSecretsClient
    user_secrets = UserSecretsClient()
    # ── You need USERNAME + PASSWORD secrets, not client_id/secret ──
    # Go to Kaggle notebook > Add-ons > Secrets and add:
    #   CDSE_USERNAME  = your Copernicus Data Space email
    #   CDSE_PASSWORD  = your Copernicus Data Space password
    CDSE_USERNAME = user_secrets.get_secret("CDSE_USERNAME")
    CDSE_PASSWORD = user_secrets.get_secret("CDSE_PASSWORD")
except Exception:
    # Fallback for running outside Kaggle (set env vars)
    CDSE_USERNAME = os.environ.get("CDSE_USERNAME", "")
    CDSE_PASSWORD = os.environ.get("CDSE_PASSWORD", "")


# ---------------------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------------------
OUTPUT_DIR = "/kaggle/working/sentinel2_multi_reservoir"
MANIFEST_CSV = os.path.join(OUTPUT_DIR, "download_manifest.csv")

MAX_CLOUD_COVER = 30  # Higher than before — India is cloudy!
MAX_PRODUCTS_PER_RESERVOIR = 2  # Download up to 2 scenes per reservoir per season

# Fetch across 3 seasons for temporal diversity
SEASONS = {
    "pre_monsoon":  ("2024-03-01", "2024-05-31"),  # Dry — reservoir levels lower
    "monsoon":      ("2024-07-01", "2024-09-30"),  # Wet — high cloud cover, full reservoirs
    "post_monsoon": ("2024-10-01", "2024-12-31"),  # Receding — water levels changing
}


# ---------------------------------------------------------------------------
# RESERVOIR DATABASE
# Bounding boxes: (min_lon, min_lat, max_lon, max_lat)
#
# How to get a bbox for a new reservoir:
#   1. Go to Google Maps, find the reservoir
#   2. Right-click the SW corner → copy coordinates (lat, lon)
#   3. Right-click the NE corner → copy coordinates (lat, lon)
#   4. Format as (min_lon, min_lat, max_lon, max_lat)
#   OR use https://boundingbox.klokantech.com
#
# These are approximate bboxes covering the water body + some shore.
# ---------------------------------------------------------------------------
RESERVOIRS = {
    # ── SOUTH INDIA ──
    "Krishnaraja_Sagar":       (76.53, 12.39, 76.64, 12.47),  # Karnataka, Cauvery
    "Kabini_Reservoir":        (76.28, 11.90, 76.40, 11.98),  # Karnataka, Kabini river
    "Tungabhadra_Dam":         (76.30, 15.25, 76.42, 15.33),  # Karnataka, Tungabhadra
    "Bhadra_Reservoir":        (75.58, 13.68, 75.72, 13.78),  # Karnataka, Bhadra river
    "Nagarjuna_Sagar":         (79.25, 16.50, 79.40, 16.60),  # Telangana, Krishna
    "Srisailam_Dam":           (78.85, 15.80, 78.98, 15.92),  # Andhra Pradesh, Krishna
    "Idukki_Reservoir":        (76.95, 9.80, 77.05, 9.88),    # Kerala, Periyar
    "Mettur_Dam":              (77.75, 11.75, 77.88, 11.85),  # Tamil Nadu, Cauvery
    "Vaigai_Dam":              (77.42, 10.02, 77.52, 10.10),  # Tamil Nadu, Vaigai
    "Periyar_Lake":            (77.12, 9.44, 77.22, 9.52),    # Kerala, Periyar

    # ── WEST INDIA ──
    "Sardar_Sarovar":          (73.70, 21.80, 73.85, 21.92),  # Gujarat, Narmada
    "Ukai_Dam":                (73.55, 21.22, 73.68, 21.32),  # Gujarat, Tapi
    "Koyna_Dam":               (73.72, 17.38, 73.82, 17.46),  # Maharashtra, Koyna
    "Jayakwadi_Dam":           (75.32, 19.42, 75.50, 19.55),  # Maharashtra, Godavari
    "Ujjani_Dam":              (75.05, 18.02, 75.18, 18.12),  # Maharashtra, Bhima

    # ── CENTRAL INDIA ──
    "Gandhi_Sagar":            (75.55, 24.65, 75.72, 24.78),  # Madhya Pradesh, Chambal
    "Bargi_Dam":               (79.90, 22.92, 80.05, 23.05),  # Madhya Pradesh, Narmada
    "Tawa_Reservoir":          (77.82, 22.60, 77.98, 22.72),  # Madhya Pradesh, Tawa
    "Bansagar_Dam":            (81.00, 24.18, 81.15, 24.28),  # Madhya Pradesh, Sone

    # ── NORTH INDIA ──
    "Bhakra_Dam_Gobind_Sagar": (76.40, 31.35, 76.55, 31.48),  # Himachal Pradesh, Sutlej
    "Pong_Dam":                (75.92, 31.92, 76.08, 32.05),  # Himachal Pradesh, Beas
    "Tehri_Dam":               (78.42, 30.35, 78.55, 30.45),  # Uttarakhand, Bhagirathi
    "Rihand_Dam":              (83.00, 24.18, 83.15, 24.30),  # Uttar Pradesh, Rihand

    # ── EAST INDIA ──
    "Hirakud_Dam":             (83.80, 21.48, 84.00, 21.62),  # Odisha, Mahanadi
    "Maithon_Dam":             (86.75, 23.75, 86.88, 23.85),  # Jharkhand, Barakar
    "Panchet_Dam":             (86.72, 23.65, 86.85, 23.72),  # Jharkhand, Damodar
    "Massanjore_Dam":          (87.35, 24.05, 87.48, 24.15),  # Jharkhand, Mayurakshi
    "Tilaiya_Dam":             (85.52, 24.28, 85.62, 24.35),  # Jharkhand, Barakar

    # ── NORTHEAST INDIA ──
    "Umiam_Lake":              (91.85, 25.62, 91.95, 25.70),  # Meghalaya
    "Doyang_Reservoir":        (93.55, 26.25, 93.68, 26.35),  # Nagaland

    # ── NATURAL LAKES (for diversity) ──
    "Chilika_Lake":            (85.20, 19.60, 85.55, 19.82),  # Odisha, largest brackish lake
    "Pulicat_Lake":            (80.25, 13.42, 80.38, 13.60),  # Tamil Nadu / Andhra Pradesh
    "Vembanad_Lake":           (76.30, 9.50, 76.45, 9.72),    # Kerala, backwaters
    "Wular_Lake":              (74.52, 34.32, 74.65, 34.42),  # Jammu & Kashmir
    "Dal_Lake":                (74.82, 34.08, 74.90, 34.14),  # Jammu & Kashmir
    "Loktak_Lake":             (93.75, 24.52, 93.88, 24.62),  # Manipur, floating lake
    "Sambhar_Salt_Lake":       (75.02, 26.85, 75.20, 27.00),  # Rajasthan, salt lake (seasonal)

    # ── RIVERS (wide stretches for variety) ──
    "Ganga_Allahabad":         (81.82, 25.40, 81.92, 25.48),  # Sangam confluence
    "Brahmaputra_Guwahati":    (91.68, 26.15, 91.82, 26.22),  # Wide braided river
    "Godavari_Rajahmundry":    (81.72, 16.92, 81.88, 17.02),  # Wide delta stretch
}

# Total: ~40 water bodies across India
# Mix of: large reservoirs, small dams, natural lakes, brackish lakes,
#          salt lakes, river stretches, and backwaters


# ---------------------------------------------------------------------------
# AUTH — PASSWORD GRANT (required for downloads)
#
# client_credentials tokens work for SEARCH but NOT for DOWNLOAD.
# CDSE's zipper/download API requires a user-bound token.
# ---------------------------------------------------------------------------
def get_access_token(username: str, password: str) -> str:
    """
    Authenticate using password grant with the public CDSE client.
    This produces a user-bound token that works for both search AND download.
    """
    url = (
        "https://identity.dataspace.copernicus.eu"
        "/auth/realms/CDSE/protocol/openid-connect/token"
    )
    data = {
        "client_id":  "cdse-public",        # Public client — no secret needed
        "username":   username,
        "password":   password,
        "grant_type": "password",
    }
    r = requests.post(url, data=data)
    if r.status_code != 200:
        print(f"AUTH FAILED (HTTP {r.status_code})")
        print(f"Response: {r.text[:500]}")
        print()
        print("Check that:")
        print("  1. CDSE_USERNAME is your Copernicus Data Space email")
        print("  2. CDSE_PASSWORD is your Copernicus Data Space password")
        print("  3. You registered at https://dataspace.copernicus.eu")
        r.raise_for_status()
    return r.json()["access_token"]


# ---------------------------------------------------------------------------
# SEARCH
# ---------------------------------------------------------------------------
def search_products(bbox, date_from: str, date_to: str, max_cloud: int, top: int = 5):
    min_lon, min_lat, max_lon, max_lat = bbox
    aoi = (
        f"POLYGON(("
        f"{min_lon} {min_lat},{max_lon} {min_lat},"
        f"{max_lon} {max_lat},{min_lon} {max_lat},"
        f"{min_lon} {min_lat}"
        f"))"
    )
    clauses = [
        "Collection/Name eq 'SENTINEL-2'",
        f"OData.CSC.Intersects(area=geography'SRID=4326;{aoi}')",
        f"ContentDate/Start gt {date_from}T00:00:00.000Z",
        f"ContentDate/Start lt {date_to}T23:59:59.999Z",
        (
            "Attributes/OData.CSC.StringAttribute/any("
            "att:att/Name eq 'productType' and "
            "att/OData.CSC.StringAttribute/Value eq 'S2MSI2A'"
            ")"
        ),
        (
            "Attributes/OData.CSC.DoubleAttribute/any("
            f"att:att/Name eq 'cloudCover' and "
            f"att/OData.CSC.DoubleAttribute/Value le {max_cloud}.00"
            ")"
        ),
    ]
    filter_str = " and ".join(clauses)
    url = "https://catalogue.dataspace.copernicus.eu/odata/v1/Products"
    params = {"$filter": filter_str, "$top": top, "$orderby": "ContentDate/Start desc"}

    r = requests.get(url, params=params)
    if r.status_code != 200:
        return []
    return r.json().get("value", [])


# ---------------------------------------------------------------------------
# DOWNLOAD
# ---------------------------------------------------------------------------
def download_product(product_id: str, product_name: str, token: str, out_dir: str):
    """
    Download a Sentinel-2 product from CDSE.

    Uses the zipper endpoint with full redirect chain handling.
    The token MUST be from a password grant (user-bound), not client_credentials.
    """
    url = f"https://zipper.dataspace.copernicus.eu/odata/v1/Products({product_id})/$value"
    headers = {"Authorization": f"Bearer {token}"}
    out_path = os.path.join(out_dir, f"{product_name}.zip")

    if os.path.exists(out_path):
        size_mb = os.path.getsize(out_path) / 1024 / 1024
        if size_mb > 1:  # Only skip if it's a real file, not a failed download
            print(f"    Already exists: {os.path.basename(out_path)} ({size_mb:.0f} MB)")
            return out_path

    # ── Make request, following redirects manually to preserve auth header ──
    session = requests.Session()

    r = session.get(url, headers=headers, stream=True, allow_redirects=False)

    # Follow up to 5 redirects, re-attaching the auth header each time
    for _ in range(5):
        if r.status_code not in (301, 302, 303, 307, 308):
            break
        redirect_url = r.headers.get("Location")
        if not redirect_url:
            break
        r = session.get(redirect_url, headers=headers, stream=True, allow_redirects=False)

    # ── Check what we got ──
    content_type = r.headers.get("Content-Type", "")

    if r.status_code == 401:
        # Read the error body for diagnosis
        error_body = r.text[:500] if not r.headers.get("Transfer-Encoding") else "(streaming)"
        print(f"    ERROR 401 Unauthorized — token rejected by download server")
        print(f"    Body: {error_body}")
        print(f"    → Make sure you're using password auth, not client_credentials")
        return None

    if r.status_code == 403:
        error_body = r.text[:500] if not r.headers.get("Transfer-Encoding") else "(streaming)"
        print(f"    ERROR 403 Forbidden")
        print(f"    Body: {error_body}")
        return None

    if "json" in content_type.lower():
        # Read the JSON error to show the actual CDSE error message
        try:
            error_json = r.json()
            error_msg = error_json.get("detail", error_json.get("message", str(error_json)[:300]))
            print(f"    ERROR: CDSE returned JSON: {error_msg}")
        except Exception:
            print(f"    ERROR: Got {content_type} (HTTP {r.status_code})")
            print(f"    Body: {r.text[:300]}")
        return None

    if "html" in content_type.lower():
        print(f"    ERROR: Got HTML page instead of ZIP (HTTP {r.status_code})")
        return None

    r.raise_for_status()

    # ── Stream to disk ──
    downloaded = 0
    with open(out_path, "wb") as f:
        for chunk in r.iter_content(chunk_size=8192):
            f.write(chunk)
            downloaded += len(chunk)

    mb = downloaded / 1024 / 1024
    if mb < 1:
        print(f"    WARNING: File only {mb:.2f} MB — likely an error page")
        # Print the contents to diagnose
        try:
            with open(out_path, "r") as f:
                print(f"    File contents: {f.read(300)}")
        except Exception:
            pass
        os.remove(out_path)
        return None

    print(f"    ✓ {os.path.basename(out_path)} ({mb:.0f} MB)")
    return out_path


# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------
def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print("=" * 65)
    print(f"  Multi-Reservoir Sentinel-2 Downloader")
    print(f"  Reservoirs: {len(RESERVOIRS)}")
    print(f"  Seasons:    {list(SEASONS.keys())}")
    print(f"  Max cloud:  {MAX_CLOUD_COVER}%")
    print("=" * 65)

    # Authenticate with password grant (required for downloads)
    token = get_access_token(CDSE_USERNAME, CDSE_PASSWORD)
    print(f"✓ Authenticated\n")

    # Track downloads
    manifest = []
    total_found = 0
    total_downloaded = 0
    token_refresh_counter = 0

    for res_name, bbox in RESERVOIRS.items():
        print(f"\n{'─'*50}")
        print(f"Reservoir: {res_name}")
        print(f"Bbox: {bbox}")

        for season_name, (date_from, date_to) in SEASONS.items():
            print(f"\n  Season: {season_name} ({date_from} → {date_to})")

            # Search
            products = search_products(bbox, date_from, date_to, MAX_CLOUD_COVER,
                                       top=MAX_PRODUCTS_PER_RESERVOIR)

            if not products:
                print(f"    No products found")
                manifest.append({
                    "reservoir": res_name,
                    "season": season_name,
                    "date_from": date_from,
                    "date_to": date_to,
                    "status": "no_products",
                    "product_name": "",
                    "product_id": "",
                    "file_path": "",
                })
                continue

            total_found += len(products)
            print(f"    Found {len(products)} product(s)")

            # Download
            res_dir = os.path.join(OUTPUT_DIR, res_name)
            os.makedirs(res_dir, exist_ok=True)

            for product in products[:MAX_PRODUCTS_PER_RESERVOIR]:
                # Skip offline products
                if product.get("Online") is False:
                    print(f"    Skipping (offline): {product['Name']}")
                    manifest.append({
                        "reservoir": res_name,
                        "season": season_name,
                        "date_from": date_from,
                        "date_to": date_to,
                        "status": "offline",
                        "product_name": product["Name"],
                        "product_id": product["Id"],
                        "file_path": "",
                    })
                    continue

                path = download_product(product["Id"], product["Name"], token, res_dir)
                total_downloaded += 1 if path else 0

                manifest.append({
                    "reservoir": res_name,
                    "season": season_name,
                    "date_from": date_from,
                    "date_to": date_to,
                    "status": "downloaded" if path else "failed",
                    "product_name": product["Name"],
                    "product_id": product["Id"],
                    "file_path": path or "",
                })

            # Refresh token every 20 downloads (tokens expire in ~10 min)
            token_refresh_counter += 1
            if token_refresh_counter % 20 == 0:
                print("\n  Refreshing access token...")
                token = get_access_token(CDSE_USERNAME, CDSE_PASSWORD)

            # Small delay to avoid rate limiting
            time.sleep(1)

    # ── Save manifest ──
    with open(MANIFEST_CSV, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "reservoir", "season", "date_from", "date_to",
            "status", "product_name", "product_id", "file_path"
        ])
        writer.writeheader()
        writer.writerows(manifest)

    # ── Summary ──
    print(f"\n{'='*65}")
    print(f"DOWNLOAD SUMMARY")
    print(f"  Total products found:      {total_found}")
    print(f"  Total products downloaded: {total_downloaded}")
    print(f"  Manifest saved to:         {MANIFEST_CSV}")
    print(f"  Output directory:          {OUTPUT_DIR}")
    print(f"{'='*65}")

    # ── Coverage report ──
    downloaded_reservoirs = set(
        r["reservoir"] for r in manifest if r["status"] == "downloaded"
    )
    missing_reservoirs = set(RESERVOIRS.keys()) - downloaded_reservoirs
    print(f"\n  Reservoirs with data: {len(downloaded_reservoirs)}/{len(RESERVOIRS)}")
    if missing_reservoirs:
        print(f"  Missing: {', '.join(sorted(missing_reservoirs))}")
        print(f"  → Try increasing MAX_CLOUD_COVER or widening date ranges")

    print(f"\nNEXT STEPS:")
    print(f"  1. Run process_sentinel2_water.py on each downloaded scene")
    print(f"  2. This gives you NDWI + water masks for {len(RESERVOIRS)} water bodies")
    print(f"  3. Use cropped images + masks as training data for your VLM")
    print(f"  4. Generate captions like:")
    print(f'     "This satellite image shows Bhakra Dam reservoir in Himachal Pradesh.')
    print(f"      The water body covers approximately 12.5 km² with clear boundaries.")
    print(f'      Surrounding terrain is mountainous with sparse vegetation."')


if __name__ == "__main__":
    main()
