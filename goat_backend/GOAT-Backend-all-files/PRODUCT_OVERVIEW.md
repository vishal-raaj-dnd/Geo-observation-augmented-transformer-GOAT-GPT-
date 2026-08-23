# EO-GPT — Product Overview

## Enhancing GPT-OSS with Multimodal Vision Capabilities for ISRO Earth Observation Data

| Field | Value |
|---|---|
| **Event** | Smart India Hackathon 2025 |
| **Problem Statement** | SIH25170 |
| **Problem Provider** | Indian Space Research Organisation (ISRO) |
| **Prepared by** | [Team Name — to be filled] |
| **Classification** | Public / Non-Confidential |

---

# 1. What We Are Building

## 1.1 The Problem

Earth Observation satellites generate terabytes of imagery every day. Analysing that imagery — identifying flooded areas, assessing crop health, detecting urban expansion — still requires a human expert who manually inspects images, applies domain-specific heuristics, and writes narrative reports. This process is **slow**, **inconsistent**, and **inaccessible to non-specialists**.

Current AI language models can reason over text but cannot process satellite imagery. Current vision-language models are trained on everyday photographs and fail on overhead satellite scenes, multispectral bands, and domain-specific Earth Observation queries.

**No open-source, locally deployable system exists that combines strong language reasoning with satellite-image understanding to provide explainable, query-driven EO analysis with Indian use-case specialisation.**

## 1.2 The Product

**EO-GPT** is a multimodal AI copilot for satellite imagery analysis. It connects a pretrained vision encoder to the GPT-OSS language model through a trainable adapter, enabling the model to **see**, **understand**, and **reason** over satellite imagery using plain English.

### How It Works — In One Sentence

> *Upload a satellite image → Ask a question in plain English → Get a grounded analysis with confidence scores, visual evidence, and a downloadable report.*

### Core Workflow

```
User uploads an EO image (GeoTIFF / PNG / JPEG)
        ↓
System preprocesses and tiles the image
        ↓
Vision encoder (SigLIP / CLIP-ViT) extracts visual features
        ↓
Trainable projector aligns visual features to the LLM token space
        ↓
GPT-OSS generates a natural-language analysis
        ↓
Confidence estimation assigns reliability scores per claim
        ↓
Visual evidence generator produces heatmaps and highlighted regions
        ↓
Report generator creates a structured downloadable PDF
        ↓
User views results in a web dashboard
```

### Architecture — Hybrid Approach

The system combines three complementary strategies:

| Layer | Strategy | Purpose |
|---|---|---|
| **Primary** | Vision Encoder + MLP Projector + GPT-OSS | Core visual reasoning — the model genuinely "sees" the image |
| **Augmentation** | Retrieval-Augmented Generation (RAG) | Enriches responses with EO domain knowledge, band descriptions, geographic context |
| **Specialist** | Optional external models (SAM, U-Net, ResNet) | Pixel-level segmentation, object detection, scene classification |

### What Makes It Different

| Differentiator | Description |
|---|---|
| **Open-source & locally deployable** | No dependency on proprietary cloud APIs; all processing stays on-prem — critical for government and defence imagery |
| **Multimodal EO reasoning** | Not just classification — the system answers arbitrary natural-language questions about satellite imagery |
| **Indian EO focus** | Designed for Indian geography, agriculture, and disaster scenarios; extensible to ISRO satellite data |
| **Explainable AI** | Confidence scores, visual evidence overlays, uncertainty flags, "requires verification" markers |
| **Structured reporting** | Automated PDF reports ready for decision-makers |
| **Privacy-preserving** | No image data sent to external servers |

### Computational Requirement

A single GPU with **16–24 GB VRAM** (NVIDIA T4 / A10 / RTX 3090) is sufficient for both inference and adapter fine-tuning with LoRA/QLoRA. The system runs on Google Colab (free T4 tier) for prototyping and on any on-prem server for deployment.

---

# 2. Build Cycle

## 2.1 Eight-Week Development Timeline

