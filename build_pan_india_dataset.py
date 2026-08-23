"""
Pan-India Agricultural Crop Monitoring Dataset Generator.
Generates 2,500 samples formatted in JSONL for Qwen2.5-VL QLoRA fine-tuning.
Covers 4 Indian Agro-Climatic Zones:
Zone 1: North (Punjab/Haryana/UP - Wheat/Rice)
Zone 2: Central/West (Maharashtra/MP/Gujarat - Cotton/Soybean)
Zone 3: South (Andhra/Tamil Nadu/Karnataka - Paddy/Pulses)
Zone 4: East/Northeast (West Bengal/Odisha/Assam - Jute/Tea/Paddy)
"""

import json
import random

ZONES = [
    {
        "zone": "North (Zone 1)",
        "states": ["Punjab", "Haryana", "Uttar Pradesh"],
        "cities": ["Ludhiana", "Karnal", "Meerut", "Amritsar", "Hisar"],
        "crops": ["Wheat", "Paddy (Rice)", "Mustard"],
        "soil": "Alluvial Soil",
        "sample_count": 650
    },
    {
        "zone": "Central & West (Zone 2)",
        "states": ["Maharashtra", "Madhya Pradesh", "Gujarat"],
        "cities": ["Nagpur", "Indore", "Rajkot", "Nashik", "Ujjain"],
        "crops": ["Cotton", "Soybean", "Sugarcane"],
        "soil": "Black Cotton Soil",
        "sample_count": 650
    },
    {
        "zone": "South (Zone 3)",
        "states": ["Andhra Pradesh", "Tamil Nadu", "Karnataka"],
        "cities": ["Guntur", "Thanjavur", "Mandya", "Vijayawada"],
        "crops": ["Paddy (Rice)", "Pulses", "Spices / Groundnut"],
        "soil": "Red / Coastal Soil",
        "sample_count": 600
    },
    {
        "zone": "East & Northeast (Zone 4)",
        "states": ["West Bengal", "Odisha", "Assam"],
        "cities": ["Burdwan", "Cuttack", "Jorhat", "Hooghly"],
        "crops": ["Jute", "Tea", "Paddy (Fragmented)"],
        "soil": "Alluvial / Laterite Soil",
        "sample_count": 600
    }
]

OUTPUT_FILE = "pan_india_crop_dataset.jsonl"

def generate_samples():
    samples = []
    total_idx = 1

    for z in ZONES:
        for _ in range(z["sample_count"]):
            state = random.choice(z["states"])
            city = random.choice(z["cities"])
            crop = random.choice(z["crops"])
            ndvi = round(random.uniform(0.25, 0.78), 2)
            
            is_stressed = ndvi < 0.45
            severity = "MODERATE STRESS" if is_stressed else "HEALTHY VEGETATION"
            stressed_pct = round(random.uniform(12.0, 34.0), 1) if is_stressed else round(random.uniform(2.0, 8.0), 1)

            prompt = (
                f"State: {state}, Region: {city}. "
                f"Assess crop health for {crop} using Sentinel-2 NDVI telemetry ({z['soil']}). "
                f"Identify vegetation stress regions and provide field verification recommendations."
            )

            response = (
                f"Crop Health Status: {severity}. "
                f"Sentinel-2 NDVI telemetry registers mean value of +{ndvi}. "
                f"Visual Highlight: {stressed_pct}% of the target farmland in {city}, {state} exhibits vegetation stress. "
                f"Recommendation: Ground-truthing is strongly recommended to differentiate soil moisture deficit from pest infestation. "
                f"Constraint Warning: Specific crop disease species cannot be confirmed without direct field verification."
            )

            sample_entry = {
                "id": f"agri_india_{total_idx:04d}",
                "zone": z["zone"],
                "state": state,
                "city": city,
                "crop": crop,
                "text": f"User: <image>\n{prompt}\nAssistant: {response}"
            }
            samples.append(sample_entry)
            total_idx += 1

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        for s in samples:
            f.write(json.dumps(s) + "\n")

    print(f"Generated {len(samples)} Pan-India crop samples saved to {OUTPUT_FILE}.")

if __name__ == "__main__":
    generate_samples()
