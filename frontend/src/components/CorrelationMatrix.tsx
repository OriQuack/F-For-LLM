import React, { useMemo, useState, useCallback } from 'react'
import { scaleLinear } from 'd3-scale'
import { useResizeObserver } from '../hooks/useResizeObserver'
import type { CorrelationPair } from '../types'
import '../styles/CorrelationMatrix.css'

interface Props {
  metricNames: string[]
  correlations: CorrelationPair[]
  highlightedMetrics: Set<string>
  onHoverMetrics: (metrics: [string, string] | null) => void
}

const MIN_CELL = 4
const LABEL_OFFSET = 50

const colorScale = scaleLinear<string>()
  .domain([-1, 0, 1])
  .range(['#4575b4', '#ffffff', '#d73027'])
  .clamp(true)

export default function CorrelationMatrix({
  metricNames,
  correlations,
  highlightedMetrics,
  onHoverMetrics,
}: Props) {
  const { ref: containerRef, size: containerSize, hasMeasured } = useResizeObserver<HTMLDivElement>()
  const [tooltip, setTooltip] = useState<{
    x: number; y: number; colA: string; colB: string; r: number
  } | null>(null)

  // Build NxN lookup
  const matrix = useMemo(() => {
    const n = metricNames.length
    const m: number[][] = Array.from({ length: n }, () => Array(n).fill(0))
    const idx = new Map(metricNames.map((name, i) => [name, i]))

    // diagonal = 1
    for (let i = 0; i < n; i++) m[i][i] = 1.0

    for (const { col_a, col_b, r } of correlations) {
      const a = idx.get(col_a)
      const b = idx.get(col_b)
      if (a !== undefined && b !== undefined) {
        m[a][b] = r
        m[b][a] = r
      }
    }
    return m
  }, [metricNames, correlations])

  const n = metricNames.length

  const cellSize = useMemo(() => {
    if (!hasMeasured || n < 2) return 0
    return Math.max(MIN_CELL, Math.floor((containerSize.width - LABEL_OFFSET) / (n - 1)))
  }, [containerSize.width, hasMeasured, n])

  const triWidth = cellSize * (n - 1)
  const triHeight = cellSize * (n - 1)
  const svgWidth = LABEL_OFFSET + triWidth + 4
  const svgHeight = LABEL_OFFSET + triHeight + 4

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      const row = Number(e.currentTarget.dataset.row)
      const col = Number(e.currentTarget.dataset.col)
      if (row === col || isNaN(row) || isNaN(col)) return
      const r = matrix[row][col]
      setTooltip({
        x: e.clientX,
        y: e.clientY,
        colA: metricNames[row],
        colB: metricNames[col],
        r,
      })
      onHoverMetrics([metricNames[row], metricNames[col]])
    },
    [matrix, metricNames, onHoverMetrics]
  )

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setTooltip((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)
  }, [])

  const handleMouseLeave = useCallback(() => {
    setTooltip(null)
    onHoverMetrics(null)
  }, [onHoverMetrics])

  if (n < 2) return null

  return (
    <div className="correlation-matrix" ref={containerRef}>
      <div className="correlation-matrix__title">Correlation matrix</div>
      {hasMeasured && cellSize > 0 && (
        <svg
          width={svgWidth}
          height={svgHeight}
          className="correlation-matrix__svg"
        >
          {/* Top axis labels (columns 0..n-2) */}
          <defs>
            <clipPath id="top-label-clip">
              <rect x={0} y={-10} width={LABEL_OFFSET} height={20} />
            </clipPath>
            <clipPath id="left-label-clip">
              <rect x={0} y={-10} width={LABEL_OFFSET - 4} height={20} />
            </clipPath>
          </defs>
          <g transform={`translate(${LABEL_OFFSET}, ${LABEL_OFFSET - 4})`}>
            {Array.from({ length: n - 1 }, (_, col) => (
              <g
                key={`top-${col}`}
                transform={`translate(${col * cellSize}, 0) rotate(-45)`}
                clipPath="url(#top-label-clip)"
              >
                <text
                  x={0}
                  y={0}
                  textAnchor="start"
                  className={`correlation-matrix__axis-label${
                    highlightedMetrics.has(metricNames[col]) ? ' correlation-matrix__axis-label--highlighted' : ''
                  }`}
                >
                  {metricNames[col]}
                </text>
              </g>
            ))}
          </g>

          {/* Left axis labels (rows: vr 0..n-2 → dataRow n-1..1) */}
          <g transform={`translate(0, ${LABEL_OFFSET})`}>
            {Array.from({ length: n - 1 }, (_, vr) => {
              const dataRow = n - 1 - vr
              return (
                <g
                  key={`left-${vr}`}
                  transform={`translate(0, ${vr * cellSize + cellSize / 2})`}
                  clipPath="url(#left-label-clip)"
                >
                  <text
                    x={0}
                    y={0}
                    textAnchor="start"
                    dominantBaseline="central"
                    className={`correlation-matrix__axis-label${
                      highlightedMetrics.has(metricNames[dataRow]) ? ' correlation-matrix__axis-label--highlighted' : ''
                    }`}
                  >
                    {metricNames[dataRow]}
                  </text>
                </g>
              )
            })}
          </g>

          {/* Grid area */}
          <g transform={`translate(${LABEL_OFFSET + 2}, ${LABEL_OFFSET + 2})`}>
          {/* Upper-left triangle: row 0 has n-1 cells, row 1 has n-2, ... */}
          {Array.from({ length: n - 1 }, (_, vr) => {
            const dataRow = n - 1 - vr
            const numCols = n - 1 - vr
            return Array.from({ length: numCols }, (_, col) => (
              <rect
                key={`${vr}-${col}`}
                data-row={dataRow}
                data-col={col}
                x={col * cellSize}
                y={vr * cellSize}
                width={cellSize}
                height={cellSize}
                fill={colorScale(matrix[dataRow][col])}
                onMouseEnter={handleMouseEnter}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                style={{ cursor: 'pointer' }}
              />
            ))
          })}
          {/* Grid lines */}
          <g stroke="#555" strokeWidth={1} shapeRendering="crispEdges" pointerEvents="none">
            {Array.from({ length: n }, (_, r) => (
              <line key={`h${r}`} x1={0} y1={r * cellSize} x2={(r === 0 ? n - 1 : n - r) * cellSize} y2={r * cellSize} />
            ))}
            {Array.from({ length: n }, (_, c) => (
              <line key={`v${c}`} x1={c * cellSize} y1={0} x2={c * cellSize} y2={(c === 0 ? n - 1 : n - c) * cellSize} />
            ))}
          </g>
          {/* Hover highlight on top */}
          {tooltip && (() => {
            const ri = metricNames.indexOf(tooltip.colA)
            const ci = metricNames.indexOf(tooltip.colB)
            const dataRow = Math.max(ri, ci)
            const col = Math.min(ri, ci)
            const vr = n - 1 - dataRow
            return (
              <rect
                x={col * cellSize} y={vr * cellSize}
                width={cellSize} height={cellSize}
                fill="none" stroke="#5b9bd5" strokeWidth={3}
                pointerEvents="none"
              />
            )
          })()}
          </g>
        </svg>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div
          className="correlation-matrix__tooltip"
          style={{
            position: 'fixed',
            left: tooltip.x + 12,
            top: tooltip.y - 12,
            pointerEvents: 'none',
            zIndex: 1000,
          }}
        >
          <div className="correlation-matrix__tooltip-header">
            r = {tooltip.r.toFixed(4)}
          </div>
          <div className="correlation-matrix__tooltip-pair">
            {tooltip.colA} &times; {tooltip.colB}
          </div>
        </div>
      )}
    </div>
  )
}
