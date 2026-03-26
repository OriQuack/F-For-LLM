## 주석에 대한 metrics
##- comment_line_ratio
## - inline_comment_ratio
## - block_comment_ratio
## - docstring_ratio
## - avg_comment_len
## - informal_tag_ratio   # TODO, FIXME, XXX, HACK

from __future__ import annotations

import ast
import bisect
import io
import re
import tokenize
from typing import Dict, List, Set, Tuple


COMMENTS_METRIC_COLUMNS = [
    "comment_line_ratio",
    "inline_comment_ratio",
    "block_comment_ratio",
    "docstring_ratio",
    "avg_comment_len",
    "informal_tag_ratio",
]

INFORMAL_TAG_RE = re.compile(r"\b(?:TODO|FIXME|XXX|HACK|BUG|NOTE)\b", re.IGNORECASE)


def _build_line_offsets(code: str) -> List[int]:
    offsets = [0]
    total = 0
    for line in code.splitlines(keepends=True):
        total += len(line)
        offsets.append(total)
    return offsets


def _line_col_to_offset(line_offsets: List[int], line: int, col: int) -> int:
    line_index = max(1, line) - 1
    if line_index >= len(line_offsets):
        return line_offsets[-1]
    return line_offsets[line_index] + col


def _offset_to_line(line_offsets: List[int], offset: int) -> int:
    idx = bisect.bisect_right(line_offsets, offset) - 1
    return max(1, idx + 1)


def _span_to_lines(line_offsets: List[int], start: int, end: int) -> Set[int]:
    start_line = _offset_to_line(line_offsets, start)
    end_line = _offset_to_line(line_offsets, max(start, end - 1))
    return set(range(start_line, end_line + 1))


def _iter_python_docstring_exprs(tree: ast.AST) -> List[ast.Expr]:
    nodes: List[ast.Expr] = []

    def maybe_add_docstring(body: List[ast.stmt]):
        if not body:
            return
        first = body[0]
        if (
            isinstance(first, ast.Expr)
            and isinstance(first.value, ast.Constant)
            and isinstance(first.value.value, str)
        ):
            nodes.append(first)

    if isinstance(tree, ast.Module):
        maybe_add_docstring(tree.body)

    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            maybe_add_docstring(node.body)

    return nodes


def extract_comment_spans(code: str, language: str) -> List[Tuple[int, int]]:
    language = (language or "").lower()
    code = code or ""

    if language == "python":
        return _extract_python_comment_spans(code)
    return _extract_c_like_comment_spans(code, language)


def _extract_python_comment_spans(code: str) -> List[Tuple[int, int]]:
    line_offsets = _build_line_offsets(code)
    spans: List[Tuple[int, int]] = []

    try:
        tok_stream = tokenize.generate_tokens(io.StringIO(code).readline)
        for tok in tok_stream:
            if tok.type == tokenize.COMMENT:
                start = _line_col_to_offset(line_offsets, tok.start[0], tok.start[1])
                end = _line_col_to_offset(line_offsets, tok.end[0], tok.end[1])
                spans.append((start, end))
    except Exception:
        pass

    try:
        tree = ast.parse(code)
        for expr in _iter_python_docstring_exprs(tree):
            if hasattr(expr, "lineno") and hasattr(expr, "end_lineno"):
                start = _line_col_to_offset(line_offsets, expr.lineno, expr.col_offset)
                end = _line_col_to_offset(line_offsets, expr.end_lineno, expr.end_col_offset)
                spans.append((start, end))
    except Exception:
        pass

    spans.sort()
    return spans


def _extract_c_like_comment_spans(code: str, language: str) -> List[Tuple[int, int]]:
    spans: List[Tuple[int, int]] = []

    line_comment_markers = {
        "java": "//",
        "javascript": "//",
        "typescript": "//",
        "go": "//",
        "rust": "//",
        "cpp": "//",
        "c": "//",
    }
    marker = line_comment_markers.get(language)
    if marker:
        line_pat = re.compile(rf"{re.escape(marker)}.*?$", re.MULTILINE)
        spans.extend((m.start(), m.end()) for m in line_pat.finditer(code))

    block_pat = re.compile(r"/\*[\s\S]*?\*/")
    spans.extend((m.start(), m.end()) for m in block_pat.finditer(code))

    spans.sort()
    return spans


