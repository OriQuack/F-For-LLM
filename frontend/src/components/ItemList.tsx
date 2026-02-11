import { useRef, useCallback, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useStore } from '../store'
import { TagIndicator, DisagreementIndicator } from './Indicators'
import type { CodeBlock, SelectionState } from '../types'
import '../styles/ItemList.css'

interface Props {
  hideTagged: boolean
}

export default function ItemList({ hideTagged }: Props) {
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

  const parentRef = useRef<HTMLDivElement>(null)

  const filteredBlocks = useMemo(() => {
    let list = blocks

    // In bootstrap diversity mode, only show diversity items
    if (activeStage === 'bootstrap' && diversityIds.size > 0) {
      // Show all but diversity items first if we have scores
      if (similarityScores.size === 0) {
        list = blocks.filter((b) => diversityIds.has(b.block_id))
      }
    }

    if (activeStage === 'learn') {
      // Sort by |score| ascending (most uncertain first)
      list = [...list].sort((a, b) => {
        const sa = similarityScores.get(a.block_id)
        const sb = similarityScores.get(b.block_id)
        return (sa !== undefined ? Math.abs(sa) : Infinity) -
               (sb !== undefined ? Math.abs(sb) : Infinity)
      })
    } else if (activeStage === 'apply') {
      // Sort by |score| descending (most confident first)
      list = [...list].sort((a, b) => {
        const sa = similarityScores.get(a.block_id)
        const sb = similarityScores.get(b.block_id)
        return (sb !== undefined ? Math.abs(sb) : -Infinity) -
               (sa !== undefined ? Math.abs(sa) : -Infinity)
      })
    }

    if (hideTagged) {
      list = list.filter((b) => {
        // Hide if any committed tag exists (click or threshold)
        if (selectionStates.has(b.block_id)) return false
        // Hide if live-projected by thresholds
        const s = similarityScores.get(b.block_id)
        if (s !== undefined && (s >= selectThreshold || s <= rejectThreshold)) return false
        return true
      })
    }
    return list
  }, [blocks, activeStage, diversityIds, similarityScores, selectionStates, selectThreshold, rejectThreshold, hideTagged])

  const virtualizer = useVirtualizer({
    count: filteredBlocks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 10,
  })

  const handleClick = useCallback(
    (block: CodeBlock) => {
      setCurrentBlock(block.block_id)
    },
    [setCurrentBlock],
  )

  return (
    <div className="item-list" ref={parentRef}>
      <div className="item-count-badge">{filteredBlocks.length} blocks</div>
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
              {score !== undefined && (
                <span className="item-score">{score.toFixed(2)}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
