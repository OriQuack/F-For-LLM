import { useMemo, useRef } from 'react'
import type { CodeBlock } from '../types'

interface BoundaryResult {
  rejectBelow: CodeBlock[]
  selectAbove: CodeBlock[]
}

export function useBoundaryItems(
  blocks: CodeBlock[],
  scores: Map<number, number>,
  rejectThreshold: number,
  selectThreshold: number,
  hasHistogram: boolean,
): BoundaryResult {
  const prevRef = useRef<BoundaryResult>({ rejectBelow: [], selectAbove: [] })

  const result = useMemo(() => {
    if (!hasHistogram || scores.size === 0) {
      return prevRef.current
    }

    const rejectBelow: CodeBlock[] = []
    const selectAbove: CodeBlock[] = []

    for (const block of blocks) {
      const score = scores.get(block.block_id)
      if (score === undefined) continue
      if (score <= rejectThreshold) rejectBelow.push(block)
      else if (score >= selectThreshold) selectAbove.push(block)
    }

    // Sort: reject descending (closest to boundary first), select ascending
    rejectBelow.sort((a, b) => (scores.get(b.block_id) ?? 0) - (scores.get(a.block_id) ?? 0))
    selectAbove.sort((a, b) => (scores.get(a.block_id) ?? 0) - (scores.get(b.block_id) ?? 0))

    const val = { rejectBelow, selectAbove }
    prevRef.current = val
    return val
  }, [blocks, scores, rejectThreshold, selectThreshold, hasHistogram])

  return result
}
