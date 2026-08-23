"""
test_cloud_api.py — Quick test script to send a real GeoTIFF to your Hugging Face Space backend
"""

import requests
import json
from pathlib import Path

# Cloud backend endpoint
API_URL = "https://dinesh-07-dev-eo-gpt-backend.hf.space/analyse"

# Pick a real Sentinel-2 GeoTIFF from your dataset
sample_file = Path(r"c:\SIH\eo_gpt_flood_crop_project\data\geotiff_raw\S2A_East_assam_flood_001.tif")

if not sample_file.exists():
    print(f"Error: Sample file {sample_file} not found!")
    exit(1)

print(f"1. Selected GeoTIFF: {sample_file.name} ({sample_file.stat().st_size / 1e6:.1f} MB)")
print(f"2. Sending request to {API_URL}...")

query_prompt = "Assess the flood extent, identify inundated agricultural zones, and calculate water coverage."

with open(sample_file, "rb") as f:
    files = {"file": (sample_file.name, f, "image/tiff")}
    data = {
        "query": query_prompt,
        "domain": "flood_crop"  # Routes to ATLAS-GOAT/adapter-flood-crop
    }
    
    response = requests.post(API_URL, files=files, data=data, timeout=180)

print(f"\nResponse Status: {response.status_code}")

if response.status_code == 200:
    result = response.json()
    print("\n" + "="*70)
    print("🛰️ EO-GPT ASSESSMENT RESPONSE:")
    print("="*70)
    print(result.get("response_text"))
    print("\n" + "="*70)
    print("📍 EXTRACTED GEOSPATIAL & SPECTRAL METADATA:")
    print("="*70)
    print(json.dumps(result.get("metadata"), indent=2))
    print("\n" + "="*70)
    print("📊 SPECTRAL INDICES (NDVI / NDWI):")
    print("="*70)
    print(json.dumps(result.get("metadata", {}).get("spectral_indices"), indent=2))
    print(f"\nProcessing Time: {result.get('processing_time_ms')} ms")
    print(f"Adapter Used: {result.get('adapter_used')}")
else:
    print("Error:", response.text)
