## 렉시컬하거나 기타 metric
## - unique_token_ratio
## - type_token_ratio
## - yules_k
## - zipf_alpha_proxy
## - identifier_ratio
## - literal_ratio
## - keyword_ratio
## - whitespace_ratio

from __future__ import annotations

import keyword
import math
import re
from collections import Counter
from typing import Dict, List, Set, Tuple


IDENTIFIER_RE = re.compile(r"\b[A-Za-z_][A-Za-z0-9_]*\b")
NUMBER_RE = re.compile(r"\b\d+(?:\.\d+)?\b")
STRING_RE = re.compile(r"""(\"\"\"[\s\S]*?\"\"\"|\'\'\'[\s\S]*?\'\'\'|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')""")
TOKEN_RE = re.compile(
    r"[A-Za-z_][A-Za-z0-9_]*"
    r"|\d+(?:\.\d+)?"
    r"|==|!=|<=|>=|->|=>|\+\+|--|\+=|-=|\*=|/=|%=|&&|\|\|"
    r"|[^\s]"
)

SPECIAL_CHAR_SET = set("(){}[];:,.+-*/%<>=!&|^~?@#\\")


LEXICAL_METRIC_COLUMNS = [
    "avg_identifier_len",
    "std_identifier_len",
    "single_char_identifier_ratio",
    "camel_case_ratio",
    "snake_case_ratio",
    "digit_in_identifier_ratio",
    "repeated_identifier_ratio",
    "identifier_entropy",
    "unique_token_ratio",
    "type_token_ratio",
    "yules_k",
    "zipf_alpha_proxy",
    "identifier_ratio",
    "literal_ratio",
    "keyword_ratio",
    "whitespace_ratio",
]


JAVA_KEYWORDS = {
    "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char",
    "class", "const", "continue", "default", "do", "double", "else", "enum",
    "extends", "final", "finally", "float", "for", "goto", "if", "implements",
    "import", "instanceof", "int", "interface", "long", "native", "new",
    "package", "private", "protected", "public", "return", "short", "static",
    "strictfp", "super", "switch", "synchronized", "this", "throw", "throws",
    "transient", "try", "void", "volatile", "while", "true", "false", "null",
}

JS_TS_KEYWORDS = {
    "break", "case", "catch", "class", "const", "continue", "debugger", "default",
    "delete", "do", "else", "export", "extends", "false", "finally", "for",
    "function", "if", "import", "in", "instanceof", "let", "new", "null",
    "return", "super", "switch", "this", "throw", "true", "try", "typeof",
    "var", "void", "while", "with", "yield", "async", "await", "interface",
    "type", "implements", "enum", "namespace", "private", "protected", "public",
    "readonly", "unknown", "any", "never",
}

GO_KEYWORDS = {
    "break", "case", "chan", "const", "continue", "default", "defer", "else",
    "fallthrough", "for", "func", "go", "goto", "if", "import", "interface",
    "map", "package", "range", "return", "select", "struct", "switch", "type",
    "var", "true", "false", "nil",
}

RUST_KEYWORDS = {
    "as", "break", "const", "continue", "crate", "else", "enum", "extern",
    "false", "fn", "for", "if", "impl", "in", "let", "loop", "match", "mod",
    "move", "mut", "pub", "ref", "return", "self", "Self", "static", "struct",
    "super", "trait", "true", "type", "unsafe", "use", "where", "while",
}


def get_keyword_set(language: str) -> Set[str]:
    language = (language or "").lower()
    if language == "python":
        return set(keyword.kwlist)
    if language == "java":
        return JAVA_KEYWORDS
    if language in {"javascript", "typescript"}:
        return JS_TS_KEYWORDS
    if language == "go":
        return GO_KEYWORDS
    if language == "rust":
        return RUST_KEYWORDS
    return set()


def simple_tokenize(code: str) -> List[str]:
    return TOKEN_RE.findall(code or "")


def extract_identifier_tokens(code: str, language: str) -> List[str]:
    kw = get_keyword_set(language)
    return [
        tok for tok in IDENTIFIER_RE.findall(code or "")
        if tok not in kw
    ]


def extract_identifier_spans(code: str, language: str) -> List[Tuple[int, int]]:
    kw = get_keyword_set(language)
    spans: List[Tuple[int, int]] = []
    for m in IDENTIFIER_RE.finditer(code or ""):
        tok = m.group(0)
        if tok in kw:
            continue
        spans.append((m.start(), m.end()))
    return spans


def is_identifier_like(text: str, language: str) -> bool:
    if not text:
        return False
    if not IDENTIFIER_RE.fullmatch(text):
        return False
    return text not in get_keyword_set(language)


def is_special_text(text: str) -> bool:
    stripped = (text or "").strip()
    return bool(stripped) and all(ch in SPECIAL_CHAR_SET for ch in stripped)


def _is_camel_case(name: str) -> bool:
    if "_" in name:
        return False
    if not any(ch.isalpha() for ch in name):
        return False
    return (
        any(ch.islower() for ch in name) and
        any(ch.isupper() for ch in name) and
        name[0].islower()
    )


