#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
import polars as pl
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC


FORMAT_COMMENT_PREFIXES = {
    "comment_line_ratio",
    "inline_comment_ratio",
    "block_comment_ratio",
    "docstring_ratio",
    "avg_comment_len",
    "informal_tag_ratio",
    "avg_line_length",
    "std_line_length",
    "blank_line_ratio",
    "blank_run_entropy",
    "indentation_depth_mean",
    "indentation_depth_std",
    "tab_ratio",
    "trailing_whitespace_ratio",
}

NAMING_FEATURES = {
    "avg_identifier_len",
    "std_identifier_len",
    "single_char_identifier_ratio",
    "camel_case_ratio",
    "snake_case_ratio",
    "digit_in_identifier_ratio",
    "repeated_identifier_ratio",
    "identifier_entropy",
}

COMMENTS_FEATURES = {
    "comment_line_ratio",
    "inline_comment_ratio",
    "block_comment_ratio",
    "docstring_ratio",
    "avg_comment_len",
    "informal_tag_ratio",
}

FORMATTING_FEATURES = {
    "avg_line_length",
    "std_line_length",
    "blank_line_ratio",
    "blank_run_entropy",
    "indentation_depth_mean",
    "indentation_depth_std",
    "tab_ratio",
    "trailing_whitespace_ratio",
}

COMPLEXITY_FEATURES = {
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
}


def parse_args():
    parser = argparse.ArgumentParser(description="Offline SVM evaluation on metrics parquet.")
    parser.add_argument("--output-dir", default="data/output")
    parser.add_argument("--report-path", default="data/output/eval_report.json")
    return parser.parse_args()


def load_data(output_dir: Path) -> Tuple[pl.DataFrame, pl.DataFrame]:
    metrics_df = pl.read_parquet(output_dir / "metrics.parquet")
    labels_df = pl.read_parquet(output_dir / "labels.parquet")
    return metrics_df, labels_df


def build_joined_df(metrics_df: pl.DataFrame, labels_df: pl.DataFrame) -> pl.DataFrame:
    return metrics_df.join(labels_df, on="block_id", how="inner")


def get_all_metric_columns(metrics_df: pl.DataFrame) -> List[str]:
    return [c for c in metrics_df.columns if c != "block_id"]


def feature_sets(all_cols: List[str]) -> Dict[str, List[str]]:
    lm_cols = [c for c in all_cols if c.startswith("lm_")]
    non_gameable = [c for c in all_cols if c not in FORMAT_COMMENT_PREFIXES]
    handcrafted = [c for c in all_cols if not c.startswith("lm_")]

    return {
        "full": list(all_cols),
        "non_gameable": non_gameable,
        "naming_only": [c for c in all_cols if c in NAMING_FEATURES],
        "comments_only": [c for c in all_cols if c in COMMENTS_FEATURES],
        "formatting_only": [c for c in all_cols if c in FORMATTING_FEATURES],
        "complexity_only": [c for c in all_cols if c in COMPLEXITY_FEATURES],
        "lm_only": lm_cols,
        "handcrafted_only": handcrafted,
        "handcrafted_plus_lm": list(all_cols),
    }


def evaluate_feature_set(df: pl.DataFrame, feature_cols: List[str]) -> Dict[str, float]:
    if not feature_cols:
        return {
            "n_features": 0,
            "accuracy": 0.0,
            "precision": 0.0,
            "recall": 0.0,
            "f1": 0.0,
            "roc_auc": 0.0,
        }

    train_df = df.filter(pl.col("split") == "train")
    test_df = df.filter(pl.col("split") == "test")

    if len(train_df) == 0 or len(test_df) == 0:
        raise RuntimeError("train/test split is empty. Rebuild dataset or check split policy.")

    X_train = train_df.select(feature_cols).fill_null(0.0).to_numpy()
    y_train = train_df["label"].to_numpy()

    X_test = test_df.select(feature_cols).fill_null(0.0).to_numpy()
    y_test = test_df["label"].to_numpy()

    clf = Pipeline([
        ("scaler", StandardScaler()),
        ("svm", SVC(kernel="rbf", C=1.0, gamma="scale", class_weight="balanced", probability=True)),
    ])
    clf.fit(X_train, y_train)

    y_pred = clf.predict(X_test)
    y_prob = clf.predict_proba(X_test)[:, 1]

    if len(np.unique(y_test)) > 1:
        roc_auc = float(roc_auc_score(y_test, y_prob))
    else:
        roc_auc = 0.0

    return {
        "n_features": int(len(feature_cols)),
        "accuracy": float(accuracy_score(y_test, y_pred)),
        "precision": float(precision_score(y_test, y_pred, zero_division=0)),
        "recall": float(recall_score(y_test, y_pred, zero_division=0)),
        "f1": float(f1_score(y_test, y_pred, zero_division=0)),
        "roc_auc": roc_auc,
    }


def evaluate_by_dataset(df: pl.DataFrame, feature_cols: List[str]) -> Dict[str, Dict[str, float]]:
    train_df = df.filter(pl.col("split") == "train")
    if len(train_df) == 0:
        return {}

    X_train = train_df.select(feature_cols).fill_null(0.0).to_numpy()
    y_train = train_df["label"].to_numpy()

    clf = Pipeline([
        ("scaler", StandardScaler()),
        ("svm", SVC(kernel="rbf", C=1.0, gamma="scale", class_weight="balanced", probability=True)),
    ])
    clf.fit(X_train, y_train)

    results: Dict[str, Dict[str, float]] = {}

    datasets = sorted(df["dataset"].unique().to_list())
    for ds in datasets:
        subset = df.filter((pl.col("split") == "test") & (pl.col("dataset") == ds))
        if len(subset) == 0:
            continue

        X_test = subset.select(feature_cols).fill_null(0.0).to_numpy()
        y_test = subset["label"].to_numpy()
        y_pred = clf.predict(X_test)
        y_prob = clf.predict_proba(X_test)[:, 1]

        roc_auc = float(roc_auc_score(y_test, y_prob)) if len(np.unique(y_test)) > 1 else 0.0

        results[str(ds)] = {
            "n_items": int(len(subset)),
            "accuracy": float(accuracy_score(y_test, y_pred)),
            "precision": float(precision_score(y_test, y_pred, zero_division=0)),
            "recall": float(recall_score(y_test, y_pred, zero_division=0)),
            "f1": float(f1_score(y_test, y_pred, zero_division=0)),
            "roc_auc": roc_auc,
        }

    return results


def main():
    args = parse_args()
    output_dir = Path(args.output_dir)

    metrics_df, labels_df = load_data(output_dir)
    df = build_joined_df(metrics_df, labels_df)

    all_cols = get_all_metric_columns(metrics_df)
    sets = feature_sets(all_cols)

    report = {
        "feature_sets": {},
        "by_dataset": {},
    }

    for name, cols in sets.items():
        if not cols:
            continue
        report["feature_sets"][name] = evaluate_feature_set(df, cols)
        report["by_dataset"][name] = evaluate_by_dataset(df, cols)

    report_path = Path(args.report_path)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    print(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"[write] {report_path}")


if __name__ == "__main__":
    main()