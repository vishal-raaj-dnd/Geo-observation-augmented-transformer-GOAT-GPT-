# GOAT-Backend 🐐🛰️
### **Geo-Observation Augmented Transformer (EO-GPT)**
*Multimodal AI Copilot for Earth Observation & Satellite Imagery Analysis*

[![FastAPI](https://img.shields.io/badge/API-FastAPI-009688.svg?style=flat&logo=FastAPI&logoColor=white)](https://fastapi.tiangolo.com)
[![Base Model](https://img.shields.io/badge/VLM-Qwen2.5--VL--3B-blue.svg)](https://huggingface.co/Qwen/Qwen2.5-VL-3B-Instruct)
[![PEFT](https://img.shields.io/badge/PEFT-QLoRA%204--bit-orange.svg)](https://github.com/huggingface/peft)
[![License](https://img.shields.io/badge/License-Apache%202.0-green.svg)](LICENSE)

---

## 📌 Overview

**GOAT-Backend** is the inference and preprocessing backend engine for **EO-GPT**. It integrates a **Spectral Decomposition Layer (SDL)** with a multimodal vision-language model (**Qwen2.5-VL-3B-Instruct**) augmented by domain-specialized **LoRA adapters** (Flood & Crop Management, Urban Expansion, Environmental Monitoring, and Water Resources).

---

## 🏛️ Architecture Flow

```
[User Satellite Image (GeoTIFF / PNG / JPEG) + Query]
                       │
                       ▼
    ┌──────────────────────────────────────────────┐
    │     SPECTRAL DECOMPOSITION LAYER (SDL)       │
    │  • Extracts RGB bands for Vision Tower       │
    │  • Calculates NDVI / NDWI / NDBI indices     │
    │  • Extracts Bounding Box, CRS & Coordinates   │
    │  • Converts Multispectral Data into Context  │
    └──────────────────────┬───────────────────────┘
                           │
           ┌───────────────┴───────────────┐
           ▼                               ▼
    [RGB Image (3-channel)]        [SDL Text Context]
           │                               │
           └───────────────┬───────────────┘
                           │
                           ▼
    ┌──────────────────────────────────────────────┐
    │           DOMAIN ROUTER & PEFT               │
    │  Auto-routes query to domain LoRA adapter:   │
    │   • flood_crop  (Flood & Crop Management)    │
    │   • urban       (Urban / Land-Use)           │
    │   • environment (Forest & Ecology)           │
    │   • water       (Water Resources)            │
    │   • general     (General EO Scene VQA)       │
    └──────────────────────┬───────────────────────┘
                           │
                           ▼
    ┌──────────────────────────────────────────────┐
    │     Qwen2.5-VL-3B-Instruct (4-bit QLoRA)     │
    │  Grounded Earth Observation Reasoning        │
    └──────────────────────┬───────────────────────┘
                           │
                           ▼
             [Structured JSON API Response]
```

---

## 📂 Repository Structure

```
GOAT-Backend/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── config.py         # Model configuration, adapter repos & domain routing
│   │   ├── sdl.py            # Spectral Decomposition Layer (band extraction & index engine)
│   │   ├── inference.py      # Qwen2.5-VL + Multi-adapter PEFT engine
│   │   └── main.py           # FastAPI REST API endpoints
│   └── scripts/
│       └── push_adapter.py   # CLI tool to upload trained LoRA weights to Hugging Face
├── fetch_multi_reservoir.py  # Copernicus Sentinel-2 data fetcher
├── pipeline_water_dataset.py # Automated end-to-end dataset pipeline
├── process_sentinel2_water.py# NDWI & water mask generation
├── requirements.txt          # Python dependencies
├── .gitignore
└── README.md
```

---

## 🚀 Quickstart

### 1. Installation

```bash
# Clone the repository
git clone https://github.com/DineshAK-coder/GOAT-Backend.git
cd GOAT-Backend

# Install dependencies
pip install -r requirements.txt
```

### 2. Start the Server

```bash
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

Interactive API docs will be available at: `http://localhost:8000/docs`

---

## 📡 API Endpoints

### `POST /analyse`
Main analysis pipeline.
- **Inputs**: `file` (GeoTIFF / PNG / JPEG), `query` (string), `domain` (optional string)
- **Output**: Grounded analysis, confidence, extracted spectral indices, coordinates, and active LoRA adapter used.

### `GET /health`
System status, GPU memory allocation, and list of loaded adapters.

### `GET /adapters`
Overview of configured vs. loaded Hugging Face LoRA adapters.

### `GET /model-info`
Information about the base model, quantization mode, and GPU device.

---

## 📤 Pushing Trained Adapters to Hugging Face

Team members can push their trained LoRA checkpoint using the built-in script:

```bash
# Example: Pushing the dual-domain Flood & Crop adapter
python backend/scripts/push_adapter.py \
  --adapter-path ./checkpoints/eo_gpt_flood_crop_adapter \
  --domain flood_crop \
  --hf-org <YOUR_HF_ORG>
```
