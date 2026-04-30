#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path
from typing import List, Optional, Set

import polars as pl
from tqdm import tqdm

try:
    from .extract_blocks import ExtractionConfig, extract_blocks_from_sample
    from .loaders import (
        NormalizedSample,
        load_aigcodeset,
        load_codechef_dataset,
        load_human_vs_ai_code,
    )
    from .metrics import LmProbabilityExtractor, extract_metrics_for_block
    from .split import assign_group_split, sample_group_key
except ImportError:
    from pipeline.extract_blocks import ExtractionConfig, extract_blocks_from_sample
    from pipeline.loaders import (
        NormalizedSample,
        load_aigcodeset,
        load_codechef_dataset,
        load_human_vs_ai_code,
    )
    from pipeline.metrics import LmProbabilityExtractor, extract_metrics_for_block
    from pipeline.split import assign_group_split, sample_group_key


def parse_args():
    parser = argparse.ArgumentParser(description="Build normalized block/metric parquet files.")
    parser.add_argument("--output-dir", default="data/output")
    parser.add_argument("--languages", nargs="+", default=["python"])
    parser.add_argument("--min-loc", type=int, default=3)

    parser.add_argument("--skip-humanvsai", action="store_true")
    parser.add_argument("--skip-codechef", action="store_true")
    parser.add_argument("--skip-aigcodeset", action="store_true")

    parser.add_argument("--humanvsai-split", default="train")
    parser.add_argument("--humanvsai-cache-dir", default=None)
    parser.add_argument("--humanvsai-limit-rows", type=int, default=None)

    parser.add_argument("--codechef-json", default=None)
    parser.add_argument("--codechef-max-human-per-problem", type=int, default=None)
    parser.add_argument("--codechef-max-ai-per-problem", type=int, default=None)

    parser.add_argument("--aigcodeset-split", default="all", choices=["train", "test", "all"])
    parser.add_argument("--aigcodeset-cache-dir", default=None)
    parser.add_argument("--aigcodeset-limit-rows", type=int, default=None)

    parser.add_argument("--enable-lm-features", action="store_true")
    parser.add_argument("--lm-model-name", default="microsoft/codebert-base-mlm")
    parser.add_argument("--lm-max-length", type=int, default=256)
    parser.add_argument("--lm-max-scored-tokens", type=int, default=128)
    parser.add_argument("--lm-batch-size", type=int, default=32)
    parser.add_argument("--lm-fp32", action="store_true", help="Disable fp16 even on CUDA.")

    return parser.parse_args()


def load_all_samples(args) -> List[NormalizedSample]:
    languages: Set[str] = {x.lower() for x in args.languages}
    samples: List[NormalizedSample] = []

    if not args.skip_humanvsai:
        hvai = load_human_vs_ai_code(
            split=args.humanvsai_split,
            cache_dir=args.humanvsai_cache_dir,
            languages=languages,
            limit_rows=args.humanvsai_limit_rows,
        )
        samples.extend(hvai)
        print(f"[load] HumanVsAICode: {len(hvai)} samples")

    if not args.skip_codechef and args.codechef_json:
        codechef = load_codechef_dataset(
            json_path=args.codechef_json,
            languages=languages,
            max_human_per_problem=args.codechef_max_human_per_problem,
            max_ai_per_problem=args.codechef_max_ai_per_problem,
        )
        samples.extend(codechef)
        print(f"[load] CodeChef: {len(codechef)} samples")
    elif not args.skip_codechef:
        print("[load] CodeChef skipped: --codechef-json not provided")

    if not args.skip_aigcodeset:
        aig = load_aigcodeset(
            split=args.aigcodeset_split,
            cache_dir=args.aigcodeset_cache_dir,
            languages=languages,
            limit_rows=args.aigcodeset_limit_rows,
        )
        samples.extend(aig)
        print(f"[load] AIGCodeSet: {len(aig)} samples")

    print(f"[load] total normalized samples: {len(samples)}")
    return samples


def main():
    args = parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    samples = load_all_samples(args)
    if not samples:
        raise RuntimeError("No samples loaded. Check dataset options.")

    split_map = assign_group_split(samples)
    block_cfg = ExtractionConfig(min_loc=args.min_loc)

    lm_extractor = None
    if args.enable_lm_features:
        lm_extractor = LmProbabilityExtractor(
            model_name=args.lm_model_name,
            max_length=args.lm_max_length,
            max_scored_tokens=args.lm_max_scored_tokens,
            batch_size=args.lm_batch_size,
            fp16=False if args.lm_fp32 else None,
        )
        print(
            f"[metric] LM features enabled (model={args.lm_model_name}, "
            f"batch_size={args.lm_batch_size}, fp16={not args.lm_fp32})"
        )
    else:
        print("[metric] LM features disabled (zero-filled)")

    blocks = []
    metrics = []
    labels = []

    next_block_id = 0

    pbar = tqdm(samples, desc="extract+metrics", unit="sample", dynamic_ncols=True)
    for sample in pbar:
        gkey = sample_group_key(sample)
        sample_split = split_map[gkey]

        sample_blocks = extract_blocks_from_sample(sample, config=block_cfg)
        if not sample_blocks:
            continue

        for block in sample_blocks:
            block_row = {
                "block_id": next_block_id,
                "sample_id": sample.sample_id,
                "pair_id": sample.pair_id,
                **block,
            }
            blocks.append(block_row)

            feat = extract_metrics_for_block(
                code=block["code"],
                language=block["language"],
                prompt_text=sample.prompt_text,
                lm_extractor=lm_extractor,
            )
            feat["block_id"] = next_block_id
            metrics.append(feat)

            labels.append({
                "block_id": next_block_id,
                "sample_id": sample.sample_id,
                "pair_id": sample.pair_id,
                "label": sample.label,
                "dataset": sample.dataset,
                "language": sample.language,
                "ai_model": sample.ai_model,
                "generation_mode": sample.generation_mode,
                "problem_id": sample.problem_id,
                "group_id": sample.group_id,
                "split": sample_split,
                "source_path": sample.source_path,
            })
            next_block_id += 1

        pbar.set_postfix(blocks=next_block_id)

    if not blocks:
        raise RuntimeError("No blocks extracted. Check extraction rules and min_loc.")

    blocks_df = pl.DataFrame(blocks)
    metrics_df = pl.DataFrame(metrics)
    labels_df = pl.DataFrame(labels)

    blocks_path = output_dir / "blocks.parquet"
    metrics_path = output_dir / "metrics.parquet"
    labels_path = output_dir / "labels.parquet"

    blocks_df.write_parquet(blocks_path)
    metrics_df.write_parquet(metrics_path)
    labels_df.write_parquet(labels_path)

    print(f"[write] {blocks_path} ({len(blocks_df)} rows)")
    print(f"[write] {metrics_path} ({len(metrics_df)} rows)")
    print(f"[write] {labels_path} ({len(labels_df)} rows)")

    print("[done] dataset build complete")


if __name__ == "__main__":
    main()