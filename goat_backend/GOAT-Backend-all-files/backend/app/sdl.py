"""
sdl.py — Spectral Decomposition Layer

The SDL sits between raw satellite input and the vision model.
It handles:
  1. Reading multispectral GeoTIFFs (up to 13 bands)
  2. Extracting RGB bands for the vision encoder
  3. Computing spectral indices (NDVI, NDWI, NDBI) from non-RGB bands
  4. Extracting geographic coordinates and metadata
  5. Building a text context string from the indices + metadata

The vision model (Qwen2.5-VL) only sees the RGB image.
The spectral indices and metadata are converted to TEXT and prepended
to the user's query so the LLM can reason about them without needing
to "see" NIR/SWIR bands directly.

This is a DETERMINISTIC preprocessing module — no learnable parameters.
"""

import io
import logging
import tempfile
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional, Any

import numpy as np

try:
    import rasterio
    from rasterio.warp import transform_bounds
    from rasterio.transform import array_bounds
    from rasterio.enums import Resampling
    RASTERIO_AVAILABLE = True
except ImportError:
    rasterio = None
    RASTERIO_AVAILABLE = False

from PIL import Image

from .config import (
    S2_BANDS,
    SDL_TARGET_SIZE,
    SDL_NDWI_WATER_THRESHOLD,
    SDL_NDVI_HEALTHY_THRESHOLD,
    SDL_NDVI_SPARSE_THRESHOLD,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data classes for SDL outputs
# ---------------------------------------------------------------------------
@dataclass
class GeoMetadata:
    """Geographic and sensor metadata extracted from the image."""
    crs: Optional[str] = None
    bbox_wgs84: Optional[tuple[float, float, float, float]] = None  # (W, S, E, N)
    center_lat: Optional[float] = None
    center_lon: Optional[float] = None
    acquisition_date: Optional[str] = None
    pixel_size_m: Optional[float] = None
    num_bands: int = 0
    width: int = 0
    height: int = 0
    sensor: Optional[str] = None
    band_names: list[str] = field(default_factory=list)


@dataclass
class SpectralIndices:
    """Computed spectral indices from non-RGB bands."""
    ndvi: Optional[np.ndarray] = None         # Vegetation health
    ndwi: Optional[np.ndarray] = None         # Water detection
    ndbi: Optional[np.ndarray] = None         # Built-up detection
    ndvi_mean: Optional[float] = None
    ndwi_mean: Optional[float] = None
    ndbi_mean: Optional[float] = None
    water_percentage: Optional[float] = None  # % of pixels classified as water
    vegetation_percentage: Optional[float] = None
    builtup_percentage: Optional[float] = None


@dataclass
class SDLOutput:
    """
    Complete output of the Spectral Decomposition Layer.
    This is what gets passed downstream to the inference engine.
    """
    rgb_image: Image.Image           # PIL Image — goes to Qwen2.5-VL processor
    text_context: str                # Prepended to user's query as text
    metadata: GeoMetadata            # For reports and evidence overlays
    indices: SpectralIndices          # For evidence overlays and analysis
    is_multispectral: bool           # True if input had >3 bands
    original_shape: tuple[int, ...]  # Original image dimensions


# ---------------------------------------------------------------------------
# The Spectral Decomposition Layer
# ---------------------------------------------------------------------------
class SpectralDecompositionLayer:
    """
    Preprocesses raw satellite imagery for the EO-GPT pipeline.

    Workflow:
        Raw GeoTIFF (up to 13 bands)
            → Extract RGB for vision encoder
            → Compute spectral indices from NIR/SWIR
            → Extract coordinates and metadata
            → Build text context string
            → Return SDLOutput

    The vision model only sees RGB. Everything else becomes text context.
    """

    def __init__(
        self,
        target_size: tuple[int, int] = SDL_TARGET_SIZE,
        ndwi_threshold: float = SDL_NDWI_WATER_THRESHOLD,
        ndvi_healthy: float = SDL_NDVI_HEALTHY_THRESHOLD,
        ndvi_sparse: float = SDL_NDVI_SPARSE_THRESHOLD,
    ):
        self.target_size = target_size
        self.ndwi_threshold = ndwi_threshold
        self.ndvi_healthy = ndvi_healthy
        self.ndvi_sparse = ndvi_sparse

    def process(
        self,
        image_input,
        domain: Optional[str] = None,
        acquisition_date: Optional[str] = None,
    ) -> SDLOutput:
        """
        Process a satellite image through the SDL.

        Args:
            image_input: One of:
                - str / Path: path to a GeoTIFF, TIFF, PNG, or JPEG file
                - bytes: raw file bytes (uploaded via API)
                - PIL.Image.Image: already-loaded image (RGB only, no bands)
            domain: Optional domain hint (e.g., "flood") — used to prioritise
                    which indices to compute and what context to build.
            acquisition_date: Optional override if date isn't in the file.

        Returns:
            SDLOutput with RGB image, text context, metadata, and indices.
        """
        # Route to the appropriate loader
        if isinstance(image_input, Image.Image):
            return self._process_pil_image(image_input, domain, acquisition_date)
        elif isinstance(image_input, bytes):
            return self._process_bytes(image_input, domain, acquisition_date)
        elif isinstance(image_input, (str, Path)):
            return self._process_file(str(image_input), domain, acquisition_date)
        else:
            raise TypeError(
                f"Unsupported input type: {type(image_input)}. "
                "Expected str, Path, bytes, or PIL.Image."
            )

    def _process_pil_image(
        self,
        img: Image.Image,
        domain: Optional[str],
        acquisition_date: Optional[str],
    ) -> SDLOutput:
        """Process a plain PIL image (RGB only, no spectral bands)."""
        img_rgb = img.convert("RGB")
        original_shape = (img_rgb.height, img_rgb.width, 3)

        metadata = GeoMetadata(
            num_bands=3,
            width=img_rgb.width,
            height=img_rgb.height,
            acquisition_date=acquisition_date,
        )

        text_context = self._build_text_context(
            metadata=metadata,
            indices=SpectralIndices(),
            domain=domain,
            is_multispectral=False,
        )

        return SDLOutput(
            rgb_image=img_rgb,
            text_context=text_context,
            metadata=metadata,
            indices=SpectralIndices(),
            is_multispectral=False,
            original_shape=original_shape,
        )

    def _process_bytes(
        self,
        data: bytes,
        domain: Optional[str],
        acquisition_date: Optional[str],
    ) -> SDLOutput:
        """Process raw bytes — write to temp file, then process as file."""
        # Try opening with rasterio first (handles GeoTIFF)
        with tempfile.NamedTemporaryFile(suffix=".tif", delete=False) as tmp:
            tmp.write(data)
            tmp_path = tmp.name

        try:
            if RASTERIO_AVAILABLE:
                return self._process_file(tmp_path, domain, acquisition_date)
            else:
                img = Image.open(io.BytesIO(data))
                return self._process_pil_image(img, domain, acquisition_date)
        except Exception:
            img = Image.open(io.BytesIO(data))
            return self._process_pil_image(img, domain, acquisition_date)
        finally:
            Path(tmp_path).unlink(missing_ok=True)

    def _process_file(
        self,
        file_path: str,
        domain: Optional[str],
        acquisition_date: Optional[str],
    ) -> SDLOutput:
        """
        Process a file on disk. This is the main processing path.
        Handles GeoTIFFs with multiple bands, plain TIFFs, PNGs, JPEGs.
        """
        try:
            if RASTERIO_AVAILABLE:
                return self._process_geotiff(file_path, domain, acquisition_date)
            else:
                img = Image.open(file_path)
                return self._process_pil_image(img, domain, acquisition_date)
        except Exception:
            # Fall back to PIL for non-geospatial formats
            logger.info(f"Not a rasterio-readable file, falling back to PIL: {file_path}")
            img = Image.open(file_path)
            return self._process_pil_image(img, domain, acquisition_date)

    def _process_geotiff(
        self,
        file_path: str,
        domain: Optional[str],
        acquisition_date: Optional[str],
    ) -> SDLOutput:
        """
        Core processing: read a GeoTIFF, extract RGB, compute indices,
        extract metadata.
        """
        if not RASTERIO_AVAILABLE:
            img = Image.open(file_path)
            return self._process_pil_image(img, domain, acquisition_date)

        with rasterio.open(file_path) as src:
            num_bands = src.count
            original_shape = (src.height, src.width, num_bands)

            logger.info(
                f"SDL: Opened {file_path} — {src.width}×{src.height}, "
                f"{num_bands} bands, CRS={src.crs}"
            )

            # ── Read all bands ──────────────────────────────────────
            all_bands = src.read()  # shape: (num_bands, H, W)

            # ── Extract metadata ────────────────────────────────────
            metadata = self._extract_metadata(src, acquisition_date)

            # ── Extract RGB ─────────────────────────────────────────
            rgb_array = self._extract_rgb(all_bands, num_bands)

            # ── Compute spectral indices (if multispectral) ─────────
            is_multispectral = num_bands > 3
            if is_multispectral:
                indices = self._compute_spectral_indices(all_bands, num_bands)
            else:
                indices = SpectralIndices()

        # ── Convert RGB array to PIL Image ──────────────────────────
        rgb_image = self._array_to_pil(rgb_array)

        # ── Build text context ──────────────────────────────────────
        text_context = self._build_text_context(
            metadata=metadata,
            indices=indices,
            domain=domain,
            is_multispectral=is_multispectral,
        )

        return SDLOutput(
            rgb_image=rgb_image,
            text_context=text_context,
            metadata=metadata,
            indices=indices,
            is_multispectral=is_multispectral,
            original_shape=original_shape,
        )

    # -------------------------------------------------------------------
    # Internal helpers
    # -------------------------------------------------------------------

    def _extract_metadata(
        self,
        src: Any,
        acquisition_date: Optional[str],
    ) -> GeoMetadata:
        """Extract geographic and sensor metadata from the rasterio dataset."""
        meta = GeoMetadata(
            num_bands=src.count,
            width=src.width,
            height=src.height,
        )

        # CRS
        if src.crs:
            meta.crs = str(src.crs)

            # Bounding box in WGS84 (EPSG:4326)
            try:
                west, south, east, north = transform_bounds(
                    src.crs, "EPSG:4326",
                    src.bounds.left, src.bounds.bottom,
                    src.bounds.right, src.bounds.top,
                )
                meta.bbox_wgs84 = (west, south, east, north)
                meta.center_lat = (south + north) / 2
                meta.center_lon = (west + east) / 2
            except Exception as e:
                logger.warning(f"Could not transform bounds to WGS84: {e}")

        # Pixel size
        if src.transform:
            meta.pixel_size_m = abs(src.transform[0])

        # Acquisition date — try file metadata, fall back to argument
        if acquisition_date:
            meta.acquisition_date = acquisition_date
        else:
            # Some GeoTIFFs store date in tags
            tags = src.tags()
            for key in ["TIFFTAG_DATETIME", "datetime", "acquisition_date", "DATE_ACQUIRED"]:
                if key in tags:
                    meta.acquisition_date = tags[key]
                    break

        # Band names from descriptions
        meta.band_names = [
            src.descriptions[i] or f"Band {i+1}"
            for i in range(src.count)
            if src.descriptions and i < len(src.descriptions)
        ]

        # Sensor detection from filename or tags
        file_name = Path(src.name).stem.upper()
        if "S2" in file_name or "SENTINEL" in file_name:
            meta.sensor = "Sentinel-2"
        elif "LC08" in file_name or "LANDSAT" in file_name:
            meta.sensor = "Landsat-8"
        elif "RESOURCESAT" in file_name or "LISS" in file_name:
            meta.sensor = "Resourcesat (LISS)"

        return meta

    def _extract_rgb(
        self,
        all_bands: np.ndarray,
        num_bands: int,
    ) -> np.ndarray:
        """
        Extract RGB channels from the raw band data.

        For multispectral data (e.g., Sentinel-2 with 13 bands):
            RGB = Band 4 (Red), Band 3 (Green), Band 2 (Blue)

        For 3-band images (already RGB):
            Use as-is.

        For 4-band (RGBA):
            Drop the alpha channel.

        Returns:
            np.ndarray of shape (3, H, W), float32, values in [0, 1].
        """
        if num_bands >= 13:
            # Sentinel-2 style: use configured band indices
            r_idx, g_idx, b_idx = S2_BANDS.rgb_indices
            rgb = all_bands[[r_idx, g_idx, b_idx]].astype(np.float32)
        elif num_bands >= 4:
            # 4+ bands but not full Sentinel-2 — assume first 3 are RGB
            # (common for stacked GeoTIFFs and Resourcesat)
            rgb = all_bands[:3].astype(np.float32)
        elif num_bands == 3:
            rgb = all_bands.astype(np.float32)
        elif num_bands == 1:
            # Panchromatic / grayscale — repeat to make 3 channels
            rgb = np.repeat(all_bands.astype(np.float32), 3, axis=0)
        else:
            # 2 bands — unusual, take what we have and zero-pad
            rgb = np.zeros((3, all_bands.shape[1], all_bands.shape[2]), dtype=np.float32)
            rgb[:num_bands] = all_bands.astype(np.float32)

        # Normalise to [0, 1]
        rgb = self._normalise_to_01(rgb)

        return rgb

    def _normalise_to_01(self, array: np.ndarray) -> np.ndarray:
        """
        Normalise an array to [0, 1] range.
        Handles Sentinel-2 reflectance values (0–10000) and 8-bit (0–255).
        """
        arr = array.astype(np.float32)
        arr_max = np.percentile(arr, 98)  # Use 98th percentile to avoid outliers
        arr_min = np.percentile(arr, 2)

        if arr_max == arr_min:
            return np.zeros_like(arr)

        arr = (arr - arr_min) / (arr_max - arr_min)
        return np.clip(arr, 0.0, 1.0)

    def _compute_spectral_indices(
        self,
        all_bands: np.ndarray,
        num_bands: int,
    ) -> SpectralIndices:
        """
        Compute spectral indices from non-RGB bands.

        These indices are NOT passed to the vision model — they are
        converted to text summaries and prepended to the user's query.

        NDVI = (NIR - Red) / (NIR + Red)       → vegetation health
        NDWI = (Green - NIR) / (Green + NIR)    → water detection
        NDBI = (SWIR1 - NIR) / (SWIR1 + NIR)   → built-up areas
        """
        indices = SpectralIndices()
        eps = 1e-10  # Avoid division by zero

        # We need at least the NIR band (B8, index 7)
        if num_bands <= 7:
            return indices

        nir = all_bands[S2_BANDS.B08_NIR].astype(np.float64)
        red = all_bands[S2_BANDS.B04_RED].astype(np.float64)
        green = all_bands[S2_BANDS.B03_GREEN].astype(np.float64)

        # ── NDVI ────────────────────────────────────────────────
        indices.ndvi = (nir - red) / (nir + red + eps)
        indices.ndvi = np.clip(indices.ndvi, -1.0, 1.0).astype(np.float32)
        indices.ndvi_mean = float(np.nanmean(indices.ndvi))

        healthy_mask = indices.ndvi > self.ndvi_healthy
        indices.vegetation_percentage = float(np.nanmean(healthy_mask) * 100)

        # ── NDWI ────────────────────────────────────────────────
        indices.ndwi = (green - nir) / (green + nir + eps)
        indices.ndwi = np.clip(indices.ndwi, -1.0, 1.0).astype(np.float32)
        indices.ndwi_mean = float(np.nanmean(indices.ndwi))

        water_mask = indices.ndwi > self.ndwi_threshold
        indices.water_percentage = float(np.nanmean(water_mask) * 100)

        # ── NDBI (requires SWIR, band 11) ───────────────────────
        if num_bands > S2_BANDS.B11_SWIR1:
            swir1 = all_bands[S2_BANDS.B11_SWIR1].astype(np.float64)
            indices.ndbi = (swir1 - nir) / (swir1 + nir + eps)
            indices.ndbi = np.clip(indices.ndbi, -1.0, 1.0).astype(np.float32)
            indices.ndbi_mean = float(np.nanmean(indices.ndbi))

            builtup_mask = indices.ndbi > 0.0
            indices.builtup_percentage = float(np.nanmean(builtup_mask) * 100)

        return indices

    def _array_to_pil(self, rgb_array: np.ndarray) -> Image.Image:
        """
        Convert a (3, H, W) float32 array in [0, 1] to a PIL RGB image.
        """
        # (3, H, W) → (H, W, 3)
        rgb_hwc = np.transpose(rgb_array, (1, 2, 0))
        # Scale to 0–255
        rgb_uint8 = (rgb_hwc * 255).astype(np.uint8)
        return Image.fromarray(rgb_uint8, mode="RGB")

    def _build_text_context(
        self,
        metadata: GeoMetadata,
        indices: SpectralIndices,
        domain: Optional[str],
        is_multispectral: bool,
    ) -> str:
        """
        Convert metadata and spectral indices into a text string
        that gets prepended to the user's query.

        The LLM can reason about NIR/SWIR information through this
        text even though it only "sees" the RGB image.
        """
        parts = []

        # ── Geographic context ──────────────────────────────────
        if metadata.center_lat is not None and metadata.center_lon is not None:
            parts.append(
                f"Location: {metadata.center_lat:.4f}°N, "
                f"{metadata.center_lon:.4f}°E"
            )

        if metadata.acquisition_date:
            parts.append(f"Acquired: {metadata.acquisition_date}")

        if metadata.sensor:
            parts.append(f"Sensor: {metadata.sensor}")

        if metadata.pixel_size_m:
            parts.append(f"Resolution: {metadata.pixel_size_m:.1f}m/pixel")

        # ── Spectral indices (only if multispectral) ────────────
        if is_multispectral:
            parts.append(f"[Multispectral analysis from {metadata.num_bands} bands]")

            if indices.ndvi_mean is not None:
                veg_desc = self._describe_ndvi(indices.ndvi_mean)
                parts.append(
                    f"NDVI mean: {indices.ndvi_mean:.3f} ({veg_desc})"
                )
                if indices.vegetation_percentage is not None:
                    parts.append(
                        f"Healthy vegetation cover: {indices.vegetation_percentage:.1f}%"
                    )

            if indices.ndwi_mean is not None:
                parts.append(f"NDWI mean: {indices.ndwi_mean:.3f}")
                if indices.water_percentage is not None:
                    parts.append(
                        f"Water pixel coverage (NDWI > {self.ndwi_threshold}): "
                        f"{indices.water_percentage:.1f}%"
                    )

            if indices.ndbi_mean is not None:
                parts.append(f"NDBI mean: {indices.ndbi_mean:.3f}")
                if indices.builtup_percentage is not None:
                    parts.append(
                        f"Built-up area coverage: {indices.builtup_percentage:.1f}%"
                    )

        # ── Domain-specific hints ───────────────────────────────
        if domain and is_multispectral:
            if domain == "flood" and indices.water_percentage is not None:
                if indices.water_percentage > 30:
                    parts.append(
                        "⚠ NDWI indicates significant water presence — "
                        "possible flooding or water body"
                    )
            elif domain == "agriculture" and indices.ndvi_mean is not None:
                if indices.ndvi_mean < self.ndvi_sparse:
                    parts.append(
                        "⚠ Low NDVI — possible crop stress, bare soil, "
                        "or non-vegetated area"
                    )
            elif domain == "urban" and indices.ndbi_mean is not None:
                if indices.ndbi_mean > 0.1:
                    parts.append(
                        "⚠ Elevated NDBI — significant built-up area detected"
                    )

        if not parts:
            return ""

        return "[SDL Context] " + " | ".join(parts)

    def _describe_ndvi(self, ndvi_mean: float) -> str:
        """Human-readable description of mean NDVI."""
        if ndvi_mean > self.ndvi_healthy:
            return "healthy, dense vegetation"
        elif ndvi_mean > self.ndvi_sparse:
            return "moderate vegetation"
        elif ndvi_mean > 0.0:
            return "sparse or stressed vegetation"
        elif ndvi_mean > -0.1:
            return "bare soil or impervious surface"
        else:
            return "water or shadow"
