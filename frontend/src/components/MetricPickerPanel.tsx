import React, { useState, useCallback, useMemo } from 'react'
import { useStore } from '../store'
import { getMetricLabel } from '../lib/constants'
import CorrelationMatrix from './CorrelationMatrix'
import Tooltip from './Tooltip'
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

  const [hovered, setHovered] = useState<{
    name: string; x: number; y: number
  } | null>(null)

  const maxImportance = featureImportances
    ? Math.max(...Object.values(featureImportances), 0)
    : 0

  const currentRanks = useMemo(() =>
    featureImportances
      ? Object.entries(featureImportances)
          .sort((a, b) => b[1] - a[1])
          .reduce<Record<string, number>>((acc, [n], i) => { acc[n] = i + 1; return acc }, {})
      : null,
    [featureImportances]
  )

  const prevRanks = useMemo(() => {
    const prev = featureImportanceHistory.length >= 2
      ? featureImportanceHistory[featureImportanceHistory.length - 2]
      : null
    return prev
      ? Object.entries(prev.importances)
          .sort((a, b) => b[1] - a[1])
          .reduce<Record<string, number>>((acc, [n], i) => { acc[n] = i + 1; return acc }, {})
      : null
  }, [featureImportanceHistory])

  const handleMouseEnter = useCallback((e: React.MouseEvent, name: string) => {
    setHovered({ name, x: e.clientX, y: e.clientY })
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setHovered((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)
  }, [])

  const handleMouseLeave = useCallback(() => {
    setHovered(null)
  }, [])

  const handleClickMetrics = useCallback((pair: [string, string]) => {
    const [a, b] = pair
    const aEnabled = enabledFeatures.has(a)
    const bEnabled = enabledFeatures.has(b)

    if (aEnabled && bEnabled) {
      const cvOf = (name: string) => {
        const v = filterSummary?.variances?.[name] ?? 0
        const m = Math.abs(filterSummary?.means?.[name] ?? 0)
        return m > 1e-10 ? Math.sqrt(v) / m : Math.sqrt(v)
      }
      const toDisable = cvOf(a) <= cvOf(b) ? a : b
      setFeatureEnabled(toDisable, false)
    } else {
      if (!aEnabled) setFeatureEnabled(a, true)
      if (!bEnabled) setFeatureEnabled(b, true)
    }
  }, [enabledFeatures, filterSummary, setFeatureEnabled])

  const tooltipData = useMemo(() => {
    if (!hovered) return null
    const name = hovered.name
    const importance = featureImportances?.[name]
    const rank = currentRanks?.[name]
    const prevRank = prevRanks?.[name]
    const rankDelta = rank != null && prevRank != null ? prevRank - rank : 0
    const variance = filterSummary?.variances?.[name]
    const isLowVar = filterSummary?.removed_low_variance?.includes(name)
    const corrPair = filterSummary?.removed_correlated?.find(p => p.removed === name)
    return { name, importance, rank, rankDelta, variance, isLowVar, corrPair }
  }, [hovered, featureImportances, currentRanks, prevRanks, filterSummary])

  const sortedMetrics = useMemo(() => {
    const getScore = (name: string) => {
      if (showImportance && featureImportances?.[name] !== undefined) {
        return featureImportances[name]
      }
      const v = filterSummary?.variances?.[name] ?? 0
      const m = Math.abs(filterSummary?.means?.[name] ?? 0)
      return m > 1e-10 ? Math.sqrt(v) / m : Math.sqrt(v)
    }

    return [...allMetricColumns].sort((a, b) => {
      const aEnabled = enabledFeatures.has(a) ? 1 : 0
      const bEnabled = enabledFeatures.has(b) ? 1 : 0
      if (aEnabled !== bEnabled) return bEnabled - aEnabled
      return getScore(b) - getScore(a)
    })
  }, [allMetricColumns, enabledFeatures, showImportance, featureImportances, filterSummary])

  return (
    <div className="metric-picker-panel">
      <h3
        className="subheader"
        data-tooltip-title="Metric Picker"
        data-tooltip="Choose which metrics the model uses."
      >Metric Picker</h3>

      {allMetricColumns.length > 0 ? (
        <div className="feature-checkbox-list">
          <div className="feature-row feature-row--header">
            <span className="feature-row__label">Metric</span>
            <span className="feature-row__glyphs">
              {showStats && <span className="feature-glyph-header">Coeff. of Variation</span>}
              {showImportance && <span className="feature-glyph-header">Importance</span>}
            </span>
          </div>
          {sortedMetrics.map((name) => {
            const enabled = enabledFeatures.has(name)
            const importance = featureImportances?.[name]
            const hasImportance = showImportance && importance !== undefined && maxImportance > 0
            const impPct = hasImportance ? (importance / maxImportance) * 100 : 0
            const variance = filterSummary?.variances?.[name]
            const mean = filterSummary?.means?.[name]
            const cv = variance !== undefined
              ? (mean !== undefined && Math.abs(mean) > 1e-10 ? Math.sqrt(variance) / Math.abs(mean) : Math.sqrt(variance))
              : undefined
            const isHighlighted = highlightedMetrics.has(name)

            return (
              <div
                key={name}
                className={`feature-row${enabled ? ' feature-row--enabled' : ''}${isHighlighted ? ' feature-row--highlighted' : ''}`}
                onMouseEnter={(e) => handleMouseEnter(e, name)}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
              >
                <label className="feature-row__label">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setFeatureEnabled(name, e.target.checked)}
                  />
                  <span className={enabled ? '' : 'feature-name--disabled'}>{getMetricLabel(name)}</span>
                </label>

                {!enabled && (() => {
                  const isLowVar = filterSummary?.removed_low_variance?.includes(name)
                  const corrPair = filterSummary?.removed_correlated?.find(p => p.removed === name)
                  if (isLowVar) return <span className="feature-row__auto-reason">Low variance</span>
                  if (corrPair) return <span className="feature-row__auto-reason">≈ {getMetricLabel(corrPair.kept_instead)}</span>
                  return null
                })()}

                <span className="feature-row__glyphs">
                  {showStats && cv !== undefined && (
                    <span className={`feature-glyph-var${cv < 0.01 ? ' feature-glyph-var--low' : ''}`}>
                      {cv < 0.01 ? cv.toExponential(1) : cv.toFixed(2)}
                    </span>
                  )}

                  {hasImportance && (
                    <span className="feature-glyph-imp">
                      <span className="feature-glyph-imp__bar">
                        <span
                          className="feature-glyph-imp__fill"
                          style={{ width: `${impPct}%` }}
                        />
                      </span>
                      <span className="feature-glyph-imp__pct">
                        {(importance * 100).toFixed(0)}%
                      </span>
                    </span>
                  )}
                </span>
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
        <div className="correlation-matrix-wrap">
          <CorrelationMatrix
            metricNames={allMetricColumns}
            correlations={filterSummary.correlations}
            highlightedMetrics={highlightedMetrics}
            enabledFeatures={enabledFeatures}
            onHoverMetrics={handleHoverMetrics}
            onClickMetrics={handleClickMetrics}
          />
          <div
            className="correlation-legend"
            data-tooltip-title="Correlation legend"
            data-tooltip="Color shows correlation strength. Gray = unpicked metric."
          >
            <div className="correlation-legend__row">
              <span className="correlation-legend__title">Picked (|r|)</span>
              <span className="correlation-legend__tick">0</span>
              <span className="correlation-legend__bar correlation-legend__bar--picked" />
              <span className="correlation-legend__tick">1</span>
            </div>
            <div className="correlation-legend__row">
              <span className="correlation-legend__title">Not picked (|r|)</span>
              <span className="correlation-legend__tick">0</span>
              <span className="correlation-legend__bar correlation-legend__bar--gray" />
              <span className="correlation-legend__tick">1</span>
            </div>
          </div>
        </div>
      )}

      {hovered && tooltipData && (
        <Tooltip x={hovered.x} y={hovered.y}>
          <Tooltip.Header>{getMetricLabel(tooltipData.name)}</Tooltip.Header>
          <Tooltip.Summary>{tooltipData.name}</Tooltip.Summary>
          {tooltipData.variance !== undefined && (
            <Tooltip.Row>
              Variance: {tooltipData.variance < 0.001
                ? tooltipData.variance.toExponential(2)
                : tooltipData.variance.toFixed(4)}
              {tooltipData.isLowVar && <span style={{ color: '#ef6c00', fontStyle: 'italic' }}> (low)</span>}
            </Tooltip.Row>
          )}
          {tooltipData.corrPair && (
            <Tooltip.Row>Correlated with: {getMetricLabel(tooltipData.corrPair.kept_instead)}</Tooltip.Row>
          )}
          {tooltipData.importance !== undefined && (
            <>
              <Tooltip.Row>Importance: {(tooltipData.importance * 100).toFixed(1)}%</Tooltip.Row>
              {tooltipData.rank != null && (
                <Tooltip.Row>
                  Rank #{tooltipData.rank}
                  {tooltipData.rankDelta !== 0 && (
                    <span className={tooltipData.rankDelta > 0 ? 'rank-up' : 'rank-down'}>
                      {tooltipData.rankDelta > 0 ? ` \u2191${tooltipData.rankDelta}` : ` \u2193${Math.abs(tooltipData.rankDelta)}`}
                    </span>
                  )}
                </Tooltip.Row>
              )}
            </>
          )}
        </Tooltip>
      )}
    </div>
  )
}
