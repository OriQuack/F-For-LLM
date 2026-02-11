import { useState, useCallback, useEffect } from 'react'

export type ActiveListSource = 'all' | 'reject' | 'select'

export function useListNavigation(isDraggingThreshold: boolean) {
  const [activeListSource, setActiveListSource] = useState<ActiveListSource>('all')

  // Reset to 'all' when threshold drag starts
  useEffect(() => {
    if (isDraggingThreshold) {
      setActiveListSource('all')
    }
  }, [isDraggingThreshold])

  const isAllActive = activeListSource === 'all'
  const isRejectActive = activeListSource === 'reject'
  const isSelectActive = activeListSource === 'select'

  const setAll = useCallback(() => setActiveListSource('all'), [])
  const setReject = useCallback(() => setActiveListSource('reject'), [])
  const setSelect = useCallback(() => setActiveListSource('select'), [])

  return {
    activeListSource,
    setActiveListSource,
    isAllActive,
    isRejectActive,
    isSelectActive,
    setAll,
    setReject,
    setSelect,
  }
}
