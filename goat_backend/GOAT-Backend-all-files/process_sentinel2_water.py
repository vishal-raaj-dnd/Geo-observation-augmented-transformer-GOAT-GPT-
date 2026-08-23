"""
process_sentinel2_water.py

Post-processing pipeline for Sentinel-2 L2A data:
  1. Unzip the downloaded product
  2. Find and load B03 (Green, 10m) and B08 (NIR, 10m) bands
  3. Crop to the reservoir bounding box
  4. Compute NDWI (Normalized Difference Water Index)
  5. Threshold to generate a water mask
  6. Calculate water area in km²
  7. Save outputs (cropped bands, NDWI raster, water mask, preview PNG)

Runs inside Kaggle. Install rasterio if needed:
  !pip install rasterio
"""

import os
import glob
import zipfile
import numpy as np

try:
    import rasterio
    from rasterio.windows import from_bounds
    from rasterio.transform import array_bounds
except ImportError:
    print("Installing rasterio...")
    os.system("pip install rasterio")
    import rasterio
    from rasterio.windows import from_bounds
    from rasterio.transform import array_bounds

try:
    import matplotlib.pyplot as plt
except ImportError:
    print("Installing matplotlib...")
    os.system("pip install matplotlib")
    import matplotlib.pyplot as plt


# ---------------------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------------------
DOWNLOAD_DIR = "/kaggle/working/sentinel2_downloads"
OUTPUT_DIR   = "/kaggle/working/water_analysis"

# Same reservoir dict as the fetch script
RESERVOIRS = {
    "Krishnaraja_Sagar": (76.55, 12.40, 76.62, 12.46),
}

# NDWI threshold: pixels above this are classified as water
# Standard threshold is 0.0; adjust if needed (0.1–0.3 for stricter)
NDWI_THRESHOLD = 0.0


# ---------------------------------------------------------------------------
# 1. Unzip
# ---------------------------------------------------------------------------
def unzip_product(zip_path: str, extract_dir: str) -> str:
    """Unzip a Sentinel-2 product and return the extracted .SAFE directory."""
    print(f"  Unzipping {os.path.basename(zip_path)}...")
    with zipfile.ZipFile(zip_path, "r") as z:
        z.extractall(extract_dir)

    # The extracted folder is named like S2B_MSIL2A_...T..._.SAFE
    safe_dirs = glob.glob(os.path.join(extract_dir, "*.SAFE"))
    if not safe_dirs:
        # Sometimes nested one level
        safe_dirs = glob.glob(os.path.join(extract_dir, "*", "*.SAFE"))

    if not safe_dirs:
        print(f"  ERROR: No .SAFE directory found after extraction.")
        print(f"  Contents: {os.listdir(extract_dir)}")
        return None

    print(f"  ✓ Extracted to {safe_dirs[0]}")
    return safe_dirs[0]


# ---------------------------------------------------------------------------
# 2. Find bands
# ---------------------------------------------------------------------------
def find_band(safe_dir: str, band: str, resolution: str = "R10m") -> str:
    """
    Find a specific band file within the .SAFE directory structure.

    Sentinel-2 L2A structure:
      .SAFE/GRANULE/*/IMG_DATA/R10m/*_B03_10m.jp2
      .SAFE/GRANULE/*/IMG_DATA/R10m/*_B08_10m.jp2
      .SAFE/GRANULE/*/IMG_DATA/R20m/*_B11_20m.jp2  (for MNDWI)
    """
    # Search pattern for the band
    patterns = [
        os.path.join(safe_dir, "GRANULE", "*", "IMG_DATA", resolution, f"*_{band}_*.jp2"),
        os.path.join(safe_dir, "GRANULE", "*", "IMG_DATA", resolution, f"*_{band}_*.tif"),
        # Some products use a flat structure
        os.path.join(safe_dir, "GRANULE", "*", "IMG_DATA", f"*_{band}.jp2"),
    ]

    for pattern in patterns:
        matches = glob.glob(pattern)
        if matches:
            print(f"  Found {band}: {os.path.basename(matches[0])}")
            return matches[0]

    print(f"  ERROR: Could not find band {band} in {safe_dir}")
    print(f"  Searched patterns: {patterns}")
    return None


