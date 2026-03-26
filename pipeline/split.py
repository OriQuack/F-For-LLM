from __future__ import annotations

import hashlib
from typing import Dict, Iterable

from .loaders.common import NormalizedSample


def sample_group_key(sample: NormalizedSample) -> str:
    return f"{sample.dataset}::{sample.group_id}"


def _stable_unit_float(key: str) -> float:
    digest = hashlib.md5(key.encode("utf-8")).hexdigest()
    value = int(digest[:8], 16)
    return value / 0xFFFFFFFF


def assign_group_split(
    samples: Iterable[NormalizedSample],
    train_ratio: float = 0.8,
    val_ratio: float = 0.1,
) -> Dict[str, str]:
    """
    같은 group_key는 반드시 같은 split으로 간다.
    반환 key는 sample_group_key(sample) 값이다.
    """
    split_map: Dict[str, str] = {}

    for sample in samples:
        gkey = sample_group_key(sample)
        if gkey in split_map:
            continue

        r = _stable_unit_float(gkey)
        if r < train_ratio:
            split = "train"
        elif r < train_ratio + val_ratio:
            split = "val"
        else:
            split = "test"

        split_map[gkey] = split

    return split_map