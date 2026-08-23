"""
Pan-India Crop Monitoring QLoRA Fine-Tuning Script for Qwen2.5-VL-7B
Optimized for Kaggle GPU (Tesla T4 16GB VRAM) / Google Colab.
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
MODEL_ID = "Qwen/Qwen2.5-VL-7B-Instruct"
DATASET_PATH = "pan_india_crop_dataset.jsonl"
OUTPUT_DIR = "./drishti_pan_india_crop_adapter"

# 2. 4-bit Quantization Config for 16GB VRAM
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.float16,
    bnb_4bit_use_double_quant=True
)

print(f"Loading Base Model: {MODEL_ID} in 4-bit NF4...")
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

# 3. LoRA Configuration
peft_config = LoraConfig(
    r=16,
    lora_alpha=32,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM"
)

model = get_peft_model(model, peft_config)
model.print_trainable_parameters()

# 4. Load Pan-India Dataset (2,500 Samples across 4 Zones)
print(f"Loading Dataset: {DATASET_PATH}...")
if os.path.exists(DATASET_PATH):
    dataset = load_dataset("json", data_files=DATASET_PATH, split="train")
else:
    print(f"Dataset file {DATASET_PATH} not found. Ensure dataset is uploaded to Kaggle input.")

# 5. Training Arguments
training_args = TrainingArguments(
    output_dir=OUTPUT_DIR,
    per_device_train_batch_size=2,
    gradient_accumulation_steps=4,  # Effective Batch Size = 8
    learning_rate=2e-4,
    logging_steps=10,
    max_steps=937, # 3 Epochs over 2,500 samples
    save_strategy="steps",
    save_steps=200,
    fp16=True,
    optim="paged_adamw_8bit",
    lr_scheduler_type="cosine",
    warmup_ratio=0.03,
    report_to="none"
)

# 6. SFT Trainer Initialization
trainer = SFTTrainer(
    model=model,
    train_dataset=dataset,
    peft_config=peft_config,
    dataset_text_field="text",
    max_seq_length=1024,
    tokenizer=tokenizer,
    args=training_args
)

# 7. Start Training
print("Starting Pan-India Crop Monitoring QLoRA Fine-Tuning...")
trainer.train()

# 8. Save Final QLoRA Adapter Weights
print(f"Saving QLoRA Adapter Weights to {OUTPUT_DIR}...")
trainer.model.save_pretrained(OUTPUT_DIR)
tokenizer.save_pretrained(OUTPUT_DIR)

print("Training Complete! Pan-India Crop QLoRA Adapter successfully created.")
