import { useMemo } from 'react'
import type { SelectionState } from '../types'

export function useTaggingStatus(
  totalCount: number,
  selectionStates: Map<number, SelectionState>,
) {
  return useMemo(() => {
    let selectedCount = 0
    let rejectedCount = 0
    for (const state of selectionStates.values()) {
      if (state === 'selected') selectedCount++
      else rejectedCount++
    }
    const taggedCount = selectedCount + rejectedCount
    return {
      allTagged: taggedCount >= totalCount,
      taggedCount,
      untaggedCount: totalCount - taggedCount,
      selectedCount,
      rejectedCount,
      totalCount,
    }
  }, [totalCount, selectionStates])
}
