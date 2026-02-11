import React, { useMemo, useState } from 'react'
import { useFlipTracking } from '../hooks/useFlipTracking'
import { useResizeObserver } from '../hooks/useResizeObserver'
import { COLORS } from '../lib/constants'
import '../styles/ConvergenceIndicator.css'

const THRESHOLD_LINES = [0.10, 0.25, 0.50]

const CATEGORY_CONFIG = {
  order: ['rejected', 'selected'] as const,
  colors: { selected: COLORS.selected, rejected: COLORS.rejected },
  labels: { selected: 'Human', rejected: 'LLM' },
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return n.toString()
}

export default function ConvergenceIndicator() {
  const { flipHistory } = useFlipTracking()

  const { ref: containerRef, size: containerSize, hasMeasured } = useResizeObserver<HTMLDivElement>({
    defaultWidth: 200,
    defaultHeight: 100,
    debounceMs: 16,
  })

  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null)
  const [tooltipData, setTooltipData] = useState<{
    iteration: number
    segments: Array<{ category: string; count: number; color: string; label: string }>
    total: number
    flipRate: number | null
  } | null>(null)
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null)

  const sparklineData = useMemo(() => {
    if (flipHistory.length === 0) return null

    const width = containerSize.width
    const height = containerSize.height
    const padding = { top: 10, bottom: 35, left: 40, right: 35 }

    const chartWidth = width - padding.left - padding.right
    const chartHeight = height - padding.top - padding.bottom

    const maxRate = 1.0
    const xScale = (i: number) => padding.left + (i / Math.max(1, flipHistory.length - 1)) * chartWidth
    const yScale = (rate: number) => padding.top + chartHeight - (rate / maxRate) * chartHeight

    // Line chart points (only for iterations > 0)
    const allPoints = flipHistory.map((entry, i) => ({
      x: xScale(i),
      y: yScale(entry.flipRate),
      flipRate: entry.flipRate,
      iteration: entry.iteration,
    }))
    const linePoints = allPoints.filter(p => p.iteration > 0)

    const pathD = linePoints.length > 1
      ? 'M ' + linePoints.map(p => `${p.x},${p.y}`).join(' L ')
      : null

    const yTicks = [
      { y: yScale(0), label: '0%' },
      { y: yScale(1.0), label: '100%' },
    ]

    const xAxisY = padding.top + chartHeight

    const thresholdLines = THRESHOLD_LINES.map(t => ({
      y: yScale(t),
      label: `${Math.round(t * 100)}%`,
    }))

    const xTicks = flipHistory.map((entry, i) => ({
      x: xScale(i),
      label: String(entry.iteration),
    }))

    // Stacked bars for prediction counts
    const barWidth = 8
    const bars = flipHistory.map((entry, i) => {
      if (!entry.predictionCounts) return null
      const totalCount = Object.values(entry.predictionCounts).reduce((sum, c) => sum + c, 0)
      if (totalCount === 0) return null

      const segments: Array<{
        x: number; y: number; width: number; height: number
        color: string; category: string; count: number; label: string
      }> = []
      let currentY = xAxisY

      for (const category of CATEGORY_CONFIG.order) {
        const count = entry.predictionCounts[category] || 0
        if (count === 0) continue
        const segmentHeight = (count / totalCount) * chartHeight
        currentY -= segmentHeight
        segments.push({
          x: xScale(i) - barWidth / 2,
          y: currentY,
          width: barWidth,
          height: segmentHeight,
          color: CATEGORY_CONFIG.colors[category],
          category,
          count,
          label: CATEGORY_CONFIG.labels[category],
        })
      }

      return { segments, x: xScale(i), iteration: entry.iteration, totalCount, flipRate: entry.flipRate }
    }).filter((bar): bar is NonNullable<typeof bar> => bar !== null)

    return { linePoints, pathD, width, height, padding, yTicks, xTicks, xAxisY, thresholdLines, chartWidth, chartHeight, bars, barWidth }
  }, [flipHistory, containerSize.width, containerSize.height])

  if (flipHistory.length === 0) {
    return (
      <div ref={containerRef} className="convergence-indicator">
        <div className="convergence-indicator__placeholder">
          <span className="convergence-indicator__placeholder-text">
            Convergence after 2+ iterations
          </span>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="convergence-indicator">
      {sparklineData && hasMeasured && (
        <svg
          className="convergence-indicator__sparkline"
          viewBox={`0 0 ${sparklineData.width} ${sparklineData.height}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Threshold reference lines */}
          {sparklineData.thresholdLines.map((line, i) => (
            <g key={i}>
              <line
                x1={sparklineData.padding.left}
                y1={line.y}
                x2={sparklineData.width - sparklineData.padding.right}
                y2={line.y}
                stroke="#9ca3af"
                strokeWidth={1}
                strokeDasharray="3,2"
              />
              <text
                x={sparklineData.width - sparklineData.padding.right + 8}
                y={line.y}
                fontSize={12}
                fill="#666"
                textAnchor="start"
                dominantBaseline="middle"
              >
                {line.label}
              </text>
            </g>
          ))}

          {/* Y-axis labels */}
          {sparklineData.yTicks.map((tick, i) => (
            <text
              key={i}
              x={sparklineData.padding.left - 5}
              y={tick.y}
              fontSize={12}
              fill="#666"
              textAnchor="end"
              dominantBaseline="middle"
            >
              {tick.label}
            </text>
          ))}

          {/* X-axis line */}
          <line
            x1={sparklineData.padding.left}
            y1={sparklineData.xAxisY}
            x2={sparklineData.width - sparklineData.padding.right}
            y2={sparklineData.xAxisY}
            stroke="#4b5563"
            strokeWidth={1}
          />

          {/* X-axis tick labels */}
          {sparklineData.xTicks.map((tick, i) => (
            <text
              key={i}
              x={tick.x}
              y={sparklineData.xAxisY + 18}
              fontSize={12}
              fill="#666"
              textAnchor="middle"
            >
              {tick.label}
            </text>
          ))}

          {/* X-axis label */}
          <text
            x={sparklineData.padding.left + sparklineData.chartWidth / 2}
            y={sparklineData.xAxisY + 34}
            textAnchor="middle"
            fontSize={14}
            fill="#666"
          >
            Iteration
          </text>

          {/* Stacked bars */}
          {sparklineData.bars.map((bar, barIndex) => (
            <g
              key={`bar-${barIndex}`}
              style={{ cursor: 'pointer' }}
              onMouseEnter={(e) => {
                setHoveredBarIndex(barIndex)
                setTooltipPosition({ x: e.clientX, y: e.clientY })
                setTooltipData({
                  iteration: bar.iteration,
                  segments: bar.segments.map(seg => ({
                    category: seg.category,
                    count: seg.count,
                    color: seg.color,
                    label: seg.label,
                  })),
                  total: bar.totalCount,
                  flipRate: bar.iteration > 0 ? bar.flipRate : null,
                })
              }}
              onMouseMove={(e) => setTooltipPosition({ x: e.clientX, y: e.clientY })}
              onMouseLeave={() => {
                setHoveredBarIndex(null)
                setTooltipPosition(null)
                setTooltipData(null)
              }}
            >
              {bar.segments.map((seg, j) => (
                <rect
                  key={j}
                  x={seg.x}
                  y={seg.y}
                  width={seg.width}
                  height={seg.height}
                  fill={seg.color}
                  opacity={hoveredBarIndex === barIndex ? 1 : 0.85}
                />
              ))}
            </g>
          ))}

          {/* Sparkline path */}
          {sparklineData.pathD && (
            <path
              d={sparklineData.pathD}
              fill="none"
              stroke="#374151"
              strokeWidth={1.5}
            />
          )}

          {/* Line chart dots */}
          {sparklineData.linePoints.map((point, i) => (
            <circle
              key={i}
              cx={point.x}
              cy={point.y}
              r={2.5}
              fill="#1f2937"
              style={{ pointerEvents: 'none' }}
            />
          ))}
        </svg>
      )}

      {/* Tooltip */}
      {tooltipData && tooltipPosition && (
        <div
          className="convergence-indicator__tooltip"
          style={{
            position: 'fixed',
            left: tooltipPosition.x + 12,
            top: tooltipPosition.y - 12,
            pointerEvents: 'none',
            zIndex: 1000,
          }}
        >
          <div className="convergence-indicator__tooltip-header">
            Iteration {tooltipData.iteration}
          </div>
          {tooltipData.flipRate !== null && (
            <div className="convergence-indicator__tooltip-summary">
              Flip Rate: {(tooltipData.flipRate * 100).toFixed(1)}%
            </div>
          )}
          <div className="convergence-indicator__tooltip-summary">
            Total: {formatCount(tooltipData.total)} blocks
          </div>
          {tooltipData.segments.map((seg, i) => (
            <div key={i} className="convergence-indicator__tooltip-row">
              <span
                className="convergence-indicator__tooltip-swatch"
                style={{ backgroundColor: seg.color }}
              />
              {seg.label}: {formatCount(seg.count)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
