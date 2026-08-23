"""
inference.py — Multi-Adapter Inference Engine

Loads the base Qwen2.5-VL model once, then loads all available domain
adapters from their separate HuggingFace repos. Switches between adapters
per-request based on domain classification.

Architecture:
    [SDL Output] → [Qwen2.5-VL Processor] → [Base Model + Active LoRA] → Response
"""

import logging
import time
from typing import Optional

import torch
from PIL import Image

logger = logging.getLogger(__name__)


class InferenceEngine:
    """
    Manages the base model and all domain-specific LoRA adapters.

    Usage:
        engine = InferenceEngine()
        engine.load()                          # Load base + all adapters
        result = engine.generate(              # Run inference
            image=pil_image,
            query="Is this area flooded?",
            sdl_context="[SDL Context] ...",
            domain="flood",
        )
    """

    def __init__(self):
        self.model = None
        self.processor = None
        self.loaded_adapters: list[str] = []
        self.active_adapter: Optional[str] = None
        self.device = None
        self._is_loaded = False

    @property
    def is_loaded(self) -> bool:
        return self._is_loaded

    def load(self) -> None:
        """
        Load the base model and all available adapters.
        Call this once at server startup.
        """
        from transformers import Qwen2_5_VLForConditionalGeneration, AutoProcessor
        from config import BASE_MODEL_ID, ADAPTER_REPOS, LOAD_IN_4BIT

        logger.info(f"Loading base model: {BASE_MODEL_ID}")
        start = time.time()

        # ── Device setup ────────────────────────────────────────
        # On Hugging Face ZeroGPU, CUDA is only allocated inside @spaces.GPU functions.
        # We load model & adapters into memory at startup on CPU (in bfloat16/float16),
        # and move to CUDA dynamically inside the @spaces.GPU execution.
        self.device = torch.device("cpu")

        # ── Load processor (tokenizer + image processor) ────────
        self.processor = AutoProcessor.from_pretrained(
            BASE_MODEL_ID,
            trust_remote_code=True,
        )

        # ── Load base model ─────────────────────────────────────
        dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
        self.model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
            BASE_MODEL_ID,
            torch_dtype=dtype,
            trust_remote_code=True,
            low_cpu_mem_usage=True,
        )

        elapsed = time.time() - start
        logger.info(f"Base model loaded on CPU in {elapsed:.1f}s")

        # ── Load adapters ───────────────────────────────────────
        self._load_adapters(ADAPTER_REPOS)

        self._is_loaded = True
        logger.info(
            f"Inference engine ready. "
            f"Loaded adapters: {self.loaded_adapters or ['none (base model only)']}"
        )

    def _load_adapters(self, adapter_repos: dict[str, str]) -> None:
        """
        Attempt to load each adapter from its HuggingFace repo.
        Skips adapters that aren't available yet (teammates haven't pushed).
        """
        from peft import PeftModel

        first_adapter = True

        for domain_name, repo_id in adapter_repos.items():
            try:
                logger.info(f"Loading adapter '{domain_name}' from {repo_id}...")

                if first_adapter:
                    self.model = PeftModel.from_pretrained(
                        self.model,
                        repo_id,
                        adapter_name=domain_name,
                        torch_device="cpu",
                    )
                    first_adapter = False
                else:
                    self.model.load_adapter(
                        repo_id,
                        adapter_name=domain_name,
                        torch_device="cpu",
                    )

                self.loaded_adapters.append(domain_name)
                logger.info(f"  ✓ Adapter '{domain_name}' loaded successfully")

            except Exception as e:
                logger.warning(
                    f"  ✗ Could not load adapter '{domain_name}' from {repo_id}: {e}. "
                    f"Skipping — teammate may not have pushed yet."
                )

        # If no adapters loaded, model runs in base mode (no LoRA)
        if self.loaded_adapters:
            self.model.set_adapter(self.loaded_adapters[0])
            self.active_adapter = self.loaded_adapters[0]

    def set_domain(self, domain: str) -> str:
        """
        Switch to the adapter for the given domain.
        Handles domain alias mapping (e.g. 'flood' -> 'flood_crop').
        Returns the name of the active adapter.
        """
        from config import DOMAIN_TO_ADAPTER

        # Resolve alias if present (e.g. 'flood' -> 'flood_crop')
        target_adapter = DOMAIN_TO_ADAPTER.get(domain, domain)

        if target_adapter in self.loaded_adapters:
            self.model.set_adapter(target_adapter)
            self.active_adapter = target_adapter
            return target_adapter
        elif "general" in self.loaded_adapters:
            self.model.set_adapter("general")
            self.active_adapter = "general"
            return "general"
        elif self.loaded_adapters:
            # Fall back to whatever's loaded
            self.active_adapter = self.loaded_adapters[0]
            self.model.set_adapter(self.active_adapter)
            return self.active_adapter
        else:
            # No adapters loaded — base model
            self.active_adapter = None
            return "base (no adapter)"

    def classify_domain(self, query: str) -> str:
        """
        Simple keyword-based domain classifier.
        Maps a user query to a domain name.

        For production, replace this with a small text classifier.
        """
        from config import DOMAIN_KEYWORDS

        query_lower = query.lower()

        # Count keyword matches per domain
        scores = {}
        for domain, keywords in DOMAIN_KEYWORDS.items():
            scores[domain] = sum(1 for kw in keywords if kw in query_lower)

        # Pick the domain with the most keyword matches
        best_domain = max(scores, key=scores.get)

        if scores[best_domain] > 0:
            return best_domain
        else:
            return "general"

    def generate(
        self,
        image: Image.Image,
        query: str,
        sdl_context: str = "",
        domain: Optional[str] = None,
        max_new_tokens: Optional[int] = None,
    ) -> dict:
        """
        Run inference: image + query → response.

        Args:
            image: PIL RGB image (from SDL).
            query: User's natural-language query.
            sdl_context: Text context from SDL (spectral indices, coordinates).
            domain: Domain name. If None, auto-classified from query.
            max_new_tokens: Override max generation length.

        Returns:
            dict with: response_text, domain, adapter_used, processing_time_ms
        """
        from config import MAX_NEW_TOKENS, TEMPERATURE, TOP_P

        if not self._is_loaded:
            raise RuntimeError("Model not loaded. Call engine.load() first.")

        start = time.time()

        # ── Domain routing ──────────────────────────────────────
        if domain is None:
            domain = self.classify_domain(query)

        adapter_used = self.set_domain(domain)

        # ── Build the prompt ────────────────────────────────────
        #
        # Qwen2.5-VL uses a chat format with image tokens.
        # We inject the SDL context as a system-level preamble so
        # the LLM knows the spectral analysis results.
        #
        system_prompt = (
            "You are EO-GPT, an expert AI assistant for satellite imagery analysis. "
            "You analyse Earth Observation images and provide grounded, detailed "
            "assessments with confidence levels. "
            "Always state uncertainty when evidence is insufficient. "
            "Never fabricate geographic coordinates or precise measurements."
        )

        if sdl_context:
            system_prompt += f"\n\nThe following spectral analysis was performed on this image by the Spectral Decomposition Layer:\n{sdl_context}"

        messages = [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": image},
                    {"type": "text", "text": query},
                ],
            },
        ]

        # ── Prepare inputs ──────────────────────────────────────
        text_input = self.processor.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )

        inputs = self.processor(
            text=[text_input],
            images=[image],
            padding=True,
            return_tensors="pt",
        )

        # Move model to CUDA dynamically when inside @spaces.GPU
        target_device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        if self.model.device != target_device:
            self.model.to(target_device)
        self.device = target_device

        # Move inputs to device
        inputs = {k: v.to(target_device) for k, v in inputs.items()}

        # ── Generate ────────────────────────────────────────────
        tokens = max_new_tokens or MAX_NEW_TOKENS

        with torch.inference_mode():
            output_ids = self.model.generate(
                **inputs,
                max_new_tokens=tokens,
                temperature=TEMPERATURE,
                top_p=TOP_P,
                do_sample=True,
            )

        # ── Decode ──────────────────────────────────────────────
        # Trim the input tokens from the output
        generated_ids = output_ids[:, inputs["input_ids"].shape[1]:]
        response_text = self.processor.batch_decode(
            generated_ids,
            skip_special_tokens=True,
            clean_up_tokenization_spaces=True,
        )[0]

        elapsed_ms = (time.time() - start) * 1000

        return {
            "response_text": response_text.strip(),
            "domain": domain,
            "adapter_used": adapter_used,
            "processing_time_ms": round(elapsed_ms, 1),
        }

    def get_model_info(self) -> dict:
        """Return metadata about the loaded model and adapters."""
        from config import BASE_MODEL_ID, ADAPTER_REPOS

        info = {
            "base_model": BASE_MODEL_ID,
            "device": str(self.device),
            "loaded_adapters": self.loaded_adapters,
            "active_adapter": self.active_adapter,
            "available_adapters": list(ADAPTER_REPOS.keys()),
            "not_yet_loaded": [
                name for name in ADAPTER_REPOS
                if name not in self.loaded_adapters
            ],
        }

        if torch.cuda.is_available():
            info["gpu_name"] = torch.cuda.get_device_name(0)
            info["gpu_memory_allocated_gb"] = round(
                torch.cuda.memory_allocated() / 1e9, 2
            )
            try:
                props = torch.cuda.get_device_properties(0)
                mem = getattr(props, "total_memory", getattr(props, "total_mem", 0))
                info["gpu_memory_total_gb"] = round(mem / 1e9, 2)
            except Exception:
                pass

        return info
