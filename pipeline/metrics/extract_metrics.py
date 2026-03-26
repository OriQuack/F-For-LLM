from __future__ import annotations

from typing import Dict, Optional

from .ast_metrics import AST_OVERRIDE_COLUMNS, extract_ast_metrics
from .comments import COMMENTS_METRIC_COLUMNS, extract_comment_features
from .complexity import COMPLEXITY_METRIC_COLUMNS, extract_complexity_features
from .formatting import FORMATTING_METRIC_COLUMNS, extract_formatting_features
from .lexical import LEXICAL_METRIC_COLUMNS, extract_lexical_features
from .lm_probability import LM_METRIC_COLUMNS, LmProbabilityExtractor, zero_lm_features


_ALL_METRIC_COLUMNS = (
    LEXICAL_METRIC_COLUMNS
    + COMMENTS_METRIC_COLUMNS
    + FORMATTING_METRIC_COLUMNS
    + COMPLEXITY_METRIC_COLUMNS
    + LM_METRIC_COLUMNS
)


def get_metric_columns() -> list[str]:
    return list(_ALL_METRIC_COLUMNS)


def extract_metrics_for_block(
    code: str,
    language: str,
    prompt_text: Optional[str] = None,
    lm_extractor: Optional[LmProbabilityExtractor] = None,
) -> Dict[str, float]:
    metrics: Dict[str, float] = {k: 0.0 for k in _ALL_METRIC_COLUMNS}

    lexical = extract_lexical_features(code, language)
    comments = extract_comment_features(code, language)
    formatting = extract_formatting_features(code, language)
    complexity = extract_complexity_features(code, language)
    ast_metrics = extract_ast_metrics(code, language)

    metrics.update(lexical)
    metrics.update(comments)
    metrics.update(formatting)
    metrics.update(complexity)

    for k in AST_OVERRIDE_COLUMNS:
        if k in ast_metrics:
            metrics[k] = ast_metrics[k]

    if lm_extractor is not None:
        try:
            metrics.update(lm_extractor.extract(code, language))
        except Exception:
            metrics.update(zero_lm_features())
    else:
        metrics.update(zero_lm_features())

    return metrics