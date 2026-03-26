## 포메팅에 대한 metric
## - avg_line_length
## - std_line_length
## - blank_line_ratio
## - blank_run_entropy
## - indentation_depth_mean
## - indentation_depth_std
## - tab_ratio
## - trailing_whitespace_ratio
##- brace_same_line_ratio   # C/Java 계열일 때만

from __future__ import annotations

import math
from typing import Dict, List


FORMATTING_METRIC_COLUMNS = [
    "avg_line_length",
    "std_line_length",
    "blank_line_ratio",
    "blank_run_entropy",
    "indentation_depth_mean",
    "indentation_depth_std",
    "tab_ratio",
    "trailing_whitespace_ratio",
]


def _entropy(values: List[int]) -> float:
    if not values:
        return 0.0
    total = sum(values)
    if total == 0:
        return 0.0
    entropy = 0.0
    for v in values:
        p = v / total
        entropy -= p * math.log2(p)
    return float(entropy)


def _indent_width(line: str, tab_size: int = 4) -> int:
    width = 0
    for ch in line:
        if ch == " ":
            width += 1
        elif ch == "\t":
            width += tab_size
        else:
            break
    return width


def extract_formatting_features(code: str, language: str) -> Dict[str, float]:
    code = code or ""
    lines = code.splitlines()
    total_lines = max(1, len(lines))

    line_lengths = [len(line) for line in lines] if lines else [0]
    avg_line_length = sum(line_lengths) / len(line_lengths)
    std_line_length = math.sqrt(
        sum((x - avg_line_length) ** 2 for x in line_lengths) / len(line_lengths)
    ) if line_lengths else 0.0

    blank_lines = [line for line in lines if not line.strip()]
    blank_line_ratio = len(blank_lines) / total_lines

    blank_runs: List[int] = []
    current_run = 0
    for line in lines:
        if not line.strip():
            current_run += 1
        else:
            if current_run > 0:
                blank_runs.append(current_run)
                current_run = 0
    if current_run > 0:
        blank_runs.append(current_run)

    nonblank_lines = [line for line in lines if line.strip()]
    indent_widths = [_indent_width(line) for line in nonblank_lines]
    indentation_depth_mean = (
        sum(indent_widths) / len(indent_widths) if indent_widths else 0.0
    )
    indentation_depth_std = (
        math.sqrt(sum((x - indentation_depth_mean) ** 2 for x in indent_widths) / len(indent_widths))
        if indent_widths else 0.0
    )

    total_indent_chars = 0
    total_indent_tabs = 0
    trailing_ws_lines = 0

    for line in lines:
        indent = line[:len(line) - len(line.lstrip(" \t"))]
        total_indent_chars += len(indent)
        total_indent_tabs += indent.count("\t")

        if line.rstrip(" \t") != line:
            trailing_ws_lines += 1

    tab_ratio = (total_indent_tabs / total_indent_chars) if total_indent_chars else 0.0
    trailing_whitespace_ratio = trailing_ws_lines / total_lines

    return {
        "avg_line_length": float(avg_line_length),
        "std_line_length": float(std_line_length),
        "blank_line_ratio": float(blank_line_ratio),
        "blank_run_entropy": float(_entropy(blank_runs)),
        "indentation_depth_mean": float(indentation_depth_mean),
        "indentation_depth_std": float(indentation_depth_std),
        "tab_ratio": float(tab_ratio),
        "trailing_whitespace_ratio": float(trailing_whitespace_ratio),
    }