import { useRef, useCallback, useMemo, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useStore } from '../store'
import { TagIndicator, DisagreementIndicator } from './Indicators'
import type { CodeBlock, SelectionState } from '../types'
import '../styles/ItemList.css'

export default function ItemList() {
  const blocks = useStore((s) => s.blocks)
  const currentBlockId = useStore((s) => s.currentBlockId)
  const setCurrentBlock = useStore((s) => s.setCurrentBlock)
  const selectionStates = useStore((s) => s.blockSelectionStates)
  const similarityScores = useStore((s) => s.similarityScores)
  const diversityIds = useStore((s) => s.diversityIds)
  const activeStage = useStore((s) => s.activeStage)
  const committeeVotes = useStore((s) => s.committeeVotes)
  const selectThreshold = useStore((s) => s.selectThreshold)
  const rejectThreshold = useStore((s) => s.rejectThreshold)
  const hideTagged = useStore((s) => s.hideTagged)
  const showDisagreementOnly = useStore((s) => s.showDisagreementOnly)

  const parentRef = useRef<HTMLDivElement>(null)
  const filteredBlocksRef = useRef<CodeBlock[]>([])

  const filteredBlocks = useMemo(() => {
    return useStore.getState().getFilteredBlocks()
  }, [blocks, activeStage, diversityIds, similarityScores, selectionStates, selectThreshold, rejectThreshold, hideTagged, showDisagreementOnly, committeeVotes])

  filteredBlocksRef.current = filteredBlocks

  const virtualizer = useVirtualizer({
    count: filteredBlocks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 10,
  })

  useEffect(() => {
    if (currentBlockId === null) return
    const idx = filteredBlocksRef.current.findIndex((b) => b.block_id === currentBlockId)
    if (idx >= 0) {
      virtualizer.scrollToIndex(idx, { align: 'auto' })
    }
  }, [currentBlockId])

  const handleClick = useCallback(
    (block: CodeBlock) => {
      setCurrentBlock(block.block_id)
    },
    [setCurrentBlock],
  )

  return (
    <div className="item-list" ref={parentRef}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((vItem) => {
          const block = filteredBlocks[vItem.index]
          const isCurrent = block.block_id === currentBlockId
          const state = selectionStates.get(block.block_id)
          const score = similarityScores.get(block.block_id)

          let rowClass = 'item-list-row'
          if (isCurrent) rowClass += ' current'

          // Determine effective tag: committed state or live threshold preview
          let effectiveState: SelectionState | undefined = state
          let isProjected = false
          if (!state && score !== undefined) {
            // Only project from score + thresholds for items without committed tags
            if (score >= selectThreshold) {
              effectiveState = 'selected'
              isProjected = true
            } else if (score <= rejectThreshold) {
              effectiveState = 'rejected'
              isProjected = true
            }
          }

          return (
            <div
              key={block.block_id}
              className={rowClass}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: vItem.size,
                transform: `translateY(${vItem.start}px)`,
              }}
              onClick={() => handleClick(block)}
            >
              <span className="item-name">{block.block_name}</span>
              {activeStage === 'apply' && (
                <DisagreementIndicator voteInfo={committeeVotes.get(block.block_id)} />
              )}
              <TagIndicator state={effectiveState} isAuto={isProjected} />
              {score !== undefined && activeStage !== 'bootstrap' && (
                <span className="item-score">{score.toFixed(2)}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
