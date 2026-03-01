import { useState } from 'react'
import { useStore } from '../store'
import '../styles/MetricPickerPanel.css'

export default function MetricPickerPanel() {
  const filterSummary = useStore((s) => s.filterSummary)
  const featureImportances = useStore((s) => s.featureImportances)
  const featureImportanceHistory = useStore((s) => s.featureImportanceHistory)
  const [filterExpanded, setFilterExpanded] = useState(false)

  const hasRemovals =
    filterSummary &&
    (filterSummary.removed_low_variance.length > 0 ||
      filterSummary.removed_correlated.length > 0)

  // Sort importances descending
  const sortedImportances = featureImportances
    ? Object.entries(featureImportances).sort(([, a], [, b]) => b - a)
    : []
  const maxImportance =
    sortedImportances.length > 0 ? sortedImportances[0][1] : 1

  return (
    <div className="metric-picker-panel">
      <h3>Metrics</h3>

      {/* Filter Summary */}
      {filterSummary && (
        <div className="filter-summary">
          <span className="filter-summary__count">
            {filterSummary.surviving_count} of {filterSummary.original_count} metrics kept
          </span>
          {hasRemovals && (
            <button
              className="filter-summary__toggle"
              onClick={() => setFilterExpanded(!filterExpanded)}
            >
              {filterExpanded ? 'hide' : 'details'}
            </button>
          )}
          {filterExpanded && hasRemovals && (
            <ul className="filter-summary__list">
              {filterSummary.removed_low_variance.map((name) => (
                <li key={name}>
                  <span className="filter-summary__name">{name}</span>
                  <span className="filter-summary__reason">low variance</span>
                </li>
              ))}
              {filterSummary.removed_correlated.map(({ removed, kept_instead }) => (
                <li key={removed}>
                  <span className="filter-summary__name">{removed}</span>
                  <span className="filter-summary__reason">
                    correlated with {kept_instead}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Feature Importance Bars */}
      {sortedImportances.length > 0 ? (
        <div className="feature-importance-list">
          {sortedImportances.map(([name, value]) => (
            <div key={name} className="feature-importance-row">
              <span className="feature-importance-label" title={name}>
                {name}
              </span>
              <div className="feature-importance-bar-bg">
                <div
                  className="feature-importance-bar-fill"
                  style={{
                    width: `${maxImportance > 0 ? (value / maxImportance) * 100 : 0}%`,
                  }}
                />
              </div>
              <span className="feature-importance-value">
                {(value * 100).toFixed(1)}%
              </span>
            </div>
          ))}
          <div className="feature-importance-footer">
            {featureImportanceHistory.length} iteration{featureImportanceHistory.length !== 1 ? 's' : ''} tracked
          </div>
        </div>
      ) : (
        <p className="metric-picker-placeholder">
          Train model to see feature importances
        </p>
      )}
    </div>
  )
}
