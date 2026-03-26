## structure
## - avg_line_length
## - std_line_length
## - blank_line_ratio
## - blank_run_entropy
## - indentation_depth_mean
## - indentation_depth_std
## - tab_ratio
## - trailing_whitespace_ratio
## - brace_same_line_ratio   # C/Java 계열일 때만


from __future__ import annotations

import re
from typing import Dict

from .lexical import simple_tokenize


COMPLEXITY_METRIC_COLUMNS = [
    "loc",
    "non_empty_loc",
    "token_count",
    "function_count",
    "avg_function_len",
    "cyclomatic_complexity",
    "max_nesting_depth",
    "loop_count",
    "branch_count",
    "exception_count",
    "return_count",
]


def _count_regex(pattern: str, code: str, flags: int = re.MULTILINE) -> int:
    return len(re.findall(pattern, code, flags))


def _generic_function_count(code: str, language: str) -> int:
    language = (language or "").lower()

    if language == "python":
        return _count_regex(r"^\s*(?:async\s+def|def)\s+[A-Za-z_][A-Za-z0-9_]*\s*\(", code)

    if language == "java":
        return _count_regex(
            r"^\s*(?:public|private|protected|static|final|synchronized|\s)*"
            r"[A-Za-z_<>\[\], ?]+\s+[A-Za-z_][A-Za-z0-9_]*\s*\([^;]*\)\s*\{?",
            code
        )

    if language in {"javascript", "typescript"}:
        return (
            _count_regex(r"^\s*function\s+[A-Za-z_][A-Za-z0-9_]*\s*\(", code) +
            _count_regex(r"^\s*(?:async\s+)?[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\)\s*\{", code) +
            _count_regex(r"=>\s*\{", code)
        )

    if language == "go":
        return _count_regex(r"^\s*func\s+(?:\([^)]+\)\s*)?[A-Za-z_][A-Za-z0-9_]*\s*\(", code)

    if language == "rust":
        return _count_regex(r"^\s*fn\s+[A-Za-z_][A-Za-z0-9_]*\s*\(", code)

    return 0


def _generic_loop_count(code: str, language: str) -> int:
    language = (language or "").lower()

    if language == "python":
        return (
            _count_regex(r"^\s*for\s+", code) +
            _count_regex(r"^\s*while\s+", code)
        )

    if language in {"java", "javascript", "typescript", "go", "rust", "cpp", "c"}:
        return (
            _count_regex(r"\bfor\s*\(", code) +
            _count_regex(r"\bwhile\s*\(", code) +
            _count_regex(r"\bfor\s+\w+\s+in\b", code)
        )

    return 0


def _generic_branch_count(code: str, language: str) -> int:
    return (
        _count_regex(r"\bif\b", code) +
        _count_regex(r"\belif\b", code) +
        _count_regex(r"\belse\b", code) +
        _count_regex(r"\bswitch\b", code) +
        _count_regex(r"\bcase\b", code) +
        _count_regex(r"\bmatch\b", code)
    )


def _generic_exception_count(code: str, language: str) -> int:
    return (
        _count_regex(r"\btry\b", code) +
        _count_regex(r"\bexcept\b", code) +
        _count_regex(r"\bcatch\b", code) +
        _count_regex(r"\bthrow\b", code) +
        _count_regex(r"\braise\b", code)
    )


def _generic_return_count(code: str) -> int:
    return _count_regex(r"\breturn\b", code)


def _brace_nesting_depth(code: str) -> int:
    depth = 0
    max_depth = 0

    for ch in code:
        if ch == "{":
            depth += 1
            max_depth = max(max_depth, depth)
        elif ch == "}":
            depth = max(0, depth - 1)

    return max_depth


def _python_indent_nesting_depth(code: str) -> int:
    lines = code.splitlines()
    max_depth = 0

    for line in lines:
        if not line.strip():
            continue

        stripped = line.lstrip(" \t")
        if stripped.startswith(("#", '"""', "'''")):
            continue

        indent = len(line) - len(stripped)
        depth = indent // 4
        max_depth = max(max_depth, depth)

    return max_depth


def extract_complexity_features(code: str, language: str) -> Dict[str, float]:
    code = code or ""
    language = (language or "").lower()
    lines = code.splitlines()

    loc = len(lines)
    non_empty_loc = sum(1 for line in lines if line.strip())
    token_count = len(simple_tokenize(code))
    function_count = _generic_function_count(code, language)
    avg_function_len = (non_empty_loc / function_count) if function_count > 0 else float(non_empty_loc)

    loop_count = _generic_loop_count(code, language)
    branch_count = _generic_branch_count(code, language)
    exception_count = _generic_exception_count(code, language)
    return_count = _generic_return_count(code)

    bool_ops = (
        _count_regex(r"\band\b", code) +
        _count_regex(r"\bor\b", code) +
        _count_regex(r"&&", code) +
        _count_regex(r"\|\|", code)
    )

    cyclomatic_complexity = 1 + loop_count + branch_count + exception_count + bool_ops
    max_nesting_depth = (
        _python_indent_nesting_depth(code)
        if language == "python"
        else _brace_nesting_depth(code)
    )

    return {
        "loc": float(loc),
        "non_empty_loc": float(non_empty_loc),
        "token_count": float(token_count),
        "function_count": float(function_count),
        "avg_function_len": float(avg_function_len),
        "cyclomatic_complexity": float(cyclomatic_complexity),
        "max_nesting_depth": float(max_nesting_depth),
        "loop_count": float(loop_count),
        "branch_count": float(branch_count),
        "exception_count": float(exception_count),
        "return_count": float(return_count),
    }