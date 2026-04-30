## 특정 데이터셋에는 이것이 작동한다는데 구현만 하고 안 쓸 예정

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from .comments import extract_comment_spans
from .lexical import extract_identifier_spans, is_identifier_like, is_special_text

LM_METRIC_COLUMNS = [
    "lm_all_avg_logprob",
    "lm_all_avg_rank",
    "lm_names_avg_logprob",
    "lm_special_avg_logprob",
    "lm_comments_avg_logprob",
    "lm_others_avg_logprob",
    "lm_names_scaled_sum",
    "lm_special_scaled_sum",
    "lm_comments_scaled_sum",
    "lm_others_scaled_sum",
]

try:
    import torch
    from transformers import AutoModelForMaskedLM, AutoTokenizer
except Exception:  # pragma: no cover
    torch = None
    AutoModelForMaskedLM = None
    AutoTokenizer = None


def zero_lm_features() -> Dict[str, float]:
    return {k: 0.0 for k in LM_METRIC_COLUMNS}


def _overlaps(span_a: Tuple[int, int], span_b: Tuple[int, int]) -> bool:
    return max(span_a[0], span_b[0]) < min(span_a[1], span_b[1])


@dataclass
class _TokenStat:
    category: str
    logprob: float
    rank: float


class LmProbabilityExtractor:
    """
    CodeBERT masked LM 기반 pseudo log-prob extractor.
    매우 느릴 수 있으므로 build 시 옵션으로 켜는 것을 권장합니다.
    """

    def __init__(
        self,
        model_name: str = "microsoft/codebert-base-mlm",
        max_length: int = 256,
        max_scored_tokens: int = 128,
        batch_size: int = 32,
        device: Optional[str] = None,
        fp16: Optional[bool] = None,
    ):
        self.model_name = model_name
        self.max_length = max_length
        self.max_scored_tokens = max_scored_tokens
        self.batch_size = batch_size
        self.device = device or ("cuda" if torch is not None and torch.cuda.is_available() else "cpu")
        # Default fp16 on cuda (≈2x speedup on Ampere+); never on cpu (slower in fp16).
        self.fp16 = fp16 if fp16 is not None else self.device.startswith("cuda")
        self._tokenizer = None
        self._model = None

    def is_available(self) -> bool:
        return AutoTokenizer is not None and AutoModelForMaskedLM is not None and torch is not None

    def _lazy_init(self):
        if not self.is_available():
            return
        if self._tokenizer is None:
            self._tokenizer = AutoTokenizer.from_pretrained(self.model_name, use_fast=True)
        if self._model is None:
            dtype = torch.float16 if self.fp16 else torch.float32
            self._model = AutoModelForMaskedLM.from_pretrained(self.model_name, torch_dtype=dtype)
            self._model.eval()
            self._model.to(self.device)

    def extract(self, code: str, language: str) -> Dict[str, float]:
        if not self.is_available():
            return zero_lm_features()

        self._lazy_init()
        tokenizer = self._tokenizer
        model = self._model

        if tokenizer is None or model is None:
            return zero_lm_features()

        encoding = tokenizer(
            code,
            return_tensors="pt",
            return_offsets_mapping=True,
            truncation=True,
            max_length=self.max_length,
        )

        input_ids = encoding["input_ids"][0]
        attention_mask = encoding["attention_mask"][0]
        offsets = encoding["offset_mapping"][0].tolist()
        special_ids = set(tokenizer.all_special_ids)
        mask_token_id = tokenizer.mask_token_id

        if mask_token_id is None:
            return zero_lm_features()

        comment_spans = extract_comment_spans(code, language)
        identifier_spans = extract_identifier_spans(code, language)

        candidate_positions: List[int] = []
        for i, tok_id in enumerate(input_ids.tolist()):
            if attention_mask[i].item() == 0:
                continue
            if tok_id in special_ids:
                continue
            start, end = offsets[i]
            if start == end:
                continue
            candidate_positions.append(i)

        candidate_positions = candidate_positions[: self.max_scored_tokens]
        if not candidate_positions:
            return zero_lm_features()

        # Categorize each candidate (pure python, no GPU work).
        categories: List[str] = []
        for pos in candidate_positions:
            start, end = offsets[pos]
            span = (int(start), int(end))
            text = code[start:end]
            if any(_overlaps(span, cspan) for cspan in comment_spans):
                categories.append("comments")
            elif any(_overlaps(span, ispan) for ispan in identifier_spans) or is_identifier_like(text, language):
                categories.append("names")
            elif is_special_text(text):
                categories.append("special")
            else:
                categories.append("others")

        n = len(candidate_positions)
        device = self.device

        with torch.no_grad():
            base_input_ids = input_ids.to(device)
            base_attn = attention_mask.to(device)

            # Build (N, L) batch where row i has position candidate_positions[i] masked.
            masked_batch = base_input_ids.unsqueeze(0).repeat(n, 1)
            attn_batch = base_attn.unsqueeze(0).expand(n, -1)
            positions_t = torch.tensor(candidate_positions, device=device, dtype=torch.long)
            row_idx = torch.arange(n, device=device)
            true_ids_t = masked_batch[row_idx, positions_t].clone()
            masked_batch[row_idx, positions_t] = mask_token_id

            logprobs_all = torch.empty(n, device=device, dtype=torch.float32)
            ranks_all = torch.empty(n, device=device, dtype=torch.long)

            for start in range(0, n, self.batch_size):
                end = min(start + self.batch_size, n)
                outputs = model(
                    input_ids=masked_batch[start:end],
                    attention_mask=attn_batch[start:end],
                )
                # (B, L, V) -> (B, V) at the masked column for each row.
                chunk_logits = outputs.logits[
                    torch.arange(end - start, device=device),
                    positions_t[start:end],
                ].float()
                chunk_true = true_ids_t[start:end].unsqueeze(1)
                log_probs = torch.log_softmax(chunk_logits, dim=-1)
                logprobs_all[start:end] = log_probs.gather(1, chunk_true).squeeze(1)
                true_logits = chunk_logits.gather(1, chunk_true)
                ranks_all[start:end] = (chunk_logits > true_logits).sum(dim=1) + 1

            logprobs_cpu = logprobs_all.cpu().tolist()
            ranks_cpu = ranks_all.cpu().tolist()

        token_stats = [
            _TokenStat(category=cat, logprob=lp, rank=float(rk))
            for cat, lp, rk in zip(categories, logprobs_cpu, ranks_cpu)
        ]
        return _aggregate_token_stats(token_stats)


