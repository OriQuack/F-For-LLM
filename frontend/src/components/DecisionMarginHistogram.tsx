import React, { useMemo, useCallback, useState, useEffect } from 'react'
import { useStore } from '../store'
import { useResizeObserver } from '../hooks/useResizeObserver'
import {
  calculateHistogramLayout,
  calculateCategoryStackedBars,
  calculateXAxisTicks,
  calculateYAxisTicks,
  HISTOGRAM_MARGIN
} from '../lib/histogram-utils'
import type { CategoryCounts } from '../lib/histogram-utils'
import { COLORS, STRIPE_PATTERN } from '../lib/constants'
import ThresholdHandles from './ThresholdHandles'
import '../styles/DecisionMarginHistogram.css'

// ============================================================================
// SPACING CONSTANTS
// ============================================================================
const TAG_HISTOGRAM_SPACING = {
  svg: {
    margin: HISTOGRAM_MARGIN,
    xLabelOffset: 34,
    yLabelOffset: -38,
    xTickOffset: 18
  }
}

const LABEL_CHAR_WIDTH = 8
const ARROW_WIDTH = 16
const LABEL_PADDING = 4

// Category colors mapping (binary: Human/LLM)
const CATEGORY_COLORS = {
  confirmed: COLORS.selected,
  autoSelected: COLORS.selectedAuto,
  rejected: COLORS.rejected,
  autoRejected: COLORS.rejectedAuto,
  unsure: COLORS.unsure,
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return n.toString()
}

