import { useStore } from '../store'
import { useBoundaryItems } from '../hooks/useBoundaryItems'
import { useFlipTracking } from '../hooks/useFlipTracking'
import DecisionMarginHistogram from './DecisionMarginHistogram'
import ConvergenceIndicator from './ConvergenceIndicator'
import '../styles/ThresholdPanel.css'

export default function ThresholdPanel() {
  const blocks = useStore((s) => s.blocks)
  const scores = useStore((s) => s.similarityScores)
  const histogramData = useStore((s) => s.histogramData)
  const histogramStats = useStore((s) => s.histogramStatistics)
  const selectThreshold = useStore((s) => s.selectThreshold)
  const rejectThreshold = useStore((s) => s.rejectThreshold)
  const applyThresholdTags = useStore((s) => s.applyThresholdTags)
  const setCurrentBlock = useStore((s) => s.setCurrentBlock)

  const { rejectBelow, selectAbove } = useBoundaryItems(
    blocks,
    scores,
    rejectThreshold,
    selectThreshold,
    histogramData !== null,
  )

  const { isConverging, flipHistory } = useFlipTracking()

  return (
    <div className="threshold-panel">
      <div className="threshold-histogram-area">
        <DecisionMarginHistogram />
      </div>

      {histogramData && histogramStats && (
        <>
          <div className="threshold-side-area">
            <ConvergenceIndicator />

            <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0 }}>
              <div className="boundary-list">
                <div className="boundary-list-header">LLM ({rejectBelow.length})</div>
                {rejectBelow.slice(0, 15).map((b) => (
                  <div
                    key={b.block_id}
                    className="boundary-item"
                    onClick={() => setCurrentBlock(b.block_id)}
                  >
                    <span>{b.block_name}</span>
                    <span style={{ color: '#FF9800' }}>{scores.get(b.block_id)?.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="boundary-list">
                <div className="boundary-list-header">Human ({selectAbove.length})</div>
                {selectAbove.slice(0, 15).map((b) => (
                  <div
                    key={b.block_id}
                    className="boundary-item"
                    onClick={() => setCurrentBlock(b.block_id)}
                  >
                    <span>{b.block_name}</span>
                    <span style={{ color: '#4CAF50' }}>{scores.get(b.block_id)?.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="threshold-apply-area">
            <button
              className={`apply-btn ${isConverging ? 'pulsing' : ''}`}
              onClick={applyThresholdTags}
            >
              Apply Threshold
            </button>
            <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', textAlign: 'center' }}>
              {flipHistory.length > 0
                ? `Flip: ${(flipHistory[flipHistory.length - 1].flipRate * 100).toFixed(1)}%`
                : ''}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
