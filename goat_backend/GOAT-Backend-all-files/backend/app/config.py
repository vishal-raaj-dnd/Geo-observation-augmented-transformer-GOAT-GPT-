"""
config.py

Central configuration for EO-GPT.
All model IDs, adapter repos, and SDL parameters live here.
"""

from dataclasses import dataclass, field


# ---------------------------------------------------------------------------
# Base Model — same one your teammates are training adapters against
# ---------------------------------------------------------------------------
BASE_MODEL_ID = "Qwen/Qwen2.5-VL-3B-Instruct"

# Quantisation: set to True to load in 4-bit (QLoRA) for 16GB GPUs
LOAD_IN_4BIT = True


# ---------------------------------------------------------------------------
# Adapter Repos
#
# Joint flood & crop adapter + individual adapters for other domains
# UPDATE these with your actual HF org/repo names once teammates push.
# Format: "hf-org/repo-name"
# ---------------------------------------------------------------------------
ADAPTER_REPOS = {
    "flood_crop":   "ATLAS-GOAT/adapter-flood-crop",
    "urban":        "ATLAS-GOAT/adapter-urban",
    "environment":  "ATLAS-GOAT/adapter-environment",
    "water":        "ATLAS-GOAT/adapter-water",
    "general":      "ATLAS-GOAT/adapter-general",
}

# Local adapter fallback paths on disk
LOCAL_ADAPTER_PATHS = {
    "flood_crop": r"c:\Users\bdurk\Downloads\SIH\goat_backend\GOAT-Backend-all-files\eo_gpt_flood_crop_project\eo_gpt_flood_crop_adapter",
    "universal":  r"c:\Users\bdurk\Downloads\SIH\eo_gpt_universal_adapter"
}

# Domain alias to adapter mapping
DOMAIN_TO_ADAPTER = {
    "flood":        "flood_crop",
    "crop":         "flood_crop",
    "agriculture":  "flood_crop",
    "flood_crop":   "flood_crop",
    "urban":        "urban",
    "environment":  "environment",
    "water":        "water",
    "general":      "general",
}

# If an adapter repo isn't available yet, the system will skip it gracefully.
# This lets you start the server before all teammates have pushed.


# ---------------------------------------------------------------------------
# Domain Routing — keywords that map user queries to the right adapter
# ---------------------------------------------------------------------------
DOMAIN_KEYWORDS = {
    "flood_crop": [
        "flood", "flooding", "flooded", "inundation", "inundated",
        "submerged", "deluge", "cyclone", "disaster", "relief",
        "rescue", "damage", "waterlogging", "waterlogged",
        "crop", "agriculture", "farm", "farming", "vegetation",
        "ndvi", "harvest", "irrigation", "drought", "soil",
        "healthy", "stress", "yield", "wheat", "rice", "paddy",
    ],
    "urban": [
        "urban", "city", "town", "building", "built-up", "built up",
        "construction", "expansion", "sprawl", "land use", "land-use",
        "settlement", "residential", "commercial", "industrial",
    ],
    "environment": [
        "forest", "deforestation", "tree", "green cover", "wetland",
        "degradation", "erosion", "pollution", "ecosystem",
        "biodiversity", "conservation", "protected",
    ],
    "water": [
        "water body", "water-body", "reservoir", "lake", "river",
        "pond", "dam", "water level", "water spread", "water area",
        "shoreline", "coastal", "ocean", "sea",
    ],
    # "general" is the fallback — no keywords needed
}


# ---------------------------------------------------------------------------
# Sentinel-2 Band Mapping
#
# Sentinel-2 L2A has 13 spectral bands.
# When a GeoTIFF is loaded, we map band indices to their purpose.
# ---------------------------------------------------------------------------
@dataclass
class Sentinel2Bands:
    """Band indices for Sentinel-2 L2A (0-indexed)."""
    B01_COASTAL:  int = 0    # 60m  — Coastal aerosol
    B02_BLUE:     int = 1    # 10m  — Blue
    B03_GREEN:    int = 2    # 10m  — Green
    B04_RED:      int = 3    # 10m  — Red
    B05_REDEDGE1: int = 4    # 20m  — Vegetation Red Edge 1
    B06_REDEDGE2: int = 5    # 20m  — Vegetation Red Edge 2
    B07_REDEDGE3: int = 6    # 20m  — Vegetation Red Edge 3
    B08_NIR:      int = 7    # 10m  — Near-Infrared
    B08A_NARROW_NIR: int = 8 # 20m  — Narrow NIR
    B09_WATER_VAPOUR: int = 9  # 60m  — Water vapour
    B10_CIRRUS:   int = 10   # 60m  — SWIR – Cirrus
    B11_SWIR1:    int = 11   # 20m  — SWIR 1
    B12_SWIR2:    int = 12   # 20m  — SWIR 2

    # Convenience groupings
    @property
    def rgb_indices(self) -> list[int]:
        """Red, Green, Blue band indices for true-colour composite."""
        return [self.B04_RED, self.B03_GREEN, self.B02_BLUE]

    @property
    def false_colour_indices(self) -> list[int]:
        """NIR, Red, Green — standard false-colour composite."""
        return [self.B08_NIR, self.B04_RED, self.B03_GREEN]


S2_BANDS = Sentinel2Bands()


# ---------------------------------------------------------------------------
# SDL Parameters
# ---------------------------------------------------------------------------
SDL_TARGET_SIZE = (224, 224)   # Resize output for vision encoder input
SDL_NDWI_WATER_THRESHOLD = 0.0
SDL_NDVI_HEALTHY_THRESHOLD = 0.4
SDL_NDVI_SPARSE_THRESHOLD = 0.2


# ---------------------------------------------------------------------------
# Inference Parameters
# ---------------------------------------------------------------------------
MAX_NEW_TOKENS = 1024
TEMPERATURE = 0.7
TOP_P = 0.9
CONFIDENCE_THRESHOLD = 0.3    # Below this, flag "insufficient evidence"


# ---------------------------------------------------------------------------
# Server
# ---------------------------------------------------------------------------
HOST = "0.0.0.0"
PORT = 8000
