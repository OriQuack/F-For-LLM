## AIGcodeset 데이터셋 로더
## 아마도 안 쓸 예정

from __future__ import annotations

from typing import List, Optional, Set

from .common import (
    NormalizedSample,
    include_language,
    infer_language_from_code,
    normalize_code,
    stable_hash,
)

try:
    from datasets import concatenate_datasets, load_dataset
except ImportError:  # pragma: no cover
    load_dataset = None
    concatenate_datasets = None


DATASET_NAME = "basakdemirok/AIGCodeSet"


def _map_generation_mode(label: int, status_in_folder: Optional[str]) -> str:
    status = (status_in_folder or "").strip().lower()

    if label == 0:
        return "human_reference"

    if status == "generate":
        return "scratch"
    if status == "runtime":
        return "fix_runtime"
    if status == "wrong":
        return "fix_wrong_answer"
    return "unknown_llm_mode"


def _normalize_ai_model(llm_value: Optional[str]) -> Optional[str]:
    if llm_value is None:
        return None
    llm_value = str(llm_value).strip()
    if not llm_value or llm_value.lower() == "human":
        return None
    return llm_value.lower()


def load_aigcodeset(
    split: str = "all",   # "train", "test", "all"
    cache_dir: Optional[str] = None,
    languages: Optional[Set[str]] = None,
    limit_rows: Optional[int] = None,
) -> List[NormalizedSample]:
    if load_dataset is None:
        raise ImportError(
            "datasets 패키지가 필요합니다. "
            "pip install datasets"
        )

    if split == "all":
        if concatenate_datasets is None:
            raise ImportError("datasets.concatenate_datasets를 사용할 수 없습니다.")
        train_ds = load_dataset(DATASET_NAME, split="train", cache_dir=cache_dir)
        test_ds = load_dataset(DATASET_NAME, split="test", cache_dir=cache_dir)
        ds = concatenate_datasets([train_ds, test_ds])
        split_name = "all"
    else:
        ds = load_dataset(DATASET_NAME, split=split, cache_dir=cache_dir)
        split_name = split

    samples: List[NormalizedSample] = []

    for row_idx, row in enumerate(ds):
        if limit_rows is not None and row_idx >= limit_rows:
            break

        code = normalize_code(row.get("code"))
        if not code:
            continue

        label = int(row.get("label", 0))
        problem_id = str(row.get("problem_id") or f"unknown_problem_{row_idx}")
        submission_id = str(row.get("submission_id") or f"submission_{row_idx}")
        status_in_folder = row.get("status_in_folder")
        ai_model = _normalize_ai_model(row.get("LLM"))
        generation_mode = _map_generation_mode(label, status_in_folder)

        language = infer_language_from_code(code)
        if not include_language(language, languages):
            continue

        pair_id = stable_hash(f"aigcodeset|{problem_id}")
        group_id = problem_id
        sample_id = stable_hash(f"{pair_id}|{submission_id}|{label}|{ai_model}|{generation_mode}")
        source_path = f"hf://{DATASET_NAME}/{split_name}/{problem_id}/{submission_id}"

        samples.append(
            NormalizedSample(
                sample_id=sample_id,
                pair_id=pair_id,
                dataset="aigcodeset",
                language=language,
                label=label,
                ai_model=ai_model,
                generation_mode=generation_mode,
                problem_id=problem_id,
                group_id=group_id,
                source_path=source_path,
                prompt_text=None,
                code=code,
            )
        )

    return samples