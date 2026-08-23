"""
test_inference.py — two-stage grounded inference on the trained model.

Stage 1: NEUTRAL perception prompt (user claim never enters).
Stage 2: verdict that supports or REFUTES the user's premise.
Draws bounding boxes returned by Qwen2.5-VL grounding.

Usage (Kaggle or local):
  python scripts/test_inference.py \
      --model /kaggle/working/eo-merged \
      --image scene.png \
      --region "Patna, Bihar" --month "September" --year 2024 \
      --claim "Analyze the flooding in Patna in September 2024"
"""

import argparse
import re
import torch
from PIL import Image, ImageDraw

MODEL_DEFAULT = "Qwen/Qwen2.5-VL-3B-Instruct"


def load_model(path):
    from transformers import AutoProcessor, Qwen2_5_VLForConditionalGeneration

    model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
        path, torch_dtype=torch.bfloat16, device_map="auto"
    )
    processor = AutoProcessor.from_pretrained(path)
    return model, processor


def ask(model, processor, image, prompt, max_new_tokens=512):
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "image", "image": image},
                {"type": "text", "text": prompt},
            ],
        }
    ]
    text = processor.apply_chat_template(messages, tokenize=False,
                                         add_generation_prompt=True)
    inputs = processor(text=[text], images=[image], return_tensors="pt").to(model.device)
    out = model.generate(**inputs, max_new_tokens=max_new_tokens, do_sample=False)
    trimmed = [o[len(i):] for i, o in zip(inputs.input_ids, out)]
    return processor.batch_decode(trimmed, skip_special_tokens=False)[0]


STAGE1_PROMPT = (
    "You are analyzing a satellite image of {region}, {month} {year}.\n"
    "1) Describe water bodies and any anomalous inundation.\n"
    "2) Describe vegetation state and built-up areas.\n"
    "3) Provide bounding boxes for any flooded or anomalous water regions.\n"
    "If cloud cover blocks analysis, say so explicitly. "
    "Report ONLY what is visible in the image."
)

VERDICT_PROMPT = (
    "The user claims: \"{claim}\"\n\n"
    "Independent perception report of the image:\n{report}\n\n"
    "State clearly whether the imagery SUPPORTS or REFUTES the user's claim. "
    "Cite specifics from the report. If unsupported, say so plainly without "
    "softening. Never invent features that are not in the report."
)

BOX_RE = re.compile(
    r"<\|object_ref_start\|>(.*?)<\|object_ref_end\|>"
    r"<\|box_start\|>\((\d+),(\d+)\),\((\d+),(\d+)\)<\|box_end\|>",
    re.S,
)


def draw_boxes(image, text, out_path):
    matches = BOX_RE.findall(text)
    if not matches:
        print("No boxes found in output.")
        return image
    img = image.convert("RGB").copy()
    draw = ImageDraw.Draw(img)
    for label, x1, y1, x2, y2 in matches:
        box = [int(x1), int(y1), int(x2), int(y2)]
        draw.rectangle(box, outline=(255, 40, 40), width=4)
        draw.text((box[0] + 4, max(0, box[1] - 14)), label.strip(), fill=(255, 40, 40))
    img.save(out_path)
    print(f"Annotated image saved -> {out_path}")
    return img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=MODEL_DEFAULT)
    ap.add_argument("--image", required=True)
    ap.add_argument("--region", required=True)
    ap.add_argument("--month", required=True)
    ap.add_argument("--year", required=True)
    ap.add_argument("--claim", default="")
    args = ap.parse_args()

    model, processor = load_model(args.model)
    image = Image.open(args.image).convert("RGB")

    # Stage 1: perception (blind to user's claim)
    s1 = ask(model, processor, image,
             STAGE1_PROMPT.format(region=args.region, month=args.month, year=args.year))
    print("\n=== STAGE 1: PERCEPTION ===")
    print(s1.replace("<|im_end|>", ""))

    # Stage 2: verdict against user premise
    claim = args.claim or f"Analyze the flooding in {args.region}, {args.month} {args.year}."
    s2 = ask(model, processor, image,
             VERDICT_PROMPT.format(claim=claim, report=s1.replace("<|im_end|>", "").strip()))
    print("\n=== STAGE 2: VERDICT ===")
    print(s2.replace("<|im_end|>", ""))

    draw_boxes(image, s1, "annotated_output.png")


if __name__ == "__main__":
    main()
