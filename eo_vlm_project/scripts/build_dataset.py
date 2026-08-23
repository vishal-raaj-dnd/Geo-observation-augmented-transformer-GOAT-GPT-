"""
build_dataset.py — convert image chips + labels.csv into LLaMA-Factory
train.json with balanced task types:
  A) neutral description          (~35%)
  B) bounding-box grounding       (~30%)
  C) anti-sycophancy refusal      (~35%, generated from normal scenes)

Usage:
  python scripts/build_dataset.py --images ./images --labels ./labels.csv \
      --out ../data/train.json

labels.csv columns (header required):
image,region,year,month,has_flood,water_pct,baseline_pct,boxes
  boxes = "[[x1,y1,x2,y2],...]" or empty string when has_flood=0
"""

import argparse
import csv
import json
import os
import random

random.seed(42)

DESC_Q = [
    "Analyze this satellite image of {region}, {month} {year}.",
    "What does this satellite image of {region} from {month} {year} show?",
    "Describe the ground conditions visible in this {region} image from {month} {year}.",
    "Assess water extent, vegetation, and built-up areas in this image of {region}, {month} {year}.",
]

BOX_Q = [
    "Locate all flooded areas in this satellite image with bounding boxes.",
    "Provide bounding boxes around every region of standing water.",
    "Draw bounding boxes on all inundated zones you can identify.",
]

FLOOD_PREMISE = [
    "Analyze the flooding in {region}, {month} {year}.",
    "How severe is the flood shown in this {region} image from {month} {year}?",
    "Describe the flood damage in {region}, {month} {year}.",
    "Which areas of {region} were submerged in {month} {year}?",
]

WRONG_CITY_PREMISE = [
    "Analyze the flooding in {wrong_region}, {month} {year}.",
    "How bad is the flood damage in {wrong_region}, {month} {year}?",
]


def desc_answer(region, year, month, water_pct, baseline_pct, has_flood):
    if has_flood:
        return (
            f"Extensive inundation is visible across parts of {region}, covering roughly "
            f"{water_pct:.0f}% of the scene. Standing water and sediment plumes are detectable "
            f"around low-lying areas. This is strongly anomalous versus the {month} baseline "
            f"of about {baseline_pct:.0f}%."
        )
    return (
        f"No anomalous flooding is present. Water bodies cover roughly {water_pct:.0f}% of "
        f"the scene, consistent with the {month} baseline of about {baseline_pct:.0f}%. "
        f"Vegetation and built-up areas show no flood-related disruption."
    )


def box_answer(boxes):
    lines = []
    names = ["flooded area", "standing water zone", "inundated field", "submerged stretch"]
    for i, b in enumerate(boxes):
        x1, y1, x2, y2 = [int(v) for v in b]
        name = names[i % len(names)]
        lines.append(
            f"<|object_ref_start|>{name}<|object_ref_end|>"
            f"<|box_start|>({x1},{y1}),({x2},{y2})<|box_end|>"
        )
    return "\n".join(lines)


def refusal_answer(region, month, water_pct, baseline_pct):
    delta = abs(water_pct - baseline_pct)
    return (
        f"Your premise is not supported by this imagery. Water bodies occupy only about "
        f"{water_pct:.0f}% of the scene, consistent with the seasonal baseline of roughly "
        f"{baseline_pct:.0f}%. No inundation, standing water, or sediment plumes are detected. "
        f"The deviation from baseline is within {delta:.1f} percentage points, which indicates "
        f"normal conditions for {region} in {month}."
    )


def wrong_region_answer(wrong_region, month, water_pct, baseline_pct):
    return (
        f"This image does not show {wrong_region}, so no claim about it can be verified here. "
        f"Within the actual scene, water covers about {water_pct:.0f}% versus a baseline near "
        f"{baseline_pct:.0f}%. Please verify the requested location; analysis applies only to "
        f"the imagery provided."
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--images", required=True)
    ap.add_argument("--labels", required=True)
    ap.add_argument("--out", default="../data/train.json")
    ap.add_argument("--val-frac", type=float, default=0.05)
    args = ap.parse_args()

    rows = []
    with open(args.labels, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            r["has_flood"] = int(r["has_flood"])
            r["water_pct"] = float(r["water_pct"])
            r["baseline_pct"] = float(r["baseline_pct"])
            r["boxes"] = json.loads(r["boxes"]) if r["boxes"].strip() else []
            if not os.path.isfile(os.path.join(args.images, r["image"])):
                print(f"[skip] missing image: {r['image']}")
                continue
            rows.append(r)

    if not rows:
        raise SystemExit("No valid rows found - check paths and CSV header.")

    # split by REGION so the model never sees a city in both splits
    regions = sorted({r["region"] for r in rows})
    random.shuffle(regions)
    n_val = max(1, int(len(regions) * args.val_frac))
    val_regions = set(regions[:n_val])

    samples = []
    flood_rows = [r for r in rows if r["has_flood"] == 1 and len(r["boxes"]) > 0]
    normal_rows = [r for r in rows if r["has_flood"] == 0]
    all_regions = sorted({r["region"] for r in rows})

    for r in rows:
        img = os.path.join(args.images, r["image"])
        m = dict(region=r["region"], year=r["year"], month=r["month"])
        is_val = r["region"] in val_regions

        if r["has_flood"] == 1:
            q = random.choice(FLOOD_PREMISE).format(**m)
            a = desc_answer(m["region"], m["year"], m["month"],
                            r["water_pct"], r["baseline_pct"], True)
            samples.append((img, q, a))
            if r["boxes"]:
                samples.append((img, random.choice(BOX_Q), box_answer(r["boxes"])))
            q2 = random.choice(DESC_Q).format(**m)
            samples.append((img, q2, desc_answer(m["region"], m["year"], m["month"],
                                                 r["water_pct"], r["baseline_pct"], True)))
        else:
            q = random.choice(FLOOD_PREMISE).format(**m)
            samples.append((img, q, refusal_answer(m["region"], m["month"],
                                                   r["water_pct"], r["baseline_pct"])))
            wrong = random.choice([x for x in all_regions if x != r["region"]] or ["another city"])
            q3 = random.choice(WRONG_CITY_PREMISE).format(
                wrong_region=wrong.split(",")[0], **m)
            samples.append((img, q3, wrong_region_answer(wrong.split(",")[0], m["month"],
                                                         r["water_pct"], r["baseline_pct"])))

    out = [
        {
            "messages": [
                {"role": "user", "content": "<image>" + q},
                {"role": "assistant", "content": a},
            ],
            "images": [img],
        }
        for (img, q, a) in samples
    ]

    train = [s for s, r in zip(out, [None] * len(out))]
    # region-based split
    train_s, val_s = [], []
    for s in out:
        region_in_img = os.path.basename(s["images"][0])
        row = next(r for r in rows if r["image"] == region_in_img)
        (val_s if row["region"] in val_regions else train_s).append(s)

    random.shuffle(train_s)
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(train_s, f, indent=1, ensure_ascii=False)

    val_path = args.out.replace(".json", "_val.json")
    with open(val_path, "w", encoding="utf-8") as f:
        json.dump(val_s, f, indent=1, ensure_ascii=False)

    print(f"flood rows: {len(flood_rows)} | normal rows: {len(normal_rows)}")
    print(f"wrote {len(train_s)} train -> {args.out}")
    print(f"wrote {len(val_s)} val   -> {val_path}")
    print(f"held-out regions: {sorted(val_regions)}")


if __name__ == "__main__":
    main()