def extract_comment_features(code: str, language: str) -> Dict[str, float]:
    language = (language or "").lower()
    code = code or ""
    lines = code.splitlines()
    total_lines = max(1, len(lines))
    line_offsets = _build_line_offsets(code)

    comment_spans = extract_comment_spans(code, language)
    comment_lines: Set[int] = set()
    block_comment_lines: Set[int] = set()
    docstring_lines: Set[int] = set()
    comment_texts: List[str] = []

    inline_comment_count = 0

    if language == "python":
        try:
            tok_stream = tokenize.generate_tokens(io.StringIO(code).readline)
            for tok in tok_stream:
                if tok.type == tokenize.COMMENT:
                    start = _line_col_to_offset(line_offsets, tok.start[0], tok.start[1])
                    end = _line_col_to_offset(line_offsets, tok.end[0], tok.end[1])
                    text = code[start:end]
                    comment_texts.append(text)
                    line_set = _span_to_lines(line_offsets, start, end)
                    comment_lines.update(line_set)

                    line_text = lines[tok.start[0] - 1] if 0 <= tok.start[0] - 1 < len(lines) else ""
                    prefix = line_text[:tok.start[1]]
                    if prefix.strip():
                        inline_comment_count += 1
        except Exception:
            pass

        try:
            tree = ast.parse(code)
            for expr in _iter_python_docstring_exprs(tree):
                if hasattr(expr, "lineno") and hasattr(expr, "end_lineno"):
                    start = _line_col_to_offset(line_offsets, expr.lineno, expr.col_offset)
                    end = _line_col_to_offset(line_offsets, expr.end_lineno, expr.end_col_offset)
                    text = code[start:end]
                    comment_texts.append(text)
                    line_set = _span_to_lines(line_offsets, start, end)
                    comment_lines.update(line_set)
                    docstring_lines.update(line_set)
        except Exception:
            pass

    else:
        line_comment_pat = re.compile(r"//.*?$", re.MULTILINE)
        for m in line_comment_pat.finditer(code):
            text = m.group(0)
            comment_texts.append(text)
            line_set = _span_to_lines(line_offsets, m.start(), m.end())
            comment_lines.update(line_set)

            line_no = _offset_to_line(line_offsets, m.start())
            line_text = lines[line_no - 1] if 0 <= line_no - 1 < len(lines) else ""
            marker_idx = line_text.find("//")
            prefix = line_text[:marker_idx] if marker_idx >= 0 else ""
            if prefix.strip():
                inline_comment_count += 1

        block_pat = re.compile(r"/\*[\s\S]*?\*/")
        for m in block_pat.finditer(code):
            text = m.group(0)
            comment_texts.append(text)
            line_set = _span_to_lines(line_offsets, m.start(), m.end())
            comment_lines.update(line_set)
            block_comment_lines.update(line_set)

    avg_comment_len = (
        sum(len(t.strip()) for t in comment_texts) / len(comment_texts)
        if comment_texts else 0.0
    )
    informal_tag_ratio = (
        sum(1 for t in comment_texts if INFORMAL_TAG_RE.search(t)) / len(comment_texts)
        if comment_texts else 0.0
    )

    return {
        "comment_line_ratio": float(len(comment_lines) / total_lines),
        "inline_comment_ratio": float(inline_comment_count / total_lines),
        "block_comment_ratio": float(len(block_comment_lines) / total_lines),
        "docstring_ratio": float(len(docstring_lines) / total_lines),
        "avg_comment_len": float(avg_comment_len),
        "informal_tag_ratio": float(informal_tag_ratio),
    }