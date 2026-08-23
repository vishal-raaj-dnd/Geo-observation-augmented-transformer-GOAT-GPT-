"""
app.py — Gradio demo UI for the EO flood-analysis system.

Expects a `scenes/scenes.json` registry mapping user selections to local
satellite images:

{
  "Patna, Bihar|2024|September": "scenes/patna_2024_09.png",
  "Patna, Bihar|2024|January":   "scenes/patna_2024_01.png",
  "Jaipur, Rajasthan|2024|March":"scenes/jaipur_2024_03.png"
}

Usage:
  python app/app.py --model /path/to/eo-merged
"""

import argparse
import json
import os
import sys

import gradio as gr
import torch
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
from test_inference import (BOX_RE, STAGE1_PROMPT, VERDICT_PROMPT, ask)  # noqa: E402


class Analyzer:
    def __init__(self, model_path):
        from transformers import AutoProcessor, Qwen2_5_VLForConditionalGeneration

        self.model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
            model_path, torch_dtype=torch.bfloat16, device_map="auto"
        )
        self.processor = AutoProcessor.from_pretrained(model_path)

    def run(self, image, region, month, year, claim):
        s1 = ask(self.model, self.processor, image,
                 STAGE1_PROMPT.format(region=region, month=month, year=year))
        s1 = s1.replace("<|im_end|>", "").strip()
        claim = claim.strip() or f"Analyze the flooding in {region}, {month} {year}."
        s2 = ask(self.model, self.processor, image,
                 VERDICT_PROMPT.format(claim=claim, report=s1))
        s2 = s2.replace("<|im_end|>", "").strip()

        annotated = image.convert("RGB").copy()
        draw = ImageDraw.Draw(annotated)
        n_boxes = 0
        for label, x1, y1, x2, y2 in BOX_RE.findall(s1):
            box = [int(x1), int(y1), int(x2), int(y2)]
            draw.rectangle(box, outline=(255, 40, 40), width=4)
            draw.text((box[0] + 4, max(0, box[1] - 14)), label.strip(),
                      fill=(255, 40, 40))
            n_boxes += 1
        return annotated, s1, s2, f"{n_boxes} region(s) localized"


def build_ui(analyzer, registry):
    keys = sorted(registry.keys())
    cities = sorted({k.split("|")[0] for k in keys})
    years = sorted({k.split("|")[1] for k in keys})
    months = sorted({k.split("|")[2] for k in keys},
                    key=lambda m: ["January", "February", "March", "April", "May",
                                   "June", "July", "August", "September", "October",
                                   "November", "December"].index(m)
                    if m in ["January", "February", "March", "April", "May", "June",
                             "July", "August", "September", "October", "November",
                             "December"] else 99)

    with gr.Blocks(title="EO Grounded Analysis") as demo:
        gr.Markdown("# 🛰️ Earth-Observation Grounded Analysis\n"
                    "Select a location and time. The system retrieves the satellite "
                    "scene and reports ONLY what the imagery supports — it will "
                    "refute unsupported premises.")
        with gr.Row():
            with gr.Column():
                city = gr.Dropdown(cities, label="City / State", value=cities[0])
                year = gr.Dropdown(years, label="Year", value=years[0])
                month = gr.Dropdown(months, label="Month", value=months[0])
                claim = gr.Textbox(label="Your query (optional)",
                                   placeholder="e.g. Analyze the flooding in Patna, 2024")
                btn = gr.Button("Analyze", variant="primary")
            with gr.Column():
                out_img = gr.Image(label="Scene (red = detected flood regions)",
                                   type="pil")
                boxes_info = gr.Label(label="Grounding")
        with gr.Row():
            with gr.Column():
                gr.Markdown("### Perception report (grounded)")
                out_s1 = gr.Textbox(lines=10)
            with gr.Column():
                gr.Markdown("### Verdict (vs your query)")
                out_s2 = gr.Textbox(lines=10)

        def on_click(city, year, month, claim):
            key = f"{city}|{year}|{month}"
            path = registry.get(key)
            if not path or not os.path.isfile(path):
                return None, "No scene available for this selection.", "", "0"
            img = Image.open(path).convert("RGB")
            return analyzer.run(img, city, month, year, claim)

        btn.click(on_click, [city, year, month, claim],
                  [out_img, out_s1, out_s2, boxes_info])
    return demo


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="Qwen/Qwen2.5-VL-3B-Instruct")
    ap.add_argument("--registry", default=os.path.join(
        os.path.dirname(__file__), "scenes", "scenes.json"))
    args = ap.parse_args()

    with open(args.registry, encoding="utf-8") as f:
        registry = json.load(f)
    analyzer = Analyzer(args.model)
    build_ui(analyzer, registry).launch(share=True)


if __name__ == "__main__":
    main()
