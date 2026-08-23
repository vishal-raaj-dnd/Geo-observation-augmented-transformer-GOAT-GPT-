"""
Production Kaggle QLoRA Fine-Tuning Script for Qwen2.5-VL Earth Observation Grounding Model
Runs on Kaggle GPU (Tesla T4 16GB VRAM) / Google Colab Pro.
"""

import os
import torch
from datasets import load_dataset
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    TrainingArguments
)
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from trl import SFTTrainer

# 1. Configuration
MODEL_ID = "Qwen/Qwen2.5-VL-7B-Instruct"  # Or Qwen/Qwen2.5-VL-3B-Instruct
DATASET_PATH = "drishti_eo_grounding_dataset.jsonl"
OUTPUT_DIR = "./drishti_qwen2.5_vl_eo_adapter"

# 2. BitsAndBytes 4-bit Quantization Config
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.float16,
    bnb_4bit_use_double_quant=True
)

print(f"Loading Base Vision-Language Model: {MODEL_ID} in 4-bit NF4...")
tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, trust_remote_code=True)
tokenizer.pad_token = tokenizer.eos_token

model = AutoModelForCausalLM.from_pretrained(
    MODEL_ID,
    quantization_config=bnb_config,
    device_map="auto",
    trust_remote_code=True
)

# Prepare Model for PEFT
model = prepare_model_for_kbit_training(model)

# 3. Target Module LoRA Config (Vision Transformer Encoder + LM Projection Layers)
peft_config = LoraConfig(
    r=32,
    lora_alpha=64,
    target_modules=[
        "q_proj", "k_proj", "v_proj", "o_proj",
        "gate_proj", "up_proj", "down_proj"
    ],
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM"
)

model = get_peft_model(model, peft_config)
model.print_trainable_parameters()

# 4. Load Dataset
print(f"Loading Grounding Dataset from {DATASET_PATH}...")
if os.path.exists(DATASET_PATH):
    dataset = load_dataset("json", data_files=DATASET_PATH, split="train")
else:
    raise FileNotFoundError(f"Dataset file {DATASET_PATH} not found. Run prepare_kaggle_dataset.py first.")

# 5. Training Arguments Optimized for Tesla T4 16GB
training_args = TrainingArguments(
    output_dir=OUTPUT_DIR,
    per_device_train_batch_size=2,
    gradient_accumulation_steps=4,  # Effective Batch Size = 8
    learning_rate=2e-4,
    logging_steps=10,
    max_steps=1125,  # 3 Epochs over 3,000 samples
    save_strategy="steps",
    save_steps=350,
    fp16=True,
    optim="paged_adamw_8bit",
    lr_scheduler_type="cosine",
    warmup_ratio=0.03,
    report_to="none"
)

# 6. Trainer Initialization
trainer = SFTTrainer(
    model=model,
    train_dataset=dataset,
    peft_config=peft_config,
    dataset_text_field="text",
    max_seq_length=1024,
    tokenizer=tokenizer,
    args=training_args
)

# 7. Execute Fine-Tuning
print("Starting Qwen2.5-VL QLoRA Fine-Tuning for Earth Observation Grounding...")
trainer.train()

# 8. Save Model Weights & Tokenizer
print(f"Saving Industry-Ready Adapter Weights to {OUTPUT_DIR}...")
trainer.model.save_pretrained(OUTPUT_DIR)
tokenizer.save_pretrained(OUTPUT_DIR)

print(f"Training Complete! Adapter successfully saved to {OUTPUT_DIR}.")
