"""
app.py — Hugging Face Space for EO-GPT
Pure Gradio app with ZeroGPU support.

REST API access is provided by Gradio's built-in API system:
  POST /api/analyse  (Gradio Client format)
  GET  /info         (auto-generated API info)

For programmatic access from Python:
  from gradio_client import Client
  client = Client("dinesh-07-dev/eo-gpt-backend")
  result = client.predict(file="image.tif", query="...", domain="auto", api_name="/analyse")
"""

import os
import logging

import spaces
import torch
import gradio as gr
from PIL import Image

from sdl import SpectralDecompositionLayer
from inference import InferenceEngine
import config

# Logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(name)-20s | %(levelname)-7s | %(message)s")
logger = logging.getLogger("eo-gpt-space")

# Initialize SDL and Engine
sdl = SpectralDecompositionLayer()
engine = InferenceEngine()

# Preload model & adapters onto CPU at startup
logger.info("Initializing EO-GPT model & adapters on CPU...")
engine.load()


# ---------------------------------------------------------------------------
# ZeroGPU-decorated inference wrapper
# ---------------------------------------------------------------------------
@spaces.GPU(duration=120)
def generate_gpu_wrapper(image, query, sdl_context, domain):
    """Runs on ZeroGPU — model tensors move to CUDA here."""
    return engine.generate(
        image=image,
        query=query,
        sdl_context=sdl_context,
        domain=domain,
    )


# ---------------------------------------------------------------------------
# Gradio prediction function (called by both UI and API)
# ---------------------------------------------------------------------------
def gradio_predict(file_obj, query, domain_override):
    """Process a satellite image (GeoTIFF or standard) and return AI assessment."""
    if file_obj is None:
        return None, "Please upload a satellite file (GeoTIFF / PNG / JPG) first.", "", ""
    if not query or not query.strip():
        query = "Assess this satellite image, identify key environmental or flood features, and report metrics."

    domain = domain_override if domain_override and domain_override != "auto" else None

    file_path = file_obj.name if hasattr(file_obj, "name") else str(file_obj)

    try:
        # Process full multispectral GeoTIFF via SDL
        sdl_output = sdl.process(image_input=file_path, domain=domain)

        if domain is None:
            domain = engine.classify_domain(query)

        result = generate_gpu_wrapper(
            image=sdl_output.rgb_image,
            query=query,
            sdl_context=sdl_output.text_context,
            domain=domain,
        )

        geo_info = []
        if sdl_output.metadata.center_lat and sdl_output.metadata.center_lon:
            geo_info.append(f"**Center GPS:** `{sdl_output.metadata.center_lat:.4f}°N, {sdl_output.metadata.center_lon:.4f}°E`")
        if sdl_output.metadata.bbox_wgs84:
            geo_info.append(f"**Bounding Box (WGS84):** `{sdl_output.metadata.bbox_wgs84}`")
        if sdl_output.metadata.crs:
            geo_info.append(f"**CRS:** `{sdl_output.metadata.crs}`")
        if sdl_output.is_multispectral:
            if sdl_output.indices.water_percentage is not None:
                geo_info.append(f"**Water Coverage:** `{sdl_output.indices.water_percentage:.1f}%`")
            if sdl_output.indices.ndvi_mean is not None:
                geo_info.append(f"**NDVI Mean:** `{sdl_output.indices.ndvi_mean:.3f}`")
            if sdl_output.indices.ndwi_mean is not None:
                geo_info.append(f"**NDWI Mean:** `{sdl_output.indices.ndwi_mean:.3f}`")

        metrics_md = (
            f"**Domain:** `{result['domain']}` | "
            f"**Adapter:** `{result['adapter_used']}` | "
            f"**Latency:** `{result['processing_time_ms']} ms`\n\n"
            + ("\n\n".join(geo_info) if geo_info else "*(No embedded geospatial tags - standard image)*")
        )

        return sdl_output.rgb_image, result["response_text"], metrics_md, sdl_output.text_context

    except Exception as e:
        logger.exception(f"Gradio prediction failed: {e}")
        return None, f"❌ Error processing image: {str(e)}", "", ""


# ---------------------------------------------------------------------------
# Gradio Web UI
# ---------------------------------------------------------------------------
domain_choices = ["auto", "flood_crop", "flood", "agriculture", "crop", "water", "urban", "environment", "general"]

with gr.Blocks(title="EO-GPT Satellite Copilot") as demo:
    gr.Markdown("# 🛰️ EO-GPT: Satellite Multimodal AI Copilot")
    gr.Markdown("Upload satellite imagery (**GeoTIFF `.tif` / `.tiff` up to 13 bands** or PNG / JPG) and ask natural language questions.")

    with gr.Row():
        with gr.Column(scale=1):
            file_input = gr.File(
                label="Upload Satellite File (GeoTIFF / PNG / JPG)",
                file_types=[".tif", ".tiff", ".png", ".jpg", ".jpeg"],
                type="filepath"
            )
            query_input = gr.Textbox(
                label="Analysis Query",
                placeholder="e.g. Identify flooded areas, calculate water extent, or assess crop conditions...",
                value="Assess the flood extent, identify inundated agricultural zones, and calculate water coverage.",
                lines=2
            )
            domain_input = gr.Dropdown(choices=domain_choices, value="auto", label="Domain Routing")
            submit_btn = gr.Button("Analyse Satellite Image", variant="primary", size="lg")

        with gr.Column(scale=1):
            rgb_display = gr.Image(label="Extracted RGB Composite (from SDL)")
            output_text = gr.Markdown(label="EO-GPT Assessment")
            metrics_box = gr.Markdown(label="Geospatial & Spectral Evidence")
            with gr.Accordion("Raw Spectral Decomposition (SDL) Context", open=False):
                sdl_box = gr.Markdown()

    submit_btn.click(
        fn=gradio_predict,
        inputs=[file_input, query_input, domain_input],
        outputs=[rgb_display, output_text, metrics_box, sdl_box],
        api_name="analyse",  # Creates REST endpoint at /api/analyse
    )

# ---------------------------------------------------------------------------
# Launch — ZeroGPU requires demo.launch() to detect @spaces.GPU functions
# ---------------------------------------------------------------------------
demo.queue().launch()
