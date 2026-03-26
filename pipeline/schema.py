"""
Parquet schema definitions for the Code Authorship Classifier.

blocks.parquet columns:
    block_id (int)       — unique identifier
    file_id (int)        — parent file identifier
    file_path (str)      — relative path to the source file
    block_type (str)     — 'function' | 'class' | 'method' | 'module'
    block_name (str)     — name of the code block
    language (str)       — programming language
    start_line (int)     — first line in file
    end_line (int)       — last line in file
    code (str)           — raw source code text

metrics.parquet columns:
    block_id (int)       — foreign key to blocks
    <metric_1> (float)   — dynamically discovered metric columns
    <metric_2> (float)   — ...
    Metric columns are discovered dynamically by the backend
    (all columns in metrics.parquet except block_id).
"""

NORMALIZED_SAMPLE_COLUMNS = [
    "sample_id",         # global unique ID
    "pair_id",           # 같은 문제/같은 prompt를 공유하는 묶음, block 단위로 나누었기 때문
    "dataset",           # Dataset 이름
    "language",          # python / java / ...
    "label",             # 0 human / 1 llm
    "ai_model",          # gpt-4 / chatgpt / deepseek / qwen / codestral ...
    "generation_mode",   # scratch / fix_runtime / fix_wrong_answer / direct_pair
    "problem_id",
    "group_id",          # split leakage 방지용
    "source_path",
    "prompt_text",
    "code",
]

BLOCK_COLUMNS = [
    "block_id",
    "sample_id",
    "pair_id",
    "file_id",
    "file_path",
    "block_type",
    "block_name",
    "language",
    "start_line",
    "end_line",
    "code",
]

LABEL_COLUMNS = [
    "block_id",
    "label",
    "dataset",
    "language",
    "ai_model",
    "generation_mode",
    "group_id",
    "split",   # train / val / test
]
