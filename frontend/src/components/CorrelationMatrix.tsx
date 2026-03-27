import React, { useMemo, useState, useCallback } from 'react'
import { scaleLinear } from 'd3-scale'
import { useResizeObserver } from '../hooks/useResizeObserver'
import { getMetricLabel } from '../lib/constants'
import Tooltip from './Tooltip'
import type { CorrelationPair } from '../types'
import '../styles/CorrelationMatrix.css'

interface Props {
  metricNames: string[]
  correlations: CorrelationPair[]
  highlightedMetrics: Set<string>
  enabledFeatures: Set<string>
  onHoverMetrics: (metrics: [string, string] | null) => void
  onClickMetrics?: (pair: [string, string]) => void
}

const MIN_CELL = 4
const PADDING = 4

const colorScale = scaleLinear<string>()
  .domain([-1, 0, 1])
  .range(['#4575b4', '#ffffff', '#d73027'])
  .clamp(true)

const grayScale = scaleLinear<string>()
  .domain([0, 1])
  .range(['#ffffff', '#555555'])
  .clamp(true)

export default function CorrelationMatrix({
  metricNames,
  correlations,
  enabledFeatures,
  onHoverMetrics,
  onClickMetrics,
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
    return Math.max(MIN_CELL, Math.floor((containerSize.width - PADDING * 2) / (n - 1)))
  }, [containerSize.width, hasMeasured, n])

  const triWidth = cellSize * (n - 1)
  const triHeight = cellSize * (n - 1)
  const svgWidth = PADDING + triWidth + PADDING
  const svgHeight = PADDING + triHeight + PADDING

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

  const handleClick = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      if (!onClickMetrics) return
      const row = Number(e.currentTarget.dataset.row)
      const col = Number(e.currentTarget.dataset.col)
      if (row === col || isNaN(row) || isNaN(col)) return
      onClickMetrics([metricNames[row], metricNames[col]])
    },
    [metricNames, onClickMetrics]
  )

  const handleMouseLeave = useCallback(() => {
    setTooltip(null)
    onHoverMetrics(null)
  }, [onHoverMetrics])

  if (n < 2) return null

  return (
    <div className="correlation-matrix" ref={containerRef}>
      <div className="correlation-matrix__title subsubheader">Correlation Matrix</div>
      {hasMeasured && cellSize > 0 && (
        <svg
          width={svgWidth}
          height={svgHeight}
          className="correlation-matrix__svg"
        >
          {/* Grid area */}
          <g transform={`translate(${PADDING}, ${PADDING})`}>
          {/* Upper-left triangle: row 0 has n-1 cells, row 1 has n-2, ... */}
          {Array.from({ length: n - 1 }, (_, vr) => {
            const dataRow = n - 1 - vr
            const numCols = n - 1 - vr
            return Array.from({ length: numCols }, (_, col) => {
              const resolved = !enabledFeatures.has(metricNames[dataRow]) || !enabledFeatures.has(metricNames[col])
              return (
                <rect
                  key={`${vr}-${col}`}
                  data-row={dataRow}
                  data-col={col}
                  x={col * cellSize}
                  y={vr * cellSize}
                  width={cellSize}
                  height={cellSize}
                  fill={resolved ? grayScale(Math.abs(matrix[dataRow][col])) : colorScale(matrix[dataRow][col])}
                  onMouseEnter={handleMouseEnter}
                  onMouseMove={handleMouseMove}
                  onMouseLeave={handleMouseLeave}
                  onClick={handleClick}
                  style={{ cursor: 'pointer' }}
                />
              )
            })
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
        <Tooltip x={tooltip.x} y={tooltip.y}>
          <Tooltip.Header>r = {tooltip.r.toFixed(4)}</Tooltip.Header>
          <Tooltip.Row>{getMetricLabel(tooltip.colA)} &times; {getMetricLabel(tooltip.colB)}</Tooltip.Row>
        </Tooltip>
      )}
    </div>
  )
}