# ---------------------------------------------------------------------------
# 3. Crop to bounding box
# ---------------------------------------------------------------------------
def crop_band_to_bbox(band_path: str, bbox: tuple) -> tuple:
    """
    Read a band file and crop it to the given bounding box.

    Args:
        band_path: Path to the JP2/TIF band file
        bbox: (min_lon, min_lat, max_lon, max_lat) in EPSG:4326

    Returns:
        (cropped_array, transform, crs) or (None, None, None) on failure
    """
    min_lon, min_lat, max_lon, max_lat = bbox

    with rasterio.open(band_path) as src:
        # The band is likely in UTM projection, not lat/lon
        # We need to reproject the bbox to the band's CRS
        from rasterio.warp import transform_bounds

        # Transform bbox from EPSG:4326 to the band's CRS
        band_crs = src.crs
        left, bottom, right, top = transform_bounds(
            "EPSG:4326", band_crs,
            min_lon, min_lat, max_lon, max_lat
        )

        # Create a window from the transformed bounds
        window = from_bounds(left, bottom, right, top, src.transform)

        # Read the data within the window
        try:
            data = src.read(1, window=window).astype(np.float32)
            transform = src.window_transform(window)
            print(f"  Cropped to {data.shape[1]}x{data.shape[0]} pixels")
            return data, transform, band_crs
        except Exception as e:
            print(f"  ERROR cropping: {e}")
            print(f"  Band bounds: {src.bounds}")
            print(f"  Requested bounds: ({left}, {bottom}, {right}, {top})")
            return None, None, None


# ---------------------------------------------------------------------------
# 4. Compute NDWI
# ---------------------------------------------------------------------------
def compute_ndwi(green: np.ndarray, nir: np.ndarray) -> np.ndarray:
    """
    Compute NDWI (Normalized Difference Water Index).

    NDWI = (Green - NIR) / (Green + NIR)

    Values:
      > 0  → likely water
      < 0  → likely land/vegetation
      ~1   → deep/clear water
      ~-1  → dense vegetation
    """
    # Avoid division by zero
    denominator = green + nir
    ndwi = np.where(
        denominator > 0,
        (green - nir) / denominator,
        0.0
    )
    return ndwi.astype(np.float32)


# ---------------------------------------------------------------------------
# 5. Generate water mask and calculate area
# ---------------------------------------------------------------------------
def water_mask_and_area(ndwi: np.ndarray, threshold: float, pixel_size_m: float) -> tuple:
    """
    Create a binary water mask and calculate water area.

    Args:
        ndwi: NDWI array
        threshold: NDWI values above this are water
        pixel_size_m: Ground sampling distance in meters

    Returns:
        (water_mask, water_area_km2, water_percentage)
    """
    water_mask = (ndwi > threshold).astype(np.uint8)

    total_pixels = ndwi.size
    water_pixels = water_mask.sum()
    water_percentage = (water_pixels / total_pixels) * 100 if total_pixels > 0 else 0

    # Each pixel covers pixel_size_m × pixel_size_m
    pixel_area_km2 = (pixel_size_m * pixel_size_m) / 1_000_000
    water_area_km2 = water_pixels * pixel_area_km2

    return water_mask, water_area_km2, water_percentage


# ---------------------------------------------------------------------------
# 6. Save outputs
# ---------------------------------------------------------------------------
def save_raster(data: np.ndarray, transform, crs, out_path: str, dtype="float32"):
    """Save a single-band raster to GeoTIFF."""
    with rasterio.open(
        out_path, "w",
        driver="GTiff",
        height=data.shape[0],
        width=data.shape[1],
        count=1,
        dtype=dtype,
        crs=crs,
        transform=transform,
    ) as dst:
        dst.write(data, 1)
    print(f"  Saved: {out_path}")


def save_preview(green: np.ndarray, ndwi: np.ndarray, water_mask: np.ndarray,
                 reservoir_name: str, water_area_km2: float, water_pct: float,
                 out_path: str):
    """Save a 3-panel preview image: RGB crop, NDWI heatmap, water mask."""
    fig, axes = plt.subplots(1, 3, figsize=(18, 6))

    # Panel 1: Green band (as grayscale proxy for RGB)
    vmin, vmax = np.percentile(green[green > 0], [2, 98]) if green.any() else (0, 1)
    axes[0].imshow(green, cmap="gray", vmin=vmin, vmax=vmax)
    axes[0].set_title(f"{reservoir_name}\nGreen Band (B03)")
    axes[0].axis("off")

    # Panel 2: NDWI
    im = axes[1].imshow(ndwi, cmap="RdYlBu", vmin=-0.5, vmax=0.5)
    axes[1].set_title("NDWI\n(blue = water, red = land)")
    axes[1].axis("off")
    plt.colorbar(im, ax=axes[1], fraction=0.046)

    # Panel 3: Water mask
    axes[2].imshow(water_mask, cmap="Blues", vmin=0, vmax=1)
    axes[2].set_title(f"Water Mask\n{water_area_km2:.2f} km² ({water_pct:.1f}%)")
    axes[2].axis("off")

    plt.suptitle(f"Water Analysis: {reservoir_name}", fontsize=14, fontweight="bold")
    plt.tight_layout()
    plt.savefig(out_path, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"  Saved preview: {out_path}")