| Week | Phase | Activities | Deliverable |
|---|---|---|---|
| **1** | **Setup & Data** | Environment setup (Python, PyTorch, CUDA, Docker); download GPT-OSS, vision encoder weights; download EuroSAT, RESISC45, SpaceNet datasets; download Sentinel-2 tiles over Indian cities | Working dev environment; raw datasets available |
| **2** | **Data Preparation** | Image tiling and normalisation; template-based caption generation; VQA pair creation; geographic train/val/test split | Processed training dataset with clean splits |
| **3** | **Vision-Language Alignment** | Train MLP projector (Phase 1) — map vision encoder features into GPT-OSS embedding space; benchmark SigLIP vs CLIP-ViT vs DINOv2 | Trained projector; baseline caption quality; encoder selected |
| **4** | **Instruction Tuning** | LoRA fine-tuning (Phase 2) — train GPT-OSS to follow EO-specific instructions; build RAG knowledge base (index EO domain documents) | Instruction-tuned model; working RAG pipeline |
| **5** | **Backend & API** | FastAPI server with image upload, analysis, question, and report endpoints; PostgreSQL database; confidence and evidence services | Working REST API with core endpoints |
| **6** | **Frontend & Integration** | React/Next.js web dashboard — image upload, query input, analysis display, evidence overlay viewer, report download | End-to-end working system |
| **7** | **Evaluation & Polish** | Model evaluation on held-out geographic test set; human review of outputs; bug fixing; demo scenario preparation and rehearsal | Evaluation results; demo-ready system |
| **8** | **Hackathon** | Final integration, system hardening, demo rehearsal (3+ full runs), presentation preparation | Successful SIH 2025 demonstration |

> **Note**: This timeline assumes part-time work by a student team. Full-time focus compresses it to 3–4 weeks. The hackathon itself (36–72 hours) focuses on integration, polish, and demo — not core development.

## 2.2 Training Phases

### Phase 1 — Vision-Language Alignment (Projector Training)

| Aspect | Detail |
|---|---|
| **Goal** | Teach the projector to translate visual features into tokens GPT-OSS can understand |
| **Data** | EuroSAT + RESISC45 images with template-generated captions (~58K samples) |
| **Frozen** | Vision encoder + GPT-OSS |
| **Trainable** | MLP projector (~10M parameters) |
| **Compute** | ~2–4 hours on a single 16 GB GPU |
| **Loss** | Cross-entropy (next-token prediction) |

### Phase 2 — Instruction Tuning with LoRA

| Aspect | Detail |
|---|---|
| **Goal** | Fine-tune GPT-OSS to follow EO-specific instructions and produce structured analyses |
| **Data** | Curated VQA pairs, structured analysis templates, multi-turn EO conversations (~80K samples) |
| **Frozen** | Vision encoder |
| **Trainable** | Projector + LoRA adapters on GPT-OSS (~5–15M parameters, rank 16–64) |
| **Compute** | ~4–8 hours on a single 16–24 GB GPU |
| **Loss** | Cross-entropy (next-token prediction) |

### Phase 3 — RAG Knowledge Base (No Training)

| Aspect | Detail |
|---|---|
| **Goal** | Index EO domain knowledge for retrieval during inference |
| **Data** | EO textbooks, ISRO satellite specs (public), Sentinel-2 band descriptions, land-use taxonomies |
| **Process** | Chunk documents → embed with sentence transformer → store in FAISS/pgvector |
| **Compute** | Minimal; CPU-only |

## 2.3 Datasets

| Dataset | Size | Resolution | Use |
|---|---|---|---|
| **EuroSAT** | 27,000 images | 10m (Sentinel-2) | Primary scene classification training |
| **RESISC45** | 31,500 images | 0.2–30m | Scene diversity and class coverage |
| **BigEarthNet** | 590,326 patches | 10–60m (Sentinel-2) | Large-scale multi-label training |
| **SpaceNet** | Varies | 0.3–0.5m | Urban feature and building segmentation |
| **Sentinel-2 L2A** | Unlimited | 10–60m | Custom Indian geography tiles (free, operational) |

## 2.4 Team Roles & Immediate Actions

