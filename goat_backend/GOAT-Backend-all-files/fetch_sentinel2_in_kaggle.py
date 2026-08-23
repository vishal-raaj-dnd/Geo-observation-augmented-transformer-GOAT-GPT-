"""
fetch_sentinel2_in_kaggle.py  (OAuth client_credentials version)

Runs INSIDE a Kaggle notebook (Settings > Internet must be ON).
Uses the CDSE_CLIENT_ID / CDSE_CLIENT_SECRET secrets you already added
under Add-ons > Secrets, so no password is ever stored.

FIXES applied:
  1. Download redirect handling — token is re-attached after cross-host redirect
  2. Product type filter uses the proper attribute instead of contains(Name,...)
  3. Response validation — checks content-type before writing to disk
  4. Better logging so you can see what the API actually returns
"""

import os
import json
import requests
from kaggle_secrets import UserSecretsClient

# ---------------------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------------------
OUTPUT_DIR = "/kaggle/working/sentinel2_downloads"

# Reservoirs to fetch: name -> (min_lon, min_lat, max_lon, max_lat)
RESERVOIRS = {
    "Krishnaraja_Sagar": (76.55, 12.40, 76.62, 12.46),
}

DATE_FROM = "2024-06-01"
DATE_TO   = "2024-06-30"
MAX_CLOUD_COVER = 10  # percent

# ---------------------------------------------------------------------------
user_secrets = UserSecretsClient()
CDSE_CLIENT_ID     = user_secrets.get_secret("CDSE_CLIENT_ID")
CDSE_CLIENT_SECRET = user_secrets.get_secret("CDSE_CLIENT_SECRET")


# ── 1. Authentication ──────────────────────────────────────────────────────

def get_access_token(client_id: str, client_secret: str) -> str:
    """
    Authenticate against CDSE Keycloak using an OAuth client.

    IMPORTANT: This requires a *registered OAuth client* in the CDSE dashboard
    (https://dataspace.copernicus.eu → Dashboard → OAuth Clients), NOT just a
    regular username/password account. If you only have a username+password,
    switch to grant_type='password' (see alt version below).
    """
    url = (
        "https://identity.dataspace.copernicus.eu"
        "/auth/realms/CDSE/protocol/openid-connect/token"
    )
    data = {
        "client_id":     client_id,
        "client_secret": client_secret,
        "grant_type":    "client_credentials",
    }
    r = requests.post(url, data=data)

    # ── Diagnose auth failures clearly ──
    if r.status_code != 200:
        print(f"AUTH FAILED (HTTP {r.status_code})")
        print(f"Response: {r.text[:500]}")
        print()
        print("Common causes:")
        print("  • You have a username/password account but not an OAuth client.")
        print("    → Go to https://dataspace.copernicus.eu, Dashboard > OAuth Clients,")
        print("      and register a client. Use its ID and secret.")
        print("  • Or switch to password-based auth (see get_access_token_password below).")
        r.raise_for_status()

    token = r.json()["access_token"]
    print(f"✓ Authenticated (token: {token[:20]}...)")
    return token


def get_access_token_password(username: str, password: str) -> str:
    """
    Alternative: authenticate with username + password instead of OAuth client.
    Use this if you have a regular CDSE account but haven't registered an OAuth client.
    """
    url = (
        "https://identity.dataspace.copernicus.eu"
        "/auth/realms/CDSE/protocol/openid-connect/token"
    )
    data = {
        "client_id":  "cdse-public",
        "username":   username,
        "password":   password,
        "grant_type": "password",
    }
    r = requests.post(url, data=data)
    r.raise_for_status()
    return r.json()["access_token"]


# ── 2. Search ──────────────────────────────────────────────────────────────

def search_products(bbox, date_from: str, date_to: str, max_cloud: int):
    """
    Query the CDSE OData catalog for Sentinel-2 L2A products over a bbox.

    Key fix: use the productType attribute filter instead of contains(Name,...).
    """
    min_lon, min_lat, max_lon, max_lat = bbox

    # WKT polygon — counter-clockwise winding (exterior ring)
    aoi = (
        f"POLYGON(("
        f"{min_lon} {min_lat},"
        f"{max_lon} {min_lat},"
        f"{max_lon} {max_lat},"
        f"{min_lon} {max_lat},"
        f"{min_lon} {min_lat}"
        f"))"
    )

    # Build OData filter — each clause on its own line for readability
    clauses = [
        "Collection/Name eq 'SENTINEL-2'",
        f"OData.CSC.Intersects(area=geography'SRID=4326;{aoi}')",
        f"ContentDate/Start gt {date_from}T00:00:00.000Z",
        f"ContentDate/Start lt {date_to}T23:59:59.999Z",
        # ── Product type: S2MSI2A = Level-2A (surface reflectance) ──
        (
            "Attributes/OData.CSC.StringAttribute/any("
            "att:att/Name eq 'productType' and "
            "att/OData.CSC.StringAttribute/Value eq 'S2MSI2A'"
            ")"
        ),
        # ── Cloud cover ──
        (
            "Attributes/OData.CSC.DoubleAttribute/any("
            f"att:att/Name eq 'cloudCover' and "
            f"att/OData.CSC.DoubleAttribute/Value le {max_cloud}.00"
            ")"
        ),
    ]
    filter_str = " and ".join(clauses)

    url = "https://catalogue.dataspace.copernicus.eu/odata/v1/Products"
    params = {
        "$filter":  filter_str,
        "$top":     10,
        "$orderby": "ContentDate/Start desc",   # newest first
    }

    print(f"  Querying CDSE OData API...")
    r = requests.get(url, params=params)

    # ── Diagnose search failures ──
    if r.status_code != 200:
        print(f"  SEARCH FAILED (HTTP {r.status_code})")
        print(f"  Response: {r.text[:500]}")
        r.raise_for_status()

    results = r.json().get("value", [])

    # ── Print what we found so you can verify ──
    print(f"  Found {len(results)} product(s):")
    for i, p in enumerate(results):
        print(f"    [{i}] {p['Name']}")
        print(f"        ID:   {p['Id']}")
        print(f"        Date: {p.get('ContentDate', {}).get('Start', 'N/A')}")
        # Try to extract cloud cover from the response
        online = p.get("Online", "unknown")
        print(f"        Online: {online}")
    print()

    return results


