import { useStore } from '../store'
import { useThresholdPreview } from '../hooks/useThresholdPreview'
import SelectionBar from './SelectionBar'
import '../styles/SelectionPanel.css'

export default function SelectionPanel() {
  const blocks = useStore((s) => s.blocks)
  const selectionStates = useStore((s) => s.blockSelectionStates)
  const selectionSources = useStore((s) => s.blockSelectionSources)
  const similarityScores = useStore((s) => s.similarityScores)
  const selectThreshold = useStore((s) => s.selectThreshold)
  const rejectThreshold = useStore((s) => s.rejectThreshold)
  const isDragging = useStore((s) => s.isDraggingThreshold)

  const total = blocks.length
  const { current, preview } = useThresholdPreview(
    total,
    selectionStates,
    selectionSources,
    similarityScores,
    selectThreshold,
    rejectThreshold,
    isDragging,
  )

  return (
    <div className="selection-panel">
      <div style={{ flex: 1, minHeight: 0 }}>
        <SelectionBar counts={current} previewCounts={preview} total={total} />
      </div>
    </div>
  )
}