| # | Action | Owner | Deadline |
|---|---|---|---|
| 1 | Verify GPT-OSS availability — confirm the exact variant (7B/13B) and format | ML Lead | Immediately |
| 2 | Secure GPU access — at least one 16 GB+ GPU for training and inference | DevOps | Week 1 |
| 3 | Download datasets — EuroSAT, RESISC45, SpaceNet; Sentinel-2 tiles over Indian cities | Data Engineer | Week 1 |
| 4 | Benchmark vision encoders — test SigLIP, CLIP-ViT, DINOv2 on EO imagery (zero-shot) | ML Lead | Week 1–2 |
| 5 | Generate training captions — template-based captions for EuroSAT/RESISC45 classes | Data Engineer | Week 2 |
| 6 | Train projector — Phase 1 training; evaluate caption quality | ML Engineer | Week 3 |
| 7 | Set up FastAPI backend — image upload, tiling, analysis endpoint | Backend Engineer | Week 3–4 |
| 8 | Build minimal UI — image upload + query input + response display | Frontend Engineer | Week 4–5 |
| 9 | Prepare demo data — 3–5 validated image/query pairs per demo scenario | Data Engineer | Week 5 |
| 10 | Rehearse demo — full end-to-end, 3+ times; prepare for failure modes | Entire Team | Week 7 |

---

# 3. Features

## 3.1 MVP Features (Hackathon Demo)

| # | Feature | Description | Status |
|---|---|---|---|
| 1 | **Satellite image upload** | Accept GeoTIFF, PNG, JPEG; auto-tile large images; extract geospatial metadata | ✅ MVP |
| 2 | **Natural-language query** | Free-text question input with suggested prompts | ✅ MVP |
| 3 | **Vision-language analysis** | Captioning + VQA using vision encoder + projector + GPT-OSS | ✅ MVP |
| 4 | **Confidence estimation** | Low / Medium / High confidence scores per claim, derived from token probabilities | ✅ MVP |
| 5 | **Visual evidence overlays** | GradCAM heatmaps, bounding boxes, and highlighted regions on the image | ✅ MVP |
| 6 | **PDF report generation** | Downloadable structured report with images, findings, confidence, caveats, and model version | ✅ MVP |
| 7 | **Three demo use cases** | Flood/disaster assessment, crop monitoring, land-use classification — each with pre-validated scenarios | ✅ MVP |
| 8 | **Web dashboard** | React/Next.js frontend with image upload, query input, results display, evidence viewer, and report download | ✅ MVP |
| 9 | **REST API** | FastAPI endpoints for upload, analyse, question, report, health, and model-info | ✅ MVP |
| 10 | **GeoTIFF metadata display** | CRS, bounding box, acquisition date, band information | ✅ MVP |
| 11 | **RAG context enrichment** | Retrieve EO domain knowledge and geographic context to improve response accuracy | ✅ MVP (basic) |
| 12 | **Insufficient-evidence flagging** | Model explicitly states uncertainty when confidence falls below threshold | ✅ MVP |
| 13 | **Multi-turn conversation** | Follow-up questions referencing previous analysis context | ⚠️ Stretch |

## 3.2 Post-MVP Features (Roadmap)

| Feature | Description | Value | Complexity |
|---|---|---|---|
| **Multispectral support** | Process 10+ bands (NIR, SWIR, thermal) from Sentinel-2, Resourcesat | High | High |
| **Temporal change detection** | Automated two-date comparison with change masks and area quantification | High | Medium |
| **ISRO data connector** | Direct integration with Bhoonidhi API when accessible | High | Medium |
| **Interactive map view** | Leaflet/OpenLayers map overlay showing image footprint and analysis regions | Medium | Medium |
| **Segmentation integration** | SAM or U-Net for precise boundary delineation and pixel-level classification | High | Medium |
| **GeoJSON / GeoTIFF export** | Georeferenced vector and raster output layers | High | Medium |
| **Hindi / regional language** | Multilingual queries and responses | Medium | Medium |
| **Natural-language GIS tools** | AOI definition, buffer, intersect, clip, zonal statistics via tool-calling | High | High |
| **Geospatial search** | Search imagery archives by location, date, sensor, and semantic content | Medium | Medium |
| **Automated monitoring pipelines** | Scheduled analysis of new satellite acquisitions with alert thresholds | High | High |
| **Edge / offline deployment** | Lightweight model for field operations in low-connectivity environments | High | High |
| **Multi-sensor fusion** | Optical + SAR fusion with sensor-specific preprocessing | High | High |

