#!/usr/bin/env python3
"""Simulate classroom datasets from labels.parquet.

Each "assignment" is a bundle of N distinct problems (one per student), so
every student gets a unique submission. Three datasets are emitted that share
the same student/assignment/problem skeleton; only which students used an LLM
differs. The 10% LLM-user set is a subset of 25%, which is a subset of 50%.
"""
from __future__ import annotations

import argparse
import random
from pathlib import Path

import polars as pl


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--labels", default="data/output/labels.parquet")
    p.add_argument("--output-dir", default="data/output")
    p.add_argument("--n-students", type=int, default=80)
    p.add_argument("--n-assignments", type=int, default=5)
    p.add_argument("--rates", nargs="+", type=float, default=[0.5, 0.25, 0.1])
    p.add_argument("--seed", type=int, default=42)
    return p.parse_args()


def main():
    args = parse_args()
    rng = random.Random(args.seed)
    labels = pl.read_parquet(args.labels)

    human_per_problem = (
        labels.filter(pl.col("label") == 0)
        .group_by("problem_id")
        .agg(pl.col("sample_id").unique().alias("human_samples"))
    )
    llm_per_problem = (
        labels.filter(pl.col("label") == 1)
        .group_by("problem_id")
        .agg(pl.col("sample_id").unique().alias("llm_samples"))
    )
    by_problem = human_per_problem.join(llm_per_problem, on="problem_id", how="inner")

    n_cells = args.n_students * args.n_assignments
    if by_problem.height < n_cells:
        raise RuntimeError(
            f"Need {n_cells} problems with both human + LLM, have {by_problem.height}"
        )

    problems = by_problem.to_dicts()
    rng.shuffle(problems)
    problems = problems[:n_cells]

    sample_to_blocks: dict[str, list[int]] = {
        row["sample_id"]: row["block_ids"]
        for row in labels.group_by("sample_id")
        .agg(pl.col("block_id").alias("block_ids"))
        .to_dicts()
    }

    cells = []
    idx = 0
    for assignment_id in range(args.n_assignments):
        for student_id in range(args.n_students):
            prob = problems[idx]
            idx += 1
            cells.append({
                "student_id": student_id,
                "assignment_id": assignment_id,
                "human_sample_id": rng.choice(prob["human_samples"]),
                "llm_sample_id": rng.choice(prob["llm_samples"]),
            })

    student_scores = [(sid, rng.random()) for sid in range(args.n_students)]
    student_scores.sort(key=lambda x: x[1])
    ranked_students = [s for s, _ in student_scores]

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    for rate in args.rates:
        n_llm = int(round(args.n_students * rate))
        llm_users = set(ranked_students[:n_llm])

        rows = []
        for cell in cells:
            used_llm = cell["student_id"] in llm_users
            sid = cell["llm_sample_id"] if used_llm else cell["human_sample_id"]
            for block_id in sample_to_blocks[sid]:
                rows.append({
                    "block_id": block_id,
                    "student_id": cell["student_id"],
                    "assignment_id": cell["assignment_id"],
                    "used_llm": used_llm,
                })

        sim_df = pl.DataFrame(rows)
        df = sim_df.join(labels, on="block_id", how="left", suffix="_orig")
        df = df.with_columns(pl.col("used_llm").cast(pl.Int64).alias("label"))
        if "label_orig" in df.columns:
            df = df.drop("label_orig")

        pct = int(round(rate * 100))
        out = output_dir / f"classroom_{pct}.parquet"
        df.write_parquet(out)
        print(f"[write] {out} ({df.height} blocks, {n_llm}/{args.n_students} LLM users)")


if __name__ == "__main__":
    main()