def _is_snake_case(name: str) -> bool:
    return (
        "_" in name and
        name.lower() == name and
        IDENTIFIER_RE.fullmatch(name) is not None
    )


def _entropy_from_counter(counter: Counter) -> float:
    total = sum(counter.values())
    if total == 0:
        return 0.0
    entropy = 0.0
    for c in counter.values():
        p = c / total
        entropy -= p * math.log2(p)
    return float(entropy)


def _yules_k(tokens: List[str]) -> float:
    if not tokens:
        return 0.0
    counts = Counter(tokens)
    m1 = len(tokens)
    m2 = sum(v * v for v in counts.values())
    return float(10000.0 * (m2 - m1) / (m1 * m1))


def _zipf_alpha_proxy(tokens: List[str]) -> float:
    if not tokens:
        return 0.0
    counts = Counter(tokens)
    freqs = sorted(counts.values(), reverse=True)
    if len(freqs) < 2:
        return 0.0

    xs = [math.log(i + 1) for i in range(len(freqs))]
    ys = [math.log(f) for f in freqs]

    x_mean = sum(xs) / len(xs)
    y_mean = sum(ys) / len(ys)

    denom = sum((x - x_mean) ** 2 for x in xs)
    if denom == 0:
        return 0.0

    slope = sum((x - x_mean) * (y - y_mean) for x, y in zip(xs, ys)) / denom
    return float(-slope)


def extract_lexical_features(code: str, language: str) -> Dict[str, float]:
    code = code or ""
    tokens = simple_tokenize(code)
    normalized_tokens = [t.lower() for t in tokens]
    identifiers = extract_identifier_tokens(code, language)
    identifier_counts = Counter(identifiers)
    keyword_set = get_keyword_set(language)

    identifier_lens = [len(x) for x in identifiers]
    literal_count = len(NUMBER_RE.findall(code)) + len(STRING_RE.findall(code))
    keyword_count = sum(1 for t in tokens if t in keyword_set)
    whitespace_chars = sum(1 for ch in code if ch.isspace())

    total_tokens = len(tokens)
    total_identifiers = len(identifiers)
    total_chars = len(code)

    if total_identifiers > 0:
        avg_identifier_len = sum(identifier_lens) / total_identifiers
        mean_len = avg_identifier_len
        std_identifier_len = math.sqrt(
            sum((x - mean_len) ** 2 for x in identifier_lens) / total_identifiers
        )
        single_char_identifier_ratio = sum(1 for x in identifiers if len(x) == 1) / total_identifiers
        camel_case_ratio = sum(1 for x in identifiers if _is_camel_case(x)) / total_identifiers
        snake_case_ratio = sum(1 for x in identifiers if _is_snake_case(x)) / total_identifiers
        digit_in_identifier_ratio = sum(1 for x in identifiers if any(ch.isdigit() for ch in x)) / total_identifiers
        repeated_identifier_ratio = 1.0 - (len(identifier_counts) / total_identifiers)
        identifier_entropy = _entropy_from_counter(identifier_counts)
    else:
        avg_identifier_len = 0.0
        std_identifier_len = 0.0
        single_char_identifier_ratio = 0.0
        camel_case_ratio = 0.0
        snake_case_ratio = 0.0
        digit_in_identifier_ratio = 0.0
        repeated_identifier_ratio = 0.0
        identifier_entropy = 0.0

    unique_token_ratio = (len(set(tokens)) / total_tokens) if total_tokens else 0.0
    type_token_ratio = (len(set(normalized_tokens)) / total_tokens) if total_tokens else 0.0
    yules_k = _yules_k(normalized_tokens)
    zipf_alpha_proxy = _zipf_alpha_proxy(normalized_tokens)
    identifier_ratio = (total_identifiers / total_tokens) if total_tokens else 0.0
    literal_ratio = (literal_count / total_tokens) if total_tokens else 0.0
    keyword_ratio = (keyword_count / total_tokens) if total_tokens else 0.0
    whitespace_ratio = (whitespace_chars / total_chars) if total_chars else 0.0

    return {
        "avg_identifier_len": float(avg_identifier_len),
        "std_identifier_len": float(std_identifier_len),
        "single_char_identifier_ratio": float(single_char_identifier_ratio),
        "camel_case_ratio": float(camel_case_ratio),
        "snake_case_ratio": float(snake_case_ratio),
        "digit_in_identifier_ratio": float(digit_in_identifier_ratio),
        "repeated_identifier_ratio": float(repeated_identifier_ratio),
        "identifier_entropy": float(identifier_entropy),
        "unique_token_ratio": float(unique_token_ratio),
        "type_token_ratio": float(type_token_ratio),
        "yules_k": float(yules_k),
        "zipf_alpha_proxy": float(zipf_alpha_proxy),
        "identifier_ratio": float(identifier_ratio),
        "literal_ratio": float(literal_ratio),
        "keyword_ratio": float(keyword_ratio),
        "whitespace_ratio": float(whitespace_ratio),
    }