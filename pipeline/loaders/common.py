from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from typing import Optional


@dataclass
class NormalizedSample:
    sample_id: str
    pair_id: str
    dataset: str
    language: str
    label: int               # 0 human / 1 llm
    ai_model: Optional[str]
    generation_mode: str     # direct_pair / scratch / fix_runtime / fix_wrong_answer / ...
    problem_id: Optional[str]
    group_id: str            # leakage 방지용 split key
    source_path: Optional[str]
    prompt_text: Optional[str]
    code: str


def stable_hash(text: str, length: int = 16) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:length]


def stable_int_id(text: str, digits: int = 12) -> int:
    hex_part = stable_hash(text, length=digits)
    return int(hex_part, 16)


def normalize_text(value: object) -> Optional[str]:
    if value is None:
        return None
    if not isinstance(value, str):
        value = str(value)

    value = value.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not value:
        return None
    return value


def normalize_code(code: object) -> Optional[str]:
    text = normalize_text(code)
    if text is None:
        return None
    return text + ("\n" if not text.endswith("\n") else "")


def normalize_language(lang: Optional[str]) -> Optional[str]:
    if lang is None:
        return None

    lang = lang.strip().lower()

    mapping = {
        "py": "python",
        "python3": "python",
        "python 3": "python",
        "cpython": "python",
        "java8": "java",
        "java 8": "java",
        "javascript": "javascript",
        "js": "javascript",
        "ts": "typescript",
        "typescript": "typescript",
        "golang": "go",
        "rs": "rust",
        "c++": "cpp",
        "cxx": "cpp",
        "cc": "cpp",
    }
    return mapping.get(lang, lang)


def infer_language_from_code(code: Optional[str]) -> str:
    """
    완벽한 판별기는 아니고, dataset에 language 컬럼이 없을 때 쓰는 보조 휴리스틱.
    HumanVsAICode는 viewer 상 명시 language 컬럼이 보이지 않아 fallback이 필요합니다.
    """
    if not code:
        return "text"

    text = code[:5000]

    # Python
    python_signals = [
        r"^\s*def\s+\w+\(",
        r"^\s*class\s+\w+\s*[:\(]",
        r"^\s*import\s+\w+",
        r"^\s*from\s+\w+(\.\w+)*\s+import\s+",
        r":\s*$",
        r"__name__\s*==\s*[\"']__main__[\"']",
    ]
    if sum(bool(re.search(p, text, re.MULTILINE)) for p in python_signals) >= 2:
        return "python"

    # Java
    java_signals = [
        r"\bpublic\s+class\b",
        r"\bprivate\s+static\b",
        r"\bSystem\.out\.println\b",
        r"\bimport\s+java\.",
        r"\bpackage\s+[a-zA-Z0-9_.]+;",
        r"\bthrows\s+\w+",
    ]
    if sum(bool(re.search(p, text)) for p in java_signals) >= 2:
        return "java"

    # JavaScript / TypeScript
    js_signals = [
        r"\bfunction\s+\w+\(",
        r"\bconst\s+\w+\s*=\s*\(",
        r"\blet\s+\w+\s*=",
        r"=>\s*{",
        r"\bconsole\.log\(",
    ]
    ts_signals = js_signals + [
        r"\binterface\s+\w+\s*{",
        r":\s*(string|number|boolean|unknown|any|void)\b",
        r"\btype\s+\w+\s*=",
    ]
    if sum(bool(re.search(p, text)) for p in ts_signals) >= 2:
        return "typescript"
    if sum(bool(re.search(p, text)) for p in js_signals) >= 2:
        return "javascript"

    # Go
    go_signals = [
        r"^\s*func\s+\w+\(",
        r"^\s*package\s+\w+",
        r"^\s*import\s+\(",
        r"\bfmt\.Println\(",
    ]
    if sum(bool(re.search(p, text, re.MULTILINE)) for p in go_signals) >= 2:
        return "go"

    # Rust
    rust_signals = [
        r"^\s*fn\s+\w+\(",
        r"\blet\s+mut\s+",
        r"\bprintln!\(",
        r"\bimpl\s+\w+",
        r"\buse\s+std::",
    ]
    if sum(bool(re.search(p, text, re.MULTILINE)) for p in rust_signals) >= 2:
        return "rust"

    return "text"


def build_prompt_from_docstring(docstring: Optional[str]) -> Optional[str]:
    docstring = normalize_text(docstring)
    if not docstring:
        return None
    return docstring


def build_codechef_prompt(problem: dict) -> Optional[str]:
    parts: list[str] = []

    def add(title: str, value: object):
        text = normalize_text(value)
        if text:
            parts.append(f"[{title}]\n{text}")

    add("Problem Name", problem.get("problem_name"))
    add("Problem Statement", problem.get("problem_statement"))
    add("Input Format", problem.get("input_format"))
    add("Output Format", problem.get("output_format"))
    add("Constraints", problem.get("constraints"))
    add("Subtasks", problem.get("subtasks"))

    sample_cases = problem.get("sample_test_cases")
    if isinstance(sample_cases, list) and sample_cases:
        rendered_cases = []
        for i, case in enumerate(sample_cases[:3], start=1):
            if not isinstance(case, dict):
                continue
            inp = normalize_text(case.get("input")) or ""
            out = normalize_text(case.get("output")) or ""
            exp = normalize_text(case.get("explanation")) or ""
            rendered_cases.append(
                f"[Sample Case {i}]\nInput:\n{inp}\n\nOutput:\n{out}\n\nExplanation:\n{exp}"
            )
        if rendered_cases:
            parts.append("\n\n".join(rendered_cases))

    if not parts:
        return None
    return "\n\n".join(parts)


def include_language(language: str, languages: Optional[set[str]]) -> bool:
    if languages is None:
        return True
    return language in languages