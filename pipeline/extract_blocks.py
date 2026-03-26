from __future__ import annotations

import ast
from dataclasses import dataclass
from typing import Dict, List, Optional

from .loaders.common import NormalizedSample, stable_int_id


@dataclass
class ExtractionConfig:
    min_loc: int = 3
    include_module_fallback: bool = True


def extract_blocks_from_sample(
    sample: NormalizedSample,
    config: Optional[ExtractionConfig] = None,
) -> List[dict]:
    """
    sample.code에서 block들을 추출.

    반환 dict는 build_dataset.py에서 바로 parquet row로 쓸 수 있게 맞춤.
    block_id / sample_id / pair_id는 상위 build 단계에서 채움.
    """
    cfg = config or ExtractionConfig()
    language = sample.language.lower()

    if language == "python":
        blocks = _extract_python_blocks(sample, cfg)
    elif language in {"java", "javascript", "typescript", "go", "rust"}:
        blocks = _extract_tree_sitter_blocks(sample, cfg)
    else:
        blocks = []

    if not blocks and cfg.include_module_fallback:
        blocks = [_build_module_block(sample)]

    return blocks


# =========================================================
# Common helpers
# =========================================================

def _file_id_for_sample(sample: NormalizedSample) -> int:
    return stable_int_id(f"file::{sample.sample_id}", digits=10)


def _file_path_for_sample(sample: NormalizedSample) -> str:
    if sample.source_path:
        return sample.source_path
    return f"{sample.dataset}/{sample.problem_id or sample.sample_id}.{sample.language}"


def _slice_code_by_lines(code: str, start_line: int, end_line: int) -> str:
    lines = code.splitlines(keepends=True)
    start_idx = max(start_line - 1, 0)
    end_idx = min(end_line, len(lines))
    sliced = "".join(lines[start_idx:end_idx])
    return sliced if sliced.endswith("\n") else sliced + "\n"


def _loc(start_line: int, end_line: int) -> int:
    return max(0, end_line - start_line + 1)


def _build_block_dict(
    sample: NormalizedSample,
    block_type: str,
    block_name: str,
    start_line: int,
    end_line: int,
    code: str,
) -> dict:
    return {
        "file_id": _file_id_for_sample(sample),
        "file_path": _file_path_for_sample(sample),
        "block_type": block_type,
        "block_name": block_name,
        "language": sample.language,
        "start_line": int(start_line),
        "end_line": int(end_line),
        "code": code if code.endswith("\n") else code + "\n",
    }


def _build_module_block(sample: NormalizedSample) -> dict:
    total_lines = max(1, len(sample.code.splitlines()))
    module_name = sample.problem_id or sample.sample_id
    return _build_block_dict(
        sample=sample,
        block_type="module",
        block_name=f"module_{module_name}",
        start_line=1,
        end_line=total_lines,
        code=sample.code,
    )


# =========================================================
# Python AST extractor
# =========================================================

def _extract_python_blocks(sample: NormalizedSample, cfg: ExtractionConfig) -> List[dict]:
    try:
        tree = ast.parse(sample.code)
    except SyntaxError:
        return []

    blocks: List[dict] = []

    # top-level function / async function
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            block = _python_node_to_block(sample, node, "function", cfg)
            if block is not None:
                blocks.append(block)

        elif isinstance(node, ast.ClassDef):
            # class 내부의 method만 추출
            for child in node.body:
                if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    block = _python_node_to_block(
                        sample=sample,
                        node=child,
                        block_type="method",
                        cfg=cfg,
                        class_name=node.name,
                    )
                    if block is not None:
                        blocks.append(block)

    return blocks