## 3.3 System Capabilities Summary

```
┌──────────────────────────────────────────────────────────┐
│                     EO-GPT CAPABILITIES                  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  INPUT          →   PROCESSING        →   OUTPUT         │
│                                                          │
│  • Satellite        • Vision encoding     • Text analysis│
│    images             (SigLIP/CLIP)       • Confidence   │
│  • GeoTIFF          • Feature projection    scores       │
│  • PNG / JPEG       • Language reasoning  • Evidence     │
│  • Natural-           (GPT-OSS)             heatmaps    │
│    language         • RAG enrichment      • PDF report   │
│    queries          • Confidence          • Metadata     │
│  • Geographic         calibration         • Annotated    │
│    metadata         • Evidence              images       │
│                       generation                         │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  DEPLOYMENT:   Docker Compose  │  Single GPU (16 GB+)    │
│  PRIVACY:      Fully local     │  No cloud API calls     │
│  LICENCE:      Open-source     │  MIT / Apache 2.0       │
└──────────────────────────────────────────────────────────┘
```

---

# 4. Domains We Are Covering

## 4.1 Primary Domains (MVP Demo Scenarios)

### 🌊 Domain 1 — Flood & Disaster Assessment

| Aspect | Detail |
|---|---|
| **What** | Identify flooded areas, estimate affected extent, overlay infrastructure and crop exposure |
| **User** | Disaster-management officers, district officials, emergency responders |
| **Input** | Post-flood satellite image (RGB or false-colour composite) + query ("What areas are flooded?") |
| **Output** | Textual description of inundation, confidence map, annotated image, downloadable report |
| **Demo Data** | Sentinel-2 L2A tiles from Kerala 2018 floods or Assam flood events |
| **Constraints** | System does not claim precise flood depth, casualty estimates, or building-level damage |
| **MVP Capabilities** | Flood mask generation, affected-area calculation, pre/post evidence, confidence warnings |

### 🌾 Domain 2 — Agricultural Crop Monitoring

| Aspect | Detail |
|---|---|
| **What** | Assess crop health, identify vegetation stress, describe agricultural patterns |
| **User** | Agriculture analysts, agronomists, state agriculture departments |
| **Input** | Crop-area imagery (RGB or NDVI composite) + query ("Is this crop healthy?") |
| **Output** | Health assessment with caveats, visual highlighting of stress regions, field-verification recommendation |
| **Demo Data** | Sentinel-2 tiles over Punjab/Haryana agricultural regions |
| **Constraints** | Does not claim specific crop species unless confidence is high; recommends ground truthing; warns against unsupported disease claims |
| **MVP Capabilities** | Vegetation-index analysis (where bands permit), stress classification, trend summaries |

### 🏙️ Domain 3 — Land-Use & Urban Expansion

| Aspect | Detail |
|---|---|
| **What** | Classify land-cover types, detect urban growth, describe spatial patterns |
| **User** | Urban planners, municipal authorities, land-records officers |
| **Input** | Image tiles of peri-urban areas + query ("Describe the land-cover types" / "How has the built-up area changed?") |
| **Output** | Multi-class land-cover description with per-class confidence, change narrative (future: with two-date images), area estimates with uncertainty bounds |
| **Demo Data** | Sentinel-2 tiles over Hyderabad or Bangalore outskirts |
| **Constraints** | Precise area measurements require GIS-calibrated analysis; system caveats this |
| **MVP Capabilities** | Scene classification, built-up area identification, land-cover mapping |

## 4.2 Secondary Domains (MVP Supported)

