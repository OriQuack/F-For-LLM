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
    let confirmed = 0, autoSelected = 0, rejected = 0, autoRejected = 0
    for (const [id, state] of selectionStates) {
      const src = selectionSources.get(id)
      if (state === 'selected') {
        if (src === 'click') confirmed++
        else autoSelected++
      } else {
        if (src === 'click') rejected++
        else autoRejected++
      }
    }
    return {
      confirmed,
      autoSelected,
      rejected,
      autoRejected,
      unsure: totalBlocks - confirmed - autoSelected - rejected - autoRejected,
    }
  }, [totalBlocks, selectionStates, selectionSources])

  // Project auto-tags based on current threshold positions (always when scores exist)
  const projected = useMemo(() => {
    if (scores.size === 0) return null

    let confirmed = 0, autoSelected = 0, rejected = 0, autoRejected = 0
    // Start from manual counts
    for (const [id, state] of selectionStates) {
      const src = selectionSources.get(id)
      if (src === 'click') {
        if (state === 'selected') confirmed++
        else rejected++
      }
    }

    // Project auto-tags based on thresholds
    for (const [id, score] of scores) {
      if (selectionSources.get(id) === 'click') continue
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
