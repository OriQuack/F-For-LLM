import MetricPickerPanel from './MetricPickerPanel'
import SelectionPanel from './SelectionPanel'
import StageAccordion from './StageAccordion'
import CodeBlockViewer from './CodeBlockViewer'
import MetricsPanel from './MetricsPanel'
import ThresholdPanel from './ThresholdPanel'

export default function ClassifierView() {
  return (
    <div className="app-main">
      <div className="metric-column">
        <MetricPickerPanel />
      </div>

      <div className="selection-column">
        <SelectionPanel />
      </div>

      <div className="list-column">
        <StageAccordion />
      </div>

      <div className="center-column">
        <CodeBlockViewer />
        <MetricsPanel />
      </div>

      <div className="bottom-panel">
        <ThresholdPanel />
      </div>
    </div>
  )
}