| Domain | Description | Capability Level |
|---|---|---|
| **🌲 Environmental Monitoring** | Detect deforestation, water-body shrinkage, land degradation | Scene-level description with uncertainty |
| **🌍 General EO Scene Description** | Comprehensive captioning of any satellite image — land-cover types, notable features, spatial patterns | Full captioning and VQA |

## 4.3 Future Domains (Post-MVP Roadmap)

| Domain | Description | Priority |
|---|---|---|
| **🔥 Forest-Fire Detection** | Active-fire detection, burn-area mapping, spread risk modelling | P2 |
| **💧 Water-Resource Monitoring** | Lake, reservoir, and river segmentation; water-spread temporal statistics | P1 |
| **🏖️ Coastal & Marine Monitoring** | Shoreline erosion, oil-spill detection, algal bloom tracking | P2 |
| **🌫️ Atmospheric & Climate** | Air-quality proxies, urban heat islands, cloud analysis | P2 |

## 4.4 Domain Coverage Map

```
                    ┌─────────────────────────────────────┐
                    │         EO-GPT DOMAIN COVERAGE      │
                    └─────────────────────────────────────┘

  ╔══════════════════════════════════════════════════════════╗
  ║  MVP (P0) — Demonstrated at SIH 2025                    ║
  ║                                                          ║
  ║   🌊 Flood / Disaster    🌾 Crop Monitoring              ║
  ║   🏙️ Land-Use / Urban    🌍 General EO Captioning        ║
  ║   🌲 Environmental                                       ║
  ╚══════════════════════════════════════════════════════════╝
                          │
                          ▼
  ┌──────────────────────────────────────────────────────────┐
  │  Strong Extensions (P1)                                  │
  │                                                          │
  │   💧 Water Resources     🌿 Forest & Wetland             │
  │   🗺️ GIS Tool-Calling    🔍 Geospatial Search            │
  │   📡 Multi-Sensor Fusion  🔐 Security & Auditability     │
  └──────────────────────────────────────────────────────────┘
                          │
                          ▼
  ┌──────────────────────────────────────────────────────────┐
  │  Roadmap (P2)                                            │
  │                                                          │
  │   🔥 Fire Detection       🏗️ Infrastructure              │
  │   🏖️ Coastal / Marine     🌫️ Atmospheric / Climate       │
  │   ⏱️ Real-Time Alerts     📴 Offline / Edge Deployment   │
  └──────────────────────────────────────────────────────────┘
```

## 4.5 Target Users Per Domain

| Domain | Primary User | Secondary Users |
|---|---|---|
| Flood / Disaster | District Magistrate, NDRF officer | Remote-sensing scientist, policy researcher |
| Crop Monitoring | State agriculture officer, agronomist | Farmer cooperative, insurance analyst |
| Land-Use / Urban | Urban planner, municipal authority | Land-records officer, environmental activist |
| Environmental | Environmental researcher, forest officer | NGO analyst, policy maker |
| General EO | Student, researcher | Journalist, citizen scientist |

---

# 5. Quick Reference Card

| Item | Value |
|---|---|
| **Product** | EO-GPT — Multimodal AI Copilot for Satellite Imagery |
| **Problem Statement** | SIH25170 (ISRO) |
| **Architecture** | Vision Encoder + MLP Projector + GPT-OSS + RAG |
| **Prototype Model** | Qwen2.5-VL-3B-Instruct with QLoRA (Colab/T4-compatible) |
| **Production Target** | GPT-OSS via replaceable vision-language projector |
| **Hardware** | Single GPU, 16–24 GB VRAM |
| **Deployment** | Docker Compose, fully local, no cloud API dependency |
| **MVP Domains** | Flood, Agriculture, Land-Use, Environmental, General EO |
| **MVP Duration** | 8 weeks (part-time) / 3–4 weeks (full-time) |
| **Key Output** | Grounded analysis + confidence scores + visual evidence + PDF report |

---

*This document is a focused extract from the full Product Requirements Document (PRD.md). For detailed technical specifications, API contracts, database schemas, evaluation methodology, and appendices, refer to the complete PRD.*
