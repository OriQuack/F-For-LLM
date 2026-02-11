import { useState, useMemo, useCallback } from 'react'
import type { SortMode, ActiveStage } from '../types'

export type BootstrapMode = 'diversity' | 'byScore'

export interface SortableListConfig<T, K> {
  items: T[]
  getItemKey: (item: T) => K
  getDefaultScore: (item: T) => number | null | undefined
  decisionMarginScores: Map<K, number>
  diversityIds?: Set<K>
  defaultLabel: string
}

export function useSortableList<T, K>({
  items,
  getItemKey,
  getDefaultScore,
  decisionMarginScores,
  diversityIds,
  defaultLabel,
}: SortableListConfig<T, K>) {
  const [sortMode, setSortMode] = useState<SortMode>('diversity')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const sortedItems = useMemo(() => {
    if (sortMode === 'diversity' && diversityIds && diversityIds.size > 0) {
      return items.filter((item) => diversityIds.has(getItemKey(item)))
    }

    if (sortMode === 'decisionMargin' && decisionMarginScores.size > 0) {
      return [...items].sort((a, b) => {
        const sa = decisionMarginScores.get(getItemKey(a))
        const sb = decisionMarginScores.get(getItemKey(b))
        const va = sa !== undefined ? Math.abs(sa) : Infinity
        const vb = sb !== undefined ? Math.abs(sb) : Infinity
        return sortDirection === 'asc' ? va - vb : vb - va
      })
    }

    return [...items].sort((a, b) => {
      const sa = getDefaultScore(a) ?? (sortDirection === 'desc' ? -Infinity : Infinity)
      const sb = getDefaultScore(b) ?? (sortDirection === 'desc' ? -Infinity : Infinity)
      return sortDirection === 'desc' ? sb - sa : sa - sb
    })
  }, [items, decisionMarginScores, diversityIds, sortMode, sortDirection, getItemKey, getDefaultScore])

  const toggleDirection = useCallback(() => {
    setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
  }, [])

  const columnHeader = useMemo(
    () => ({
      label:
        sortMode === 'decisionMargin'
          ? '|Margin|'
          : sortMode === 'diversity'
            ? '-'
            : defaultLabel,
      sortDirection: sortMode === 'diversity' ? undefined : sortDirection,
      onClick: toggleDirection,
    }),
    [sortMode, defaultLabel, sortDirection, toggleDirection],
  )

  const getDisplayScore = useCallback(
    (item: T): number | undefined => {
      if (sortMode === 'diversity') return undefined
      if (sortMode === 'decisionMargin') return decisionMarginScores.get(getItemKey(item))
      return getDefaultScore(item) ?? undefined
    },
    [sortMode, decisionMarginScores, getItemKey, getDefaultScore],
  )

  return {
    sortMode,
    setSortMode,
    sortDirection,
    setSortDirection,
    sortedItems,
    columnHeader,
    getDisplayScore,
  }
}

/** Convert stage to sort config. */
export function stageToSortConfig(
  stage: ActiveStage,
  bootstrapMode: BootstrapMode,
): { sortMode: SortMode; sortDirection: 'asc' | 'desc' } {
  switch (stage) {
    case 'bootstrap':
      return bootstrapMode === 'diversity'
        ? { sortMode: 'diversity', sortDirection: 'asc' }
        : { sortMode: 'default', sortDirection: 'desc' }
    case 'learn':
      return { sortMode: 'decisionMargin', sortDirection: 'asc' }
    case 'apply':
      return { sortMode: 'decisionMargin', sortDirection: 'desc' }
  }
}
