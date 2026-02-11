import { useMemo } from 'react'
import { useFlipTracking } from '../hooks/useFlipTracking'
import { line } from 'd3-shape'
import { scaleLinear } from 'd3-scale'
import '../styles/ConvergenceIndicator.css'

export default function ConvergenceIndicator() {
  const { flipHistory } = useFlipTracking()

  const sparkline = useMemo(() => {
    if (flipHistory.length < 2) return null

    const width = 200
    const height = 40
    const margin = { top: 4, right: 4, bottom: 4, left: 4 }
    const w = width - margin.left - margin.right
    const h = height - margin.top - margin.bottom

    const xScale = scaleLinear()
      .domain([0, Math.max(9, flipHistory.length - 1)])
      .range([0, w])

    const yScale = scaleLinear().domain([0, 0.5]).range([h, 0])

    const lineGen = line<{ x: number; y: number }>()
      .x((d) => d.x)
      .y((d) => d.y)

    const points = flipHistory.map((entry, i) => ({
      x: xScale(i),
      y: yScale(Math.min(entry.flipRate, 0.5)),
    }))

    const pathD = lineGen(points) ?? ''

    return { pathD, points, xScale, yScale, width, height, margin, w, h }
  }, [flipHistory])

  if (flipHistory.length < 2) {
    return (
      <div className="convergence-indicator">
        <div className="convergence-empty">Convergence after 2+ iterations</div>
      </div>
    )
  }

  if (!sparkline) return null

  const { pathD, points, yScale, width, height, margin, w, h } = sparkline

  return (
    <div className="convergence-indicator">
      <svg viewBox={`0 0 ${width} ${height}`}>
        <g transform={`translate(${margin.left},${margin.top})`}>
          {/* Reference lines */}
          {[0.1, 0.25].map((ref) => (
            <line
              key={ref}
              className="ref-line"
              x1={0}
              y1={yScale(ref)}
              x2={w}
              y2={yScale(ref)}
            />
          ))}

          {/* Sparkline */}
          <path className="sparkline-path" d={pathD} />

          {/* Dots */}
          {points.map((p, i) => (
            <circle
              key={i}
              className="sparkline-dot"
              cx={p.x}
              cy={p.y}
              r={2}
            />
          ))}

          {/* Zero line */}
          <line x1={0} y1={h} x2={w} y2={h} stroke="var(--color-border)" strokeWidth={0.5} />
        </g>
      </svg>
    </div>
  )
}