const DecisionMarginHistogram: React.FC = () => {
  const histogramData = useStore((s) => s.histogramData)
  const selectThreshold = useStore((s) => s.selectThreshold)
  const rejectThreshold = useStore((s) => s.rejectThreshold)
  const updateThresholds = useStore((s) => s.updateThresholds)
  const setIsDragging = useStore((s) => s.setIsDraggingThreshold)
  const blockSelectionStates = useStore((s) => s.blockSelectionStates)
  const blockSelectionSources = useStore((s) => s.blockSelectionSources)
  const similarityScores = useStore((s) => s.similarityScores)
  const blocks = useStore((s) => s.blocks)
  const { ref: containerRef, size: containerSize, hasMeasured } = useResizeObserver<HTMLDivElement>()

  const [thresholds, setThresholds] = useState({
    select: selectThreshold,
    reject: rejectThreshold
  })
  const [hoveredBinIndex, setHoveredBinIndex] = useState<number | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null)

  // Sync local thresholds with store
  useEffect(() => {
    setThresholds(prev => {
      if (prev.select !== selectThreshold || prev.reject !== rejectThreshold) {
        return { select: selectThreshold, reject: rejectThreshold }
      }
      return prev
    })
  }, [selectThreshold, rejectThreshold])

  // Selection counts for empty state
  const selectionCounts = useMemo(() => {
    let selectedCount = 0, rejectedCount = 0
    blockSelectionStates.forEach((state, _id) => {
      const src = blockSelectionSources.get(_id)
      if (src === 'click') {
        if (state === 'selected') selectedCount++
        else rejectedCount++
      }
    })
    return { selectedCount, rejectedCount }
  }, [blockSelectionStates, blockSelectionSources])

  // Calculate histogram layout
  const histogramChart = useMemo(() => {
    if (!histogramData) return null
    const margin = TAG_HISTOGRAM_SPACING.svg.margin
    const width = containerSize.width
    const height = 300
    return calculateHistogramLayout(histogramData, width, height, margin)
  }, [histogramData, containerSize])

  // Compute category breakdown per bin
  const categoryData = useMemo(() => {
    if (!histogramChart || !similarityScores || similarityScores.size === 0) {
      return new Map<number, CategoryCounts>()
    }

    const categoryMap = new Map<number, CategoryCounts>()
    const bins = histogramChart.bins

    bins.forEach((_, binIndex) => {
      categoryMap.set(binIndex, {
        confirmed: 0, autoSelected: 0, rejected: 0, autoRejected: 0, unsure: 0
      })
    })

    // Map each block's score to a bin and determine its category
    for (const [blockId, score] of similarityScores) {
      const binIndex = bins.findIndex(bin => score >= bin.x0 && score < bin.x1)
      const lastBinIndex = bins.length - 1
      const adjustedBinIndex = binIndex === -1 && score === bins[lastBinIndex]?.x1
        ? lastBinIndex : binIndex
      if (adjustedBinIndex === -1) continue

      const counts = categoryMap.get(adjustedBinIndex)!
      const selectionState = blockSelectionStates.get(blockId)
      const source = blockSelectionSources.get(blockId)

      if (selectionState === 'selected') {
        if (source === 'predicted') counts.autoSelected++
        else counts.confirmed++
      } else if (selectionState === 'rejected') {
        if (source === 'predicted') counts.autoRejected++
        else counts.rejected++
      } else {
        counts.unsure++
      }
    }

    return categoryMap
  }, [histogramChart, similarityScores, blockSelectionStates, blockSelectionSources])

  // Calculate stacked category bars
  const categoryBars = useMemo(() => {
    if (!histogramChart || categoryData.size === 0) return []
    return calculateCategoryStackedBars(histogramChart, categoryData, CATEGORY_COLORS)
  }, [histogramChart, categoryData])

  // Calculate axis ticks
  const xAxisTicks = useMemo(() => {
    if (!histogramChart) return []
    return calculateXAxisTicks(histogramChart, 8)
  }, [histogramChart])

  const yAxisTicks = useMemo(() => {
    if (!histogramChart) return []
    return calculateYAxisTicks(histogramChart, 5)
  }, [histogramChart])

  // Safe threshold positions
  const safeThresholdPositions = useMemo(() => {
    if (!histogramChart) return { selectX: 0, rejectX: 0, minDomain: -1, maxDomain: 1 }

    const domain = histogramChart.xScale.domain()
    let minDomain = domain[0]
    let maxDomain = domain[1]
    if (!isFinite(minDomain)) minDomain = -1
    if (!isFinite(maxDomain)) maxDomain = 1

    const clampedSelect = Math.max(minDomain, Math.min(maxDomain, thresholds.select))
    const clampedReject = Math.max(minDomain, Math.min(maxDomain, thresholds.reject))

    let selectX = histogramChart.xScale(clampedSelect)
    let rejectX = histogramChart.xScale(clampedReject)
    if (!isFinite(selectX)) selectX = histogramChart.width
    if (!isFinite(rejectX)) rejectX = 0

    return { selectX, rejectX, minDomain, maxDomain }
  }, [histogramChart, thresholds])

  // Label positions to prevent overflow
  const labelPositions = useMemo(() => {
    if (!histogramChart) return { leftX: 0, rightX: 0 }
    const chartWidth = histogramChart.width
    const leftLabelWidth = 'LLM'.length * LABEL_CHAR_WIDTH + ARROW_WIDTH
    const rightLabelWidth = 'Human'.length * LABEL_CHAR_WIDTH + ARROW_WIDTH
    const leftX = Math.max(leftLabelWidth + LABEL_PADDING, safeThresholdPositions.rejectX)
    const rightX = Math.min(chartWidth - rightLabelWidth - LABEL_PADDING, safeThresholdPositions.selectX)
    return { leftX, rightX }
  }, [histogramChart, safeThresholdPositions])

  // Threshold update callback (on drag end)
  const handleThresholdUpdate = useCallback((newThresholds: number[]) => {
    if (newThresholds.length !== 2) return
    const newReject = newThresholds[0]
    const newSelect = newThresholds[1]
    setThresholds(prev => {
      if (newReject !== prev.reject || newSelect !== prev.select) {
        updateThresholds(newSelect, newReject)
        return { reject: newReject, select: newSelect }
      }
      return prev
    })
  }, [updateThresholds])

  // Live threshold update during drag
  const handleThresholdDragUpdate = useCallback((newThresholds: number[]) => {
    if (newThresholds.length !== 2) return
    const newReject = newThresholds[0]
    const newSelect = newThresholds[1]
    setThresholds({ reject: newReject, select: newSelect })
    updateThresholds(newSelect, newReject)
  }, [updateThresholds])

  const handleDragStart = useCallback(() => setIsDragging(true), [setIsDragging])
  const handleDragEnd = useCallback(() => setIsDragging(false), [setIsDragging])

  // Empty state with progress badges
  if (!histogramData) {
    return (
      <div className="tag-automatic-panel tag-automatic-panel--empty">
        <div className="tag-panel__empty-message">
          <div className="tag-panel__main-instruction">
            Tag 3+ blocks in each category to see histogram.
          </div>
          <div className="tag-panel__progress-row">
            <span className="tag-panel__progress-item" style={{ backgroundColor: COLORS.rejected }}>
              LLM: {selectionCounts.rejectedCount}/3
            </span>
            <span className="tag-panel__progress-item" style={{ backgroundColor: COLORS.selected }}>
              Human: {selectionCounts.selectedCount}/3
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="tag-automatic-panel">
      <div className="tag-panel__content">
        <div ref={containerRef} className="tag-panel__histogram-container">
          {histogramChart && hasMeasured ? (
            <>
              <svg
                className="tag-panel__svg"
                width={containerSize.width}
                height={300}
                style={{ overflow: 'visible' }}
              >
                {/* SVG stripe patterns for auto-tagged zones */}
                <defs>
                  <pattern
                    id="autoSelectedPreviewStripe"
                    patternUnits="userSpaceOnUse"
                    width={STRIPE_PATTERN.width}
                    height={STRIPE_PATTERN.height}
                    patternTransform={`rotate(${-STRIPE_PATTERN.rotation})`}
                  >
                    <rect width={STRIPE_PATTERN.stripeWidth} height={STRIPE_PATTERN.height}
                      fill={CATEGORY_COLORS.autoSelected} opacity={STRIPE_PATTERN.opacity} />
                  </pattern>
                  <pattern
                    id="autoRejectedPreviewStripe"
                    patternUnits="userSpaceOnUse"
                    width={STRIPE_PATTERN.width}
                    height={STRIPE_PATTERN.height}
                    patternTransform={`rotate(${-STRIPE_PATTERN.rotation})`}
                  >
                    <rect width={STRIPE_PATTERN.stripeWidth} height={STRIPE_PATTERN.height}
                      fill={CATEGORY_COLORS.autoRejected} opacity={STRIPE_PATTERN.opacity} />
                  </pattern>
                </defs>

                <g transform={`translate(${histogramChart.margin.left}, ${histogramChart.margin.top})`}>
                  {/* 3 colored zone backgrounds */}
                  {/* Zone 1: Left edge → reject threshold (LLM auto stripe) */}
                  <rect
                    x={0} y={0}
                    width={Math.max(0, safeThresholdPositions.rejectX)}
                    height={histogramChart.height}
                    fill="url(#autoRejectedPreviewStripe)"
                  />
                  {/* Zone 2: Reject → select threshold (white, unsure) */}
                  <rect
                    x={safeThresholdPositions.rejectX} y={0}
                    width={Math.max(0, safeThresholdPositions.selectX - safeThresholdPositions.rejectX)}
                    height={histogramChart.height}
                    fill="#ffffff"
                  />
                  {/* Zone 3: Select threshold → right edge (Human auto stripe) */}
                  <rect
                    x={safeThresholdPositions.selectX} y={0}
                    width={Math.max(0, histogramChart.width - safeThresholdPositions.selectX)}
                    height={histogramChart.height}
                    fill="url(#autoSelectedPreviewStripe)"
                  />

                  {/* Full-height hover hit areas for each bin */}
                  {histogramChart.bins.map((bin, binIndex) => {
                    const binX = histogramChart.xScale(bin.x0)
                    const binWidth = histogramChart.xScale(bin.x1) - binX
                    return (
                      <rect
                        key={`hit-${binIndex}`}
                        x={binX} y={0}
                        width={binWidth} height={histogramChart.height}
                        fill={hoveredBinIndex === binIndex ? 'rgba(0, 0, 0, 0.04)' : 'transparent'}
                        style={{ cursor: 'pointer' }}
                        onMouseEnter={(e) => {
                          setHoveredBinIndex(binIndex)
                          setTooltipPosition({ x: e.clientX, y: e.clientY })
                        }}
                        onMouseMove={(e) => setTooltipPosition({ x: e.clientX, y: e.clientY })}
                        onMouseLeave={() => { setHoveredBinIndex(null); setTooltipPosition(null) }}
                      />
                    )
                  })}

                  {/* Stacked category bars */}
                  {categoryBars.map((segment, i) => (
                    <rect
                      key={i}
                      x={segment.x} y={segment.y}
                      width={segment.width} height={segment.height}
                      fill={segment.color} stroke="none"
                      opacity={hoveredBinIndex === segment.binIndex ? 1 : 0.85}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={(e) => {
                        setHoveredBinIndex(segment.binIndex)
                        setTooltipPosition({ x: e.clientX, y: e.clientY })
                      }}
                      onMouseMove={(e) => setTooltipPosition({ x: e.clientX, y: e.clientY })}
                      onMouseLeave={() => { setHoveredBinIndex(null); setTooltipPosition(null) }}
                    />
                  ))}

                  {/* Center line at 0 (dashed) */}
                  <line
                    x1={histogramChart.xScale(0)} y1={0}
                    x2={histogramChart.xScale(0)} y2={histogramChart.height}
                    stroke="#333" strokeWidth={2} strokeDasharray="4,4" opacity={0.7}
                  />

                  {/* X axis */}
                  <line
                    x1={0} y1={histogramChart.height}
                    x2={histogramChart.width} y2={histogramChart.height}
                    stroke="#333" strokeWidth={2}
                  />

                  {/* X axis ticks and labels */}
                  {xAxisTicks.map((tick, i) => {
                    const isFirst = i === 0
                    const isLast = i === xAxisTicks.length - 1
                    return (
                      <g key={i}>
                        <line
                          x1={tick.position} y1={histogramChart.height}
                          x2={tick.position} y2={histogramChart.height + 5}
                          stroke="#333" strokeWidth={1}
                        />
                        <text
                          x={tick.position}
                          y={histogramChart.height + TAG_HISTOGRAM_SPACING.svg.xTickOffset}
                          textAnchor={isFirst ? 'start' : isLast ? 'end' : 'middle'}
                          fontSize={12} fill="#666"
                        >
                          {tick.label}
                        </text>
                      </g>
                    )
                  })}

                  {/* Y axis */}
                  <line
                    x1={0} y1={0} x2={0} y2={histogramChart.height}
                    stroke="#333" strokeWidth={2}
                  />

                  {/* Y axis ticks and labels */}
                  {yAxisTicks.map((tick, i) => (
                    <g key={i}>
                      <line
                        x1={0} y1={tick.position} x2={-5} y2={tick.position}
                        stroke="#333" strokeWidth={1}
                      />
                      <text
                        x={-10} y={tick.position + 3}
                        textAnchor="end" fontSize={12} fill="#666"
                      >
                        {formatCount(tick.value)}
                      </text>
                    </g>
                  ))}

                  {/* Axis labels */}
                  <text
                    x={histogramChart.width / 2}
                    y={histogramChart.height + TAG_HISTOGRAM_SPACING.svg.xLabelOffset}
                    textAnchor="middle" fontSize={14} fill="#666"
                  >
                    Decision Margin
                  </text>
                  <text
                    textAnchor="middle" fontSize={14} fill="#666"
                    transform={`translate(${TAG_HISTOGRAM_SPACING.svg.yLabelOffset}, ${histogramChart.height / 2}) rotate(-90)`}
                  >
                    Count
                  </text>

                  {/* Dual threshold handles */}
                  <ThresholdHandles
                    orientation="horizontal"
                    bounds={{ min: 0, max: histogramChart.width }}
                    thresholds={[thresholds.reject, thresholds.select]}
                    metricRange={{ min: safeThresholdPositions.minDomain, max: safeThresholdPositions.maxDomain }}
                    position={{ x: 0, y: 0 }}
                    lineBounds={{ min: 0, max: histogramChart.height }}
                    showThresholdLine={true}
                    onUpdate={handleThresholdUpdate}
                    onDragUpdate={handleThresholdDragUpdate}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                  />

                  {/* Threshold labels with arrows */}
                  <g>
                    <text
                      x={labelPositions.leftX} y={-8}
                      textAnchor="end" fontSize={14} fontWeight={600} fill="#272121ff"
                    >
                      <tspan fill={COLORS.rejected} fontSize={16}>{'← '}</tspan>
                      <tspan>LLM</tspan>
                    </text>
                  </g>
                  <g>
                    <text
                      x={labelPositions.rightX} y={-8}
                      textAnchor="start" fontSize={14} fontWeight={600} fill="#000000"
                    >
                      <tspan>Human </tspan>
                      <tspan fill={COLORS.selected} fontSize={16}>{'→'}</tspan>
                    </text>
                  </g>
                </g>
              </svg>

              {/* HTML Tooltip at mouse position */}
              {hoveredBinIndex !== null && tooltipPosition && (() => {
                const bin = histogramChart.bins[hoveredBinIndex]
                const counts = categoryData.get(hoveredBinIndex)
                if (!bin || !counts) return null

                const items: Array<{ color: string; count: number; label: string; striped: boolean }> = []
                if (counts.confirmed > 0) items.push({ color: COLORS.selected, count: counts.confirmed, label: 'Human', striped: false })
                if (counts.autoSelected > 0) items.push({ color: COLORS.selectedAuto, count: counts.autoSelected, label: 'Human (auto)', striped: true })
                if (counts.rejected > 0) items.push({ color: COLORS.rejected, count: counts.rejected, label: 'LLM', striped: false })
                if (counts.autoRejected > 0) items.push({ color: COLORS.rejectedAuto, count: counts.autoRejected, label: 'LLM (auto)', striped: true })
                if (counts.unsure > 0) items.push({ color: COLORS.unsure, count: counts.unsure, label: 'Unsure', striped: false })

                const totalCount = counts.confirmed + counts.autoSelected + counts.rejected + counts.autoRejected + counts.unsure

                return (
                  <div
                    className="tag-panel__tooltip"
                    style={{
                      position: 'fixed',
                      left: tooltipPosition.x + 12,
                      top: tooltipPosition.y - 12,
                      pointerEvents: 'none',
                      zIndex: 1000
                    }}
                  >
                    <div className="tag-panel__tooltip-header">
                      {bin.x0.toFixed(2)} – {bin.x1.toFixed(2)}
                    </div>
                    <div className="tag-panel__tooltip-summary">
                      Total: {formatCount(totalCount)} blocks
                    </div>
                    {items.map((item, idx) => (
                      <div key={idx} className="tag-panel__tooltip-row">
                        <span
                          className="tag-panel__tooltip-swatch"
                          style={{ backgroundColor: item.color }}
                        />
                        {item.label}: {formatCount(item.count)}
                      </div>
                    ))}
                  </div>
                )
              })()}
            </>
          ) : (
            <div className="tag-panel__loading">
              <div className="spinner" />
              <span>Calculating similarity scores...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default React.memo(DecisionMarginHistogram)
