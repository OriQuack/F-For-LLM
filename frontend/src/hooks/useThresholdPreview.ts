import { useMemo } from 'react'
import type { SelectionState, SelectionSource } from '../types'
import type { CategoryCounts } from '../lib/histogram-utils'

export type { CategoryCounts }

export function useThresholdPreview(
  totalBlocks: number,
  selectionStates: Map<number, SelectionState>,
  selectionSources: Map<number, SelectionSource>,
  scores: Map<number, number>,
  selectThreshold: number,
  rejectThreshold: number,
  isDragging: boolean,
): { current: CategoryCounts; preview: CategoryCounts | null } {
  const current = useMemo(() => {
    let confirmed = 0, rejected = 0
    for (const [, state] of selectionStates) {
      if (state === 'selected') confirmed++
      else rejected++
    }
    return {
      confirmed,
      autoSelected: 0,
      rejected,
      autoRejected: 0,
      unsure: totalBlocks - confirmed - rejected,
    }
  }, [totalBlocks, selectionStates])

  // Project auto-tags based on current threshold positions (always when scores exist)
  const projected = useMemo(() => {
    if (scores.size === 0) return null

    let confirmed = 0, autoSelected = 0, rejected = 0, autoRejected = 0

    // All committed tags → solid categories
    for (const [, state] of selectionStates) {
      if (state === 'selected') confirmed++
      else rejected++
    }

    // Only untagged items → striped categories
    for (const [id, score] of scores) {
      if (selectionStates.has(id)) continue
      if (score >= selectThreshold) autoSelected++
      else if (score <= rejectThreshold) autoRejected++
    }

    return {
      confirmed,
      autoSelected,
      rejected,
      autoRejected,
      unsure: totalBlocks - confirmed - autoSelected - rejected - autoRejected,
    }
  }, [scores, selectionStates, selectionSources, selectThreshold, rejectThreshold, totalBlocks])

  const preview = isDragging ? projected : null

  return { current: projected ?? current, preview }
}
