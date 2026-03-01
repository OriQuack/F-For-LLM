import { useStore } from '../store'
import { useFlipTracking } from '../hooks/useFlipTracking'
import DecisionMarginHistogram from './DecisionMarginHistogram'
import ConvergenceIndicator from './ConvergenceIndicator'
import '../styles/ThresholdPanel.css'

export default function ThresholdPanel() {
  const histogramData = useStore((s) => s.histogramData)
  const histogramStats = useStore((s) => s.histogramStatistics)
  const applyThresholdTags = useStore((s) => s.applyThresholdTags)

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
