## human vs ai code 데이터셋 로더
## 이 데이터셋만 사용할 예정
## 참고로 언어 구별을 별도로 해줘야 함 -> loaders/common.py

from __future__ import annotations

from typing import List, Optional, Set

from .common import (
    NormalizedSample,
    build_prompt_from_docstring,
    include_language,
    infer_language_from_code,
    normalize_code,
    normalize_language,
    stable_hash,
)

try:
    from datasets import load_dataset
except ImportError:  # pragma: no cover
    load_dataset = None


DATASET_NAME = "OSS-forge/HumanVsAICode"


def load_human_vs_ai_code(
    split: str = "train",
    cache_dir: Optional[str] = None,
    languages: Optional[Set[str]] = None,
    limit_rows: Optional[int] = None,
) -> List[NormalizedSample]:
    """
    HumanVsAICode loader.

    한 row에서 최대 4개 샘플 생성:
    - human_code -> label 0
    - chatgpt_code -> label 1
    - dsc_code -> label 1
    - qwen_code -> label 1

    주의:
    - limit_rows는 '원본 row 수'가 아니라
      '언어 필터를 통과한 row 수' 기준으로 동작합니다.
    """
    if load_dataset is None:
        raise ImportError(
            "datasets 패키지가 필요합니다. "
            "pip install datasets"
        )

    ds = load_dataset(DATASET_NAME, split=split, cache_dir=cache_dir)
    samples: List[NormalizedSample] = []
    matched_rows = 0

    for row_idx, row in enumerate(ds):
        hm_index = str(row.get("hm_index") or f"row_{row_idx}")
        docstring = row.get("docstring")
        prompt_text = build_prompt_from_docstring(docstring)

        explicit_lang = normalize_language(row.get("language")) if "language" in row else None
        language = explicit_lang or infer_language_from_code(
            row.get("human_code")
            or row.get("chatgpt_code")
            or row.get("dsc_code")
            or row.get("qwen_code")
        )

        if not include_language(language, languages):
            continue

        matched_rows += 1
        if limit_rows is not None and matched_rows > limit_rows:
            break

        pair_id = stable_hash(f"{DATASET_NAME}|{hm_index}|{prompt_text or ''}")
        group_id = pair_id

        author_specs = [
            ("human", 0, None, row.get("human_code")),
            ("chatgpt", 1, "chatgpt", row.get("chatgpt_code")),
            ("deepseek", 1, "deepseek", row.get("dsc_code")),
            ("qwen", 1, "qwen", row.get("qwen_code")),
        ]

        for source_name, label, ai_model, raw_code in author_specs:
            code = normalize_code(raw_code)
            if not code:
                continue

            sample_id = stable_hash(f"{pair_id}|{source_name}|{label}")
            source_path = f"hf://{DATASET_NAME}/{split}/{hm_index}/{source_name}"

            samples.append(
                NormalizedSample(
                    sample_id=sample_id,
                    pair_id=pair_id,
                    dataset="human_vs_ai_code",
                    language=language,
                    label=label,
                    ai_model=ai_model,
                    generation_mode="direct_pair",
                    problem_id=hm_index,
                    group_id=group_id,
                    source_path=source_path,
                    prompt_text=prompt_text,
                    code=code,
                )
            )

    return samples