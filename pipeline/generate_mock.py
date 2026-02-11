#!/usr/bin/env python3
"""Generate mock parquet files for development and testing."""

import polars as pl
import numpy as np
from pathlib import Path
import random

LANGUAGES = ["python", "javascript", "typescript", "rust", "go"]
BLOCK_TYPES = ["function", "class", "method", "module"]
MOCK_CODE_SNIPPETS = {
    "python": [
        'def hello(name):\n    """Greet someone."""\n    return f"Hello, {name}!"\n',
        'class Counter:\n    def __init__(self):\n        self.count = 0\n\n    def increment(self):\n        self.count += 1\n        return self.count\n',
        'def fibonacci(n):\n    if n <= 1:\n        return n\n    a, b = 0, 1\n    for _ in range(2, n + 1):\n        a, b = b, a + b\n    return b\n',
    ],
    "javascript": [
        'function debounce(fn, ms) {\n  let timer;\n  return (...args) => {\n    clearTimeout(timer);\n    timer = setTimeout(() => fn(...args), ms);\n  };\n}\n',
        'class EventEmitter {\n  constructor() {\n    this.events = {};\n  }\n  on(event, cb) {\n    (this.events[event] ??= []).push(cb);\n  }\n}\n',
    ],
    "typescript": [
        'interface Config {\n  host: string;\n  port: number;\n  debug?: boolean;\n}\n\nfunction createServer(config: Config) {\n  return { ...config, running: false };\n}\n',
    ],
    "rust": [
        'fn binary_search(arr: &[i32], target: i32) -> Option<usize> {\n    let (mut lo, mut hi) = (0, arr.len());\n    while lo < hi {\n        let mid = lo + (hi - lo) / 2;\n        match arr[mid].cmp(&target) {\n            std::cmp::Ordering::Equal => return Some(mid),\n            std::cmp::Ordering::Less => lo = mid + 1,\n            std::cmp::Ordering::Greater => hi = mid,\n        }\n    }\n    None\n}\n',
    ],
    "go": [
        'func Map[T, U any](s []T, f func(T) U) []U {\n\tresult := make([]U, len(s))\n\tfor i, v := range s {\n\t\tresult[i] = f(v)\n\t}\n\treturn result\n}\n',
    ],
}

METRIC_COLUMNS = [
    "avg_line_length",
    "cyclomatic_complexity",
    "halstead_volume",
    "comment_ratio",
    "identifier_entropy",
    "nesting_depth",
]


def generate_mock_data(n_blocks: int = 500, seed: int = 42):
    """Generate mock blocks.parquet and metrics.parquet."""
    rng = np.random.default_rng(seed)
    random.seed(seed)

    output_dir = Path(__file__).parent.parent / "data" / "output"
    output_dir.mkdir(parents=True, exist_ok=True)

    # Generate blocks
    blocks = []
    for i in range(n_blocks):
        lang = random.choice(LANGUAGES)
        block_type = random.choice(BLOCK_TYPES)
        snippets = MOCK_CODE_SNIPPETS.get(lang, MOCK_CODE_SNIPPETS["python"])
        code = random.choice(snippets)
        start_line = rng.integers(1, 500)
        n_lines = code.count("\n") + 1

        blocks.append({
            "block_id": i,
            "file_id": i // 5,
            "file_path": f"src/{lang}/module_{i // 5}.{lang[:2]}",
            "block_type": block_type,
            "block_name": f"{block_type}_{i}",
            "language": lang,
            "start_line": int(start_line),
            "end_line": int(start_line + n_lines),
            "code": code,
        })

    blocks_df = pl.DataFrame(blocks)
    blocks_df.write_parquet(output_dir / "blocks.parquet")
    print(f"Wrote {len(blocks_df)} blocks to {output_dir / 'blocks.parquet'}")

    # Generate metrics
    metrics_data = {"block_id": list(range(n_blocks))}
    for col in METRIC_COLUMNS:
        metrics_data[col] = rng.random(n_blocks).tolist()

    metrics_df = pl.DataFrame(metrics_data)
    metrics_df.write_parquet(output_dir / "metrics.parquet")
    print(f"Wrote {len(metrics_df)} metric rows to {output_dir / 'metrics.parquet'}")


if __name__ == "__main__":
    generate_mock_data()
