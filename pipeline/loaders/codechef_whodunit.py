## codechef 데이터셋 로더
## 아마도 안 쓸 예정

from __future__ import annotations

import json
from pathlib import Path
from typing import List, Optional, Set

from .common import (
    NormalizedSample,
    build_codechef_prompt,
    include_language,
    infer_language_from_code,
    normalize_code,
    normalize_language,
    stable_hash,
)

DEFAULT_AI_MODEL = "gpt-4-0613"


def load_codechef_dataset(
    json_path: str | Path,
    languages: Optional[Set[str]] = None,
    max_human_per_problem: Optional[int] = None,
    max_ai_per_problem: Optional[int] = None,
) -> List[NormalizedSample]:
    """
    Zenodo final_dataset.json / final_successful_dataset.json loader.

    JSON 구조:
    {
      "<difficulty>": {
        "<problem_code_id>": {
          ...,
          "problem_statement": ...,
          "input_format": ...,
          "output_format": ...,
          "constraints": ...,
          "sample_test_cases": [...],
          "ai_solutions": [...],
          "human_solutions": [{...,"language": "...", "code": "..."}]
        }
      }
    }
    """
    json_path = Path(json_path)
    with json_path.open("r", encoding="utf-8") as f:
        payload = json.load(f)

    samples: List[NormalizedSample] = []

    if not isinstance(payload, dict):
        raise ValueError(f"Unexpected CodeChef JSON format: {json_path}")

    for difficulty_level, problems in payload.items():
        if not isinstance(problems, dict):
            continue

        for problem_code_id, problem in problems.items():
            if not isinstance(problem, dict):
                continue

            prompt_text = build_codechef_prompt(problem)
            pair_id = stable_hash(f"codechef|{problem_code_id}")
            group_id = str(problem_code_id)

            # ------------------------------
            # Human solutions
            # ------------------------------
            human_solutions = problem.get("human_solutions", [])
            if isinstance(human_solutions, list):
                for human_idx, human in enumerate(human_solutions):
                    if max_human_per_problem is not None and human_idx >= max_human_per_problem:
                        break
                    if not isinstance(human, dict):
                        continue

                    code = normalize_code(human.get("code"))
                    if not code:
                        continue

                    lang = normalize_language(human.get("language")) or infer_language_from_code(code)
                    if not include_language(lang, languages):
                        continue

                    human_id = str(human.get("id") or human.get("solution") or f"h{human_idx}")
                    sample_id = stable_hash(f"{pair_id}|human|{human_id}")
                    source_path = (
                        f"{json_path.as_posix()}::"
                        f"{difficulty_level}/{problem_code_id}/human/{human_id}"
                    )

                    samples.append(
                        NormalizedSample(
                            sample_id=sample_id,
                            pair_id=pair_id,
                            dataset="codechef_whodunit",
                            language=lang,
                            label=0,
                            ai_model=None,
                            generation_mode="direct_problem_solution",
                            problem_id=str(problem_code_id),
                            group_id=group_id,
                            source_path=source_path,
                            prompt_text=prompt_text,
                            code=code,
                        )
                    )

            # ------------------------------
            # AI solutions
            # ------------------------------
            ai_solutions = problem.get("ai_solutions", [])
            if isinstance(ai_solutions, list):
                for ai_idx, ai_code_raw in enumerate(ai_solutions):
                    if max_ai_per_problem is not None and ai_idx >= max_ai_per_problem:
                        break

                    code = normalize_code(ai_code_raw)
                    if not code:
                        continue

                    lang = infer_language_from_code(code)
                    if not include_language(lang, languages):
                        continue

                    sample_id = stable_hash(f"{pair_id}|ai|{ai_idx}")
                    source_path = (
                        f"{json_path.as_posix()}::"
                        f"{difficulty_level}/{problem_code_id}/ai/{ai_idx}"
                    )

                    samples.append(
                        NormalizedSample(
                            sample_id=sample_id,
                            pair_id=pair_id,
                            dataset="codechef_whodunit",
                            language=lang,
                            label=1,
                            ai_model=DEFAULT_AI_MODEL,
                            generation_mode="direct_problem_solution",
                            problem_id=str(problem_code_id),
                            group_id=group_id,
                            source_path=source_path,
                            prompt_text=prompt_text,
                            code=code,
                        )
                    )

    return samples