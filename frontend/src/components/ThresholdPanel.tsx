import { useStore } from '../store'
import { useFlipTracking } from '../hooks/useFlipTracking'
import { fetchClassroomExport, type BlockResult } from '../api'
import DecisionMarginHistogram from './DecisionMarginHistogram'
import ConvergenceIndicator from './ConvergenceIndicator'
import '../styles/ThresholdPanel.css'

export default function ThresholdPanel() {
  const blocks = useStore((s) => s.blocks)
  const histogramData = useStore((s) => s.histogramData)
  const histogramStats = useStore((s) => s.histogramStatistics)
  const applyThresholdTags = useStore((s) => s.applyThresholdTags)
  const activeStage = useStore((s) => s.activeStage)
  const blockSelectionStates = useStore((s) => s.blockSelectionStates)
  const blockSelectionSources = useStore((s) => s.blockSelectionSources)
  const similarityScores = useStore((s) => s.similarityScores)

  const { isConverging } = useFlipTracking()

  const taggedCount = blocks.reduce(
    (n, b) => n + (blockSelectionStates.has(b.block_id) ? 1 : 0),
    0,
  )
  const allTagged = blocks.length > 0 && taggedCount === blocks.length
  const untaggedCount = blocks.length - taggedCount

  const handleDownload = async () => {
    if (!allTagged) return
    const blockResults: BlockResult[] = blocks.map((b) => {
      const state = blockSelectionStates.get(b.block_id)
      const source = blockSelectionSources.get(b.block_id) ?? ''
      const score = similarityScores.get(b.block_id)
      const label = state === 'selected' ? 'Human' : state === 'rejected' ? 'LLM' : ''
      return {
        block_id: b.block_id,
        label,
        source,
        score: score !== undefined ? score : null,
      }
    })

    let aggregated: unknown
    try {
      aggregated = await fetchClassroomExport(blockResults)
    } catch (err) {
      console.error('Export failed:', err)
      alert(`Export failed: ${err instanceof Error ? err.message : String(err)}`)
      return
    }

    const json = JSON.stringify(aggregated, null, 2)
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `classroom_results_${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const downloadTooltip = allTagged
    ? 'Download aggregated results as JSON.'
    : `Tag all blocks to enable. ${untaggedCount} left.`

  return (
    <div className="threshold-panel">
      <div className="threshold-histogram-area">
        <DecisionMarginHistogram />
      </div>

      {histogramData && histogramStats && (
        <>
          <div className="threshold-side-area">
            <ConvergenceIndicator />
          </div>

          <div className="threshold-apply-area">
            <span
              className="btn-tooltip-wrap"
              data-tooltip-title="Apply Threshold"
              data-tooltip="Auto-tag blocks past the thresholds and retrain."
            >
              <button
                className={`apply-btn ${isConverging && activeStage === 'apply' ? 'pulsing' : ''}`}
                onClick={applyThresholdTags}
                disabled={activeStage !== 'apply'}
              >
                Apply Threshold
              </button>
            </span>
            <span
              className="btn-tooltip-wrap"
              data-tooltip-title="Download Labels"
              data-tooltip={downloadTooltip}
            >
              <button
                className="download-btn"
                onClick={handleDownload}
                disabled={!allTagged}
              >
                Download Results
              </button>
            </span>
          </div>
        </>
      )}
    </div>
  )
}
