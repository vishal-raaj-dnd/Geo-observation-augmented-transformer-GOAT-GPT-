# UI & Content Delivery Specifications

## 1. Industry-Grade Frontend Stack & Anti-AI-Slop Guidelines
- **Frontend Stack**: React + Vite + MapLibre GL JS + Lucide Icons (`lucide-react`) + Vanilla CSS (charcoal palette).
- **Icon System**: **Lucide Icons** (open source, crisp pixel-perfect SVG icons, stroke width 1.5px).
- **Strict Anti-AI-Slop & Quality Rules**:
  - **NO EMOJIS anywhere** (All visual indicators use clean Lucide SVG icons).
  - **NO CURVED BADGES / PILL BADGES**.
  - **NO OPERATIONS VERSION TAGS / WATERMARKS**.
  - **NO UNNECESSARY DECORATIVE FLUFF**: Pure, human-crafted, functional UI.
  - **NO UNWANTED SYMBOLS OR JUNK CHARACTERS**: Clean, crisp typography formatting.
  - **STRICTLY ENGLISH ONLY**: Zero Chinese or foreign language fallback characters in model responses.

## 2. Dynamic Model-Driven Component Selection & Proper Satellite Assets
1. **Model-Decided UI Components (`active_components` array)**:
   - The model output dynamically determines which UI components to trigger based on query domain relevance.
   - **Conditional Rendering**: Charts, metrics cards, donut risk breakdowns, and annotated satellite galleries ONLY render if the model specifies them in its `active_components` list.
   - Irrelevant components for a specific query domain are hidden.
2. **Proper Real Satellite Imagery Deliverables**:
   - High-precision Sentinel-2 / Landsat SAR Earth Observation satellite imagery assets with actual GIS bounding box coordinates.
3. **Pixel-Perfect Dropdown Alignment**:
   - Custom dark select dropdowns with aligned padding, SVG arrows, and Inter typography.

## 3. Revolving 3D Globe Intro Screen & Zoom-In Transition
1. **Initial Revolving 3D Globe View (`isIntro = true`)**:
   - MP4 video background loop (`/intro-globe.mp4`) with bottom-right dark overlay mask hiding Gemini logo watermark.
   - Hero Title: **"DRISHTI — Earth Observation & Disaster Intelligence"**.
   - Primary CTA Button: **"Get Started"** (solid off-white `#f4f4f5` fill, dark text `#09090b`).
2. **"Get Started" Zoom-In Camera Transition**:
   - Clicking "Get Started" triggers video scale zoom-in animation (`scale(1.06)` $\rightarrow$ `scale(1.4)` over 850ms).
   - Smoothly reveals 3D tilted India map view and floating input panel underneath.

## 4. Map Specifications & 3D Pitch
- **Dual Map Basemaps (Toggleable)**:
  - **Dark-Themed Vector Map** (matching charcoal dark theme).
  - **High-Resolution Satellite Map** (deep zoom to inspect buildings, nuances, infrastructure).
- **3D Tilted Perspective**: Tilted camera pitch (45°-60° for 3D depth).

## 5. Design System & Palette (Strictly Based on Reference Image)
- **Color Palette**:
  - **Base Background**: Deep dark charcoal (`#09090b` / `#121212`).
  - **Panel Containers**: Dark slate (`#18181b`) with subtle rounded borders (`#27272a`).
  - **Primary Buttons/Controls**: Solid crisp light off-white (`#f4f4f5` / `#e4e4e7`) with dark text (`#09090b`).
  - **Secondary Controls**: Dark background with thin light border (`#27272a`), crisp white text.
  - **Input Fields**: Charcoal fill, thin border, light gray placeholder text (`#a1a1aa`).
  - **STRICT COLOR RULE**: **NO cyan, NO neon accents**.

## 6. Overlay Panel Features & Dynamic Tool-Calling Architecture
- **Selected Architecture**: Tool Calling per Metric (Option A).
  - Model invokes tools per block (`fetch_line_chart_data()`, `fetch_donut_data()`, `fetch_annotated_imagery()`).
  - Individual cards show loading spinners during execution.
- **Dynamic Model-Selected Deliverables**:
  1. **Dynamic Metrics Cards**: Severity level, flooded area %, water depth (if enabled by model).
  2. **Dynamic Line Chart**: Water trend time-series (if enabled by model).
  3. **Dynamic Donut Chart**: Risk breakdown % (if enabled by model).
  4. **Dedicated Annotated Satellite Section**: Real Sentinel-2 SAR images with AI bounding boxes (if enabled by model).
  5. **Model Telemetry & Remote Sensing Scores**: NDWI, NDVI, Soil Moisture.
  6. **Historical Satellite Image Timeline**: Left ($\leftarrow$) / Right ($\rightarrow$) arrow controls.

## 7. Export Actions & Full Thread View
- **Export Buttons**: "Export PDF" and "Export GeoJSON" buttons **only appear AFTER response generation completes**.
- **Full Thread Mode ("Open Full Thread")**:
  - ChatGPT-style multi-turn chat window.
  - Minimized 3D Map in bottom-right corner.
  - Metrics & charts rendered directly inside chat message cards.

## 8. Summary: Total Metrics & Data Points Displayed in Panel (22 Total)

| Category | Data / Metric Item | Description / Format |
| :--- | :--- | :--- |
| **Input Selection** | 1. State | Selected State dropdown/input |
| | 2. City | Selected City dropdown/input |
| | 3. Date / Time | Selected timeframe / period |
| **Bold Metric Cards** | 4. Severity Index | High / Medium / Low / Critical badge |
| | 5. Flooded Area | Total area in $\text{km}^2$ and % of city |
| | 6. Flood Depth | Estimated peak water depth in meters |
| | 7. Affected Population | Estimated count of impacted residents |
| **Scientific Remote Sensing** | 8. NDWI Score | Water index value ($-1.0$ to $+1.0$) |
| | 9. NDVI Score | Crop / Vegetation loss index |
| | 10. Soil Moisture | Submerged ground moisture score |
| | 11. Sensor Info | Satellite source (Sentinel-2 SAR, 10m res) |
| **Dynamic Charts Data** | 12. Bar Chart | Land type flooded (Urban/Agri/Forest) |
| | 13. Line Chart | Water level change trend over days |
| | 14. Donut Chart | Risk intensity distribution % |
| **Model Telemetry** | 15. Model Name | `Qwen2.5-VL QLoRA Adapter` |
| | 16. Inference Time | Latency e.g. `1.28s` |
| | 17. Confidence Score | AI confidence e.g. `96.4%` |
| **Visuals & Timeline** | 18. Raw Satellite Gallery | Group of satellite tile photos |
| | 19. Annotated Images | Dynamic section with AI bounding boxes |
| | 20. Daily Timeline | Arrow index ($T-3, T-2, T-1, T_0$) |
| **Reports & Export** | 21. Action Summary | Key AI findings & recommendations |
| | 22. Export Buttons | Download PDF & Export GeoJSON |