def _aggregate_token_stats(token_stats: List[_TokenStat]) -> Dict[str, float]:
    if not token_stats:
        return zero_lm_features()

    by_cat = {
        "names": [],
        "special": [],
        "comments": [],
        "others": [],
    }
    all_logprobs = []
    all_ranks = []

    for stat in token_stats:
        by_cat[stat.category].append(stat.logprob)
        all_logprobs.append(stat.logprob)
        all_ranks.append(stat.rank)

    def avg(xs: List[float]) -> float:
        return float(sum(xs) / len(xs)) if xs else 0.0

    def scaled_sum(xs: List[float]) -> float:
        return float(sum(xs) / math.sqrt(len(xs))) if xs else 0.0

    return {
        "lm_all_avg_logprob": avg(all_logprobs),
        "lm_all_avg_rank": avg(all_ranks),
        "lm_names_avg_logprob": avg(by_cat["names"]),
        "lm_special_avg_logprob": avg(by_cat["special"]),
        "lm_comments_avg_logprob": avg(by_cat["comments"]),
        "lm_others_avg_logprob": avg(by_cat["others"]),
        "lm_names_scaled_sum": scaled_sum(by_cat["names"]),
        "lm_special_scaled_sum": scaled_sum(by_cat["special"]),
        "lm_comments_scaled_sum": scaled_sum(by_cat["comments"]),
        "lm_others_scaled_sum": scaled_sum(by_cat["others"]),
    }