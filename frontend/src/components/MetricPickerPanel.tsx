import { useState, useCallback } from 'react'
import { useStore } from '../store'
import CorrelationMatrix from './CorrelationMatrix'
import '../styles/MetricPickerPanel.css'

export default function MetricPickerPanel() {
  const allMetricColumns = useStore((s) => s.allMetricColumns)
  const enabledFeatures = useStore((s) => s.enabledFeatures)
  const setFeatureEnabled = useStore((s) => s.setFeatureEnabled)
  const filterSummary = useStore((s) => s.filterSummary)
  const featureImportances = useStore((s) => s.featureImportances)
  const featureImportanceHistory = useStore((s) => s.featureImportanceHistory)
  const activeStage = useStore((s) => s.activeStage)

  const showStats = activeStage === 'bootstrap'
  const showImportance = !showStats

  const [highlightedMetrics, setHighlightedMetrics] = useState<Set<string>>(new Set())
  const handleHoverMetrics = useCallback((pair: [string, string] | null) => {
    setHighlightedMetrics(pair ? new Set(pair) : new Set())
  }, [])

  // Max importance for bar scaling
  const maxImportance = featureImportances
    ? Math.max(...Object.values(featureImportances), 0)
    : 0

  // Rank computation from current and previous importance snapshots
  const currentRanks = featureImportances
    ? Object.entries(featureImportances)
        .sort((a, b) => b[1] - a[1])
        .reduce<Record<string, number>>((acc, [n], i) => { acc[n] = i + 1; return acc }, {})
    : null

  const prevSnapshot = featureImportanceHistory.length >= 2
    ? featureImportanceHistory[featureImportanceHistory.length - 2]
    : null
  const prevRanks = prevSnapshot
    ? Object.entries(prevSnapshot.importances)
        .sort((a, b) => b[1] - a[1])
        .reduce<Record<string, number>>((acc, [n], i) => { acc[n] = i + 1; return acc }, {})
    : null

  return (
    <div className="metric-picker-panel">
      <h3>Metrics</h3>

      {/* Feature Checkboxes */}
      {allMetricColumns.length > 0 ? (
        <div className="feature-checkbox-list">
          {showImportance && featureImportances && maxImportance > 0 && (
            <div className="feature-list__legend">
              <span>Feature importance</span>
              <div className="feature-importance-bar-bg">
                <div className="feature-importance-bar-fill" style={{ width: '60%' }} />
              </div>
            </div>
          )}
          {allMetricColumns.map((name) => {
            const enabled = enabledFeatures.has(name)
            const importance = featureImportances?.[name]
            const hasDetails = showImportance && enabled && importance !== undefined && maxImportance > 0
            const pct = hasDetails ? (importance / maxImportance) * 100 : 0
            const fmtPct = hasDetails ? (importance * 100).toFixed(1) + '%' : ''
            const rank = currentRanks?.[name]
            const prevRank = prevRanks?.[name]
            const rankDelta = rank != null && prevRank != null ? prevRank - rank : 0

            const variance = filterSummary?.variances?.[name]
            const isHighlighted = highlightedMetrics.has(name)

            return (
              <div
                key={name}
                className={`feature-block${enabled ? ' feature-block--enabled' : ''}${hasDetails ? ' feature-block--detailed' : ''}${isHighlighted ? ' feature-block--highlighted' : ''}`}
              >
                {/* Row 1: checkbox + name */}
                <label className="feature-block__label" title={name}>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setFeatureEnabled(name, e.target.checked)}
                  />
                  <span className={enabled ? '' : 'feature-name--disabled'}>{name}</span>
                </label>

                {/* Inline stats: variance (bootstrap only) */}
                {showStats && variance !== undefined && (
                  <div className="feature-block__stats">
                    <span className="feature-stat feature-stat--var">
                      var: {variance < 0.001 ? variance.toExponential(1) : variance.toFixed(3)}
                    </span>
                  </div>
                )}

                {/* Importance bar + rank (only when enabled AND importance exists) */}
                {hasDetails && (
                  <div className="feature-block__details">
                    <div className="feature-block__bar-row">
                      <div className="feature-importance-bar-bg">
                        <div
                          className="feature-importance-bar-fill"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="feature-importance-value">{fmtPct}</span>
                    </div>
                    <span className="feature-block__rank">
                      rank #{rank}
                      {rankDelta !== 0 && (
                        <span className={rankDelta > 0 ? 'rank-up' : 'rank-down'}>
                          {rankDelta > 0 ? ` \u2191${rankDelta}` : ` \u2193${Math.abs(rankDelta)}`}
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            )
          })}
          {featureImportanceHistory.length > 0 && (
            <div className="feature-importance-footer">
              {featureImportanceHistory.length} iteration{featureImportanceHistory.length !== 1 ? 's' : ''} tracked
            </div>
          )}
        </div>
      ) : (
        <p className="metric-picker-placeholder">
          No metric columns available
        </p>
      )}
      {showStats && filterSummary?.correlations && (
        <CorrelationMatrix
          metricNames={allMetricColumns}
          correlations={filterSummary.correlations}
          highlightedMetrics={highlightedMetrics}
          onHoverMetrics={handleHoverMetrics}
        />
      )}
    </div>
  )
}