# ── 3. Download ────────────────────────────────────────────────────────────

def download_product(product_id: str, product_name: str, token: str, out_dir: str):
    """
    Download a product from CDSE.

    KEY FIX: The download URL redirects from catalogue.dataspace.copernicus.eu
    to zipper.dataspace.copernicus.eu. Python's `requests` strips the
    Authorization header on cross-host redirects (RFC 7235 security).

    Solution: disable auto-redirect, capture the 302 Location, and make a
    new request to the redirect URL WITH the token.
    """
    url = (
        f"https://zipper.dataspace.copernicus.eu"
        f"/odata/v1/Products({product_id})/$value"
    )
    headers = {"Authorization": f"Bearer {token}"}
    out_path = os.path.join(out_dir, f"{product_name}.zip")

    print(f"  Downloading {product_name}...")
    print(f"  URL: {url}")

    # ── Step 1: Initial request (may redirect) ──
    session = requests.Session()
    session.headers.update(headers)

    r = session.get(url, stream=True, allow_redirects=False)

    # ── Step 2: Follow redirect manually, keeping the auth header ──
    if r.status_code in (301, 302, 303, 307, 308):
        redirect_url = r.headers.get("Location")
        print(f"  Following redirect → {redirect_url[:80]}...")
        r = session.get(redirect_url, headers=headers, stream=True)

    # ── Step 3: Validate we got a ZIP, not an HTML error page ──
    content_type = r.headers.get("Content-Type", "")
    if "html" in content_type.lower() or "json" in content_type.lower():
        print(f"  ERROR: Got {content_type} instead of a ZIP file.")
        print(f"  Response body: {r.text[:500]}")
        print()
        print("  Common causes:")
        print("    • Token expired (they last ~10 minutes). Re-authenticate.")
        print("    • Product is OFFLINE. Check the 'Online' field in search results.")
        print("    • Product ID is wrong.")
        return None

    r.raise_for_status()

    # ── Step 4: Stream to disk ──
    content_length = r.headers.get("Content-Length")
    if content_length:
        print(f"  File size: {int(content_length) / 1024 / 1024:.1f} MB")

    downloaded = 0
    with open(out_path, "wb") as f:
        for chunk in r.iter_content(chunk_size=8192):
            f.write(chunk)
            downloaded += len(chunk)

    file_size_mb = downloaded / 1024 / 1024
    print(f"  ✓ Downloaded {out_path} ({file_size_mb:.1f} MB)")

    # ── Step 5: Sanity check — a real Sentinel-2 L2A ZIP is 600MB+ ──
    if file_size_mb < 1:
        print(f"  ⚠ WARNING: File is only {file_size_mb:.2f} MB — this is suspiciously small.")
        print(f"    It might be an error page saved as .zip. Open it in a text editor to check.")

    return out_path


# ── 4. Main ────────────────────────────────────────────────────────────────

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # ── Authenticate ──
    token = get_access_token(CDSE_CLIENT_ID, CDSE_CLIENT_SECRET)
    print()

    for reservoir_name, bbox in RESERVOIRS.items():
        print(f"{'='*60}")
        print(f"Reservoir: {reservoir_name}")
        print(f"Bbox: {bbox}")
        print(f"Date range: {DATE_FROM} to {DATE_TO}")
        print(f"Max cloud: {MAX_CLOUD_COVER}%")
        print(f"{'='*60}")

        # ── Search ──
        products = search_products(bbox, DATE_FROM, DATE_TO, MAX_CLOUD_COVER)

        if not products:
            print(f"  No scenes found. Try:")
            print(f"    • Widen the date range")
            print(f"    • Increase MAX_CLOUD_COVER (currently {MAX_CLOUD_COVER}%)")
            print(f"    • Check that the bbox is correct on a map")
            print()
            continue

        # ── Check if the product is online ──
        product = products[0]
        if product.get("Online") is False:
            print(f"  ⚠ Product is OFFLINE (archived). You need to order it first.")
            print(f"    CDSE re-stages offline products within ~24 hours.")
            print(f"    Trying next product...")
            # Try to find an online product
            online_product = None
            for p in products:
                if p.get("Online") is not False:
                    online_product = p
                    break
            if online_product is None:
                print(f"  All products are offline. Try a different date range.")
                continue
            product = online_product

        # ── Download ──
        reservoir_dir = os.path.join(OUTPUT_DIR, reservoir_name)
        os.makedirs(reservoir_dir, exist_ok=True)
        download_product(product["Id"], product["Name"], token, reservoir_dir)

    print()
    print("="*60)
    print("NEXT STEPS:")
    print("  1. Unzip the .zip file")
    print("  2. Find the GRANULE/*/IMG_DATA/R10m/ folder")
    print("  3. Use B03 (Green) and B08 (NIR) to compute NDWI:")
    print("     NDWI = (B03 - B08) / (B03 + B08)")
    print("  4. Threshold NDWI > 0 to get a water mask")
    print("  5. Crop to your reservoir bounding box")
    print("="*60)


if __name__ == "__main__":
    main()
