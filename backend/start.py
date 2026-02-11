#!/usr/bin/env python3
"""Startup script for Code Authorship Classifier API."""

import uvicorn
import argparse
import logging
import sys
from pathlib import Path


def check_data_files():
    """Check if required data files exist."""
    data_path = Path(__file__).parent.parent / "data" / "output"
    blocks_file = data_path / "blocks.parquet"

    if not blocks_file.exists():
        print(f"Warning: blocks.parquet not found at {blocks_file}")
        print("  Run: python pipeline/generate_mock.py")
        return False
    print(f"Found data: {blocks_file}")
    return True


def main():
    parser = argparse.ArgumentParser(description="Start Code Authorship Classifier API")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8004)
    parser.add_argument("--reload", action="store_true")
    parser.add_argument("--log-level", default="info",
                        choices=["debug", "info", "warning", "error"])
    args = parser.parse_args()

    logging.basicConfig(
        level=getattr(logging, args.log_level.upper()),
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        handlers=[logging.StreamHandler(sys.stdout)],
        force=True,
    )

    if not check_data_files():
        resp = input("\nData files not found. Continue? (y/N): ")
        if resp.lower() != "y":
            sys.exit(1)

    print(f"\nStarting Code Authorship Classifier API on port {args.port}")
    print(f"Docs: http://localhost:{args.port}/docs")

    uvicorn.run(
        "app.main:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        reload_dirs=["."],
        reload_excludes=["**/*.log", "__pycache__", ".git"],
        log_level=args.log_level.lower(),
    )


if __name__ == "__main__":
    main()