def _python_node_to_block(
    sample: NormalizedSample,
    node: ast.AST,
    block_type: str,
    cfg: ExtractionConfig,
    class_name: Optional[str] = None,
) -> Optional[dict]:
    if not hasattr(node, "lineno") or not hasattr(node, "end_lineno"):
        return None

    start_line = int(node.lineno)
    end_line = int(node.end_lineno)
    if _loc(start_line, end_line) < cfg.min_loc:
        return None

    code = _slice_code_by_lines(sample.code, start_line, end_line)

    name = getattr(node, "name", "anonymous")
    block_name = f"{class_name}.{name}" if class_name else name

    return _build_block_dict(
        sample=sample,
        block_type=block_type,
        block_name=block_name,
        start_line=start_line,
        end_line=end_line,
        code=code,
    )


# =========================================================
# Tree-sitter extractor for non-Python languages
# =========================================================

def _extract_tree_sitter_blocks(sample: NormalizedSample, cfg: ExtractionConfig) -> List[dict]:
    try:
        from tree_sitter_languages import get_parser
    except ImportError:
        # tree-sitter가 없으면 module fallback으로 넘어가게 빈 리스트 반환
        return []

    language = sample.language.lower()
    parser_name = _tree_sitter_language_name(language)
    if parser_name is None:
        return []

    try:
        parser = get_parser(parser_name)
    except Exception:
        return []

    code_bytes = sample.code.encode("utf-8", errors="ignore")
    tree = parser.parse(code_bytes)
    root = tree.root_node

    capture_types = _capture_node_types(language)
    blocks: List[dict] = []

    for node in _walk_tree(root):
        if node.type not in capture_types:
            continue

        start_line = int(node.start_point[0]) + 1
        end_line = int(node.end_point[0]) + 1

        if _loc(start_line, end_line) < cfg.min_loc:
            continue

        block_type = _node_type_to_block_type(language, node.type)
        block_name = _extract_ts_node_name(node, code_bytes) or f"{block_type}_{start_line}_{end_line}"
        code = _slice_code_by_lines(sample.code, start_line, end_line)

        blocks.append(
            _build_block_dict(
                sample=sample,
                block_type=block_type,
                block_name=block_name,
                start_line=start_line,
                end_line=end_line,
                code=code,
            )
        )

    return blocks


def _tree_sitter_language_name(language: str) -> Optional[str]:
    mapping = {
        "java": "java",
        "javascript": "javascript",
        "typescript": "typescript",
        "go": "go",
        "rust": "rust",
        # 필요하면 추후 cpp/c 등 추가
    }
    return mapping.get(language)


def _capture_node_types(language: str) -> set[str]:
    mapping = {
        "java": {
            "method_declaration",
            "constructor_declaration",
        },
        "javascript": {
            "function_declaration",
            "method_definition",
            "generator_function_declaration",
        },
        "typescript": {
            "function_declaration",
            "method_definition",
            "generator_function_declaration",
        },
        "go": {
            "function_declaration",
            "method_declaration",
        },
        "rust": {
            "function_item",
        },
    }
    return mapping.get(language, set())


def _node_type_to_block_type(language: str, node_type: str) -> str:
    if node_type in {"method_definition", "method_declaration", "constructor_declaration"}:
        return "method"
    return "function"


def _walk_tree(node):
    yield node
    for child in node.children:
        yield from _walk_tree(child)


def _extract_ts_node_name(node, code_bytes: bytes) -> Optional[str]:
    """
    tree-sitter node에서 name field를 우선적으로 읽고,
    없으면 identifier류 child를 찾아서 이름으로 사용.
    """
    try:
        name_node = node.child_by_field_name("name")
        if name_node is not None:
            return code_bytes[name_node.start_byte:name_node.end_byte].decode("utf-8", errors="ignore")
    except Exception:
        pass

    identifier_like = {
        "identifier",
        "property_identifier",
        "type_identifier",
        "field_identifier",
    }

    for child in node.children:
        if child.type in identifier_like:
            try:
                return code_bytes[child.start_byte:child.end_byte].decode("utf-8", errors="ignore")
            except Exception:
                return None
    return None