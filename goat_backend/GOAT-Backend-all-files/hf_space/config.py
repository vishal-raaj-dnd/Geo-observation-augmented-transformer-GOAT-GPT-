"""
config.py — Configuration for EO-GPT Space
"""

from dataclasses import dataclass

BASE_MODEL_ID = "Qwen/Qwen2.5-VL-3B-Instruct"
LOAD_IN_4BIT = False  # ZeroGPU provides native A100 VRAM, bfloat16/float16 is faster and more stable

ADAPTER_REPOS = {
    "flood_crop":   "ATLAS-GOAT/adapter-flood-crop",
    "urban":        "ATLAS-GOAT/adapter-urban",
    "environment":  "ATLAS-GOAT/adapter-environment",
    "water":        "ATLAS-GOAT/adapter-water",
    "general":      "ATLAS-GOAT/adapter-general",
}

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
}

@dataclass
class Sentinel2Bands:
    B01_COASTAL:  int = 0
    B02_BLUE:     int = 1
    B03_GREEN:    int = 2
    B04_RED:      int = 3
    B05_REDEDGE1: int = 4
    B06_REDEDGE2: int = 5
    B07_REDEDGE3: int = 6
    B08_NIR:      int = 7
    B08A_NARROW_NIR: int = 8
    B09_WATER_VAPOUR: int = 9
    B10_CIRRUS:   int = 10
    B11_SWIR1:    int = 11
    B12_SWIR2:    int = 12

    @property
    def rgb_indices(self) -> list[int]:
        return [self.B04_RED, self.B03_GREEN, self.B02_BLUE]

    @property
    def false_colour_indices(self) -> list[int]:
        return [self.B08_NIR, self.B04_RED, self.B03_GREEN]

S2_BANDS = Sentinel2Bands()

SDL_TARGET_SIZE = (224, 224)
SDL_NDWI_WATER_THRESHOLD = 0.0
SDL_NDVI_HEALTHY_THRESHOLD = 0.4
SDL_NDVI_SPARSE_THRESHOLD = 0.2

MAX_NEW_TOKENS = 1024
TEMPERATURE = 0.7
TOP_P = 0.9
CONFIDENCE_THRESHOLD = 0.3
