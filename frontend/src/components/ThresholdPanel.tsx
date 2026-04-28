import { useStore } from '../store'
import { useFlipTracking } from '../hooks/useFlipTracking'
import DecisionMarginHistogram from './DecisionMarginHistogram'
import ConvergenceIndicator from './ConvergenceIndicator'
import '../styles/ThresholdPanel.css'

export default function ThresholdPanel() {
  const histogramData = useStore((s) => s.histogramData)
  const histogramStats = useStore((s) => s.histogramStatistics)
  const applyThresholdTags = useStore((s) => s.applyThresholdTags)
  const activeStage = useStore((s) => s.activeStage)

  const { isConverging } = useFlipTracking()

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
              className={`apply-btn ${isConverging && activeStage === 'apply' ? 'pulsing' : ''}`}
              onClick={applyThresholdTags}
              disabled={activeStage !== 'apply'}
              data-tooltip-title="Apply Threshold"
              data-tooltip="Auto-tag blocks past the thresholds and retrain."
            >
              Apply Threshold
            </button>
          </div>
        </>
      )}
    </div>
  )
}