# ---------------------------------------------------------------------------
# 7. Main pipeline
# ---------------------------------------------------------------------------
def process_reservoir(reservoir_name: str, bbox: tuple, safe_dir: str, out_dir: str):
    """Run the full water analysis pipeline for one reservoir."""
    print(f"\n{'─'*50}")
    print(f"Processing: {reservoir_name}")
    print(f"{'─'*50}")

    reservoir_out = os.path.join(out_dir, reservoir_name)
    os.makedirs(reservoir_out, exist_ok=True)

    # ── Find bands ──
    b03_path = find_band(safe_dir, "B03", "R10m")
    b08_path = find_band(safe_dir, "B08", "R10m")
    if not b03_path or not b08_path:
        print("  Cannot proceed without B03 and B08.")
        return None

    # ── Crop to bbox ──
    print("  Cropping B03 (Green)...")
    green, transform, crs = crop_band_to_bbox(b03_path, bbox)
    print("  Cropping B08 (NIR)...")
    nir, _, _ = crop_band_to_bbox(b08_path, bbox)

    if green is None or nir is None:
        print("  ERROR: Cropping failed. The reservoir might be outside this Sentinel-2 tile.")
        return None

    # ── Compute NDWI ──
    print("  Computing NDWI...")
    ndwi = compute_ndwi(green, nir)

    # ── Water mask and area ──
    # B03 and B08 at R10m means each pixel = 10m × 10m
    water_mask, water_area_km2, water_pct = water_mask_and_area(ndwi, NDWI_THRESHOLD, 10.0)

    print(f"  ──────────────────────────────")
    print(f"  RESULTS for {reservoir_name}:")
    print(f"    Water area:       {water_area_km2:.2f} km²")
    print(f"    Water percentage: {water_pct:.1f}%")
    print(f"    NDWI range:       [{ndwi.min():.3f}, {ndwi.max():.3f}]")
    print(f"  ──────────────────────────────")

    # ── Save outputs ──
    save_raster(ndwi, transform, crs, os.path.join(reservoir_out, "ndwi.tif"))
    save_raster(water_mask, transform, crs,
                os.path.join(reservoir_out, "water_mask.tif"), dtype="uint8")
    save_raster(green, transform, crs, os.path.join(reservoir_out, "B03_cropped.tif"))
    save_raster(nir, transform, crs, os.path.join(reservoir_out, "B08_cropped.tif"))

    save_preview(
        green, ndwi, water_mask,
        reservoir_name, water_area_km2, water_pct,
        os.path.join(reservoir_out, "preview.png")
    )

    return {
        "reservoir": reservoir_name,
        "water_area_km2": water_area_km2,
        "water_percentage": water_pct,
        "ndwi_min": float(ndwi.min()),
        "ndwi_max": float(ndwi.max()),
        "image_shape": list(green.shape),
    }


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Find all downloaded ZIPs
    for reservoir_name, bbox in RESERVOIRS.items():
        reservoir_dl_dir = os.path.join(DOWNLOAD_DIR, reservoir_name)
        if not os.path.exists(reservoir_dl_dir):
            print(f"No downloads found for {reservoir_name} in {reservoir_dl_dir}")
            continue

        zip_files = glob.glob(os.path.join(reservoir_dl_dir, "*.zip"))
        if not zip_files:
            print(f"No ZIP files found in {reservoir_dl_dir}")
            continue

        for zip_path in zip_files:
            # Unzip
            extract_dir = os.path.join(reservoir_dl_dir, "extracted")
            safe_dir = unzip_product(zip_path, extract_dir)
            if not safe_dir:
                continue

            # Process
            result = process_reservoir(reservoir_name, bbox, safe_dir, OUTPUT_DIR)
            if result:
                print(f"\n✓ {reservoir_name} complete: {result['water_area_km2']:.2f} km² water")

    print(f"\nAll outputs saved to: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
