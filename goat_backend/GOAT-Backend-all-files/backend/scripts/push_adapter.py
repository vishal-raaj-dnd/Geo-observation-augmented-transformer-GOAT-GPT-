"""
push_adapter.py — Script for teammates to push their trained adapter to HuggingFace

Usage:
    python push_adapter.py \
        --adapter-path ./output/checkpoint-final \
        --domain flood \
        --hf-org eo-gpt-team

This script:
  1. Verifies the adapter files exist
  2. Creates the HF repo if it doesn't exist
  3. Pushes the adapter weights + config
  4. Prints the repo URL and loading instructions

Prerequisites:
  - Run `huggingface-cli login` first (one-time)
  - Or set HF_TOKEN environment variable
"""

import argparse
import os
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(
        description="Push a trained LoRA adapter to HuggingFace Hub"
    )
    parser.add_argument(
        "--adapter-path",
        type=str,
        required=True,
        help="Path to the saved adapter directory (contains adapter_config.json + adapter_model.safetensors)",
    )
    parser.add_argument(
        "--domain",
        type=str,
        required=True,
        choices=["flood_crop", "flood", "agriculture", "crop", "urban", "environment", "water", "general"],
        help="Domain name for this adapter (e.g. flood_crop, urban, environment, water, general)",
    )
    parser.add_argument(
        "--hf-org",
        type=str,
        default="ATLAS-GOAT",
        help="HuggingFace organization name (default: ATLAS-GOAT)",
    )
    parser.add_argument(
        "--token",
        type=str,
        default=None,
        help="HuggingFace write token (or set HF_TOKEN env variable)",
    )
    args = parser.parse_args()

    adapter_path = Path(args.adapter_path)
    clean_domain = args.domain.replace("_", "-")
    repo_id = f"{args.hf_org}/adapter-{clean_domain}"

    # ── Verify adapter files exist ──────────────────────────────
    config_file = adapter_path / "adapter_config.json"
    if not config_file.exists():
        print(f"ERROR: adapter_config.json not found in {adapter_path}")
        print("Make sure you pass the path to the saved adapter, e.g.:")
        print("  --adapter-path ./output/checkpoint-500")
        sys.exit(1)

    model_files = list(adapter_path.glob("adapter_model*"))
    if not model_files:
        print(f"ERROR: No adapter_model files found in {adapter_path}")
        sys.exit(1)

    total_size = sum(f.stat().st_size for f in model_files)
    print(f"Found adapter at: {adapter_path}")
    print(f"  Config: {config_file.name}")
    print(f"  Weights: {[f.name for f in model_files]}")
    print(f"  Total size: {total_size / 1e6:.1f} MB")
    print()

    # ── Push to HuggingFace ─────────────────────────────────────
    from huggingface_hub import HfApi

    token = args.token or os.environ.get("HF_TOKEN")
    api = HfApi(token=token)

    # Create repo if it doesn't exist
    try:
        api.create_repo(repo_id=repo_id, repo_type="model", exist_ok=True)
        print(f"HuggingFace repo ready: https://huggingface.co/{repo_id}")
    except Exception as e:
        print(f"Note: Could not create repo (may already exist or error): {e}")

    # Upload the adapter files (excluding intermediate training checkpoints)
    print(f"\nUploading adapter files to {repo_id}...")
    api.upload_folder(
        folder_path=str(adapter_path),
        repo_id=repo_id,
        repo_type="model",
        ignore_patterns=["checkpoint-*", "*.pt", "*.pth"],
        commit_message=f"Upload {args.domain} domain adapter weights and config",
    )

    print(f"\n{'='*60}")
    print(f"[SUCCESS] Adapter pushed successfully!")
    print(f"{'='*60}")
    print(f"\nRepo URL: https://huggingface.co/{repo_id}")
    print(f"\nTo load this adapter in the inference server:")
    print(f'  model.load_adapter("{repo_id}", adapter_name="{clean_domain}")')
    print(f"\nUpdate config.py ADAPTER_REPOS if the repo name differs:")
    print(f'  "{clean_domain}": "{repo_id}",')
    print()


if __name__ == "__main__":
    main()
