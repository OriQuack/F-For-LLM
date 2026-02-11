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
