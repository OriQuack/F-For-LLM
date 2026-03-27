import { useMemo, useState } from 'react'
import { COLORS } from '../lib/constants'
import { getStripeGradient } from '../lib/color-utils'
import Tooltip from './Tooltip'
import type { CategoryCounts } from '../lib/histogram-utils'
import '../styles/SelectionBar.css'

interface Props {
  counts: CategoryCounts
  previewCounts?: CategoryCounts | null
  total: number
  containerHeight?: number | string
  showLabels?: boolean
}

// Category rendering config
const CATEGORY_CONFIG = {
  rejected: { label: 'LLM', color: COLORS.rejected, isAuto: false },
  autoRejected: { label: 'LLM', color: COLORS.rejectedAuto, isAuto: true },
  unsure: { label: 'Unsure', color: COLORS.unsure, isAuto: false },
  autoSelected: { label: 'Human', color: COLORS.selectedAuto, isAuto: true },
  confirmed: { label: 'Human', color: COLORS.selected, isAuto: false },
} as const

// Render order (bottom to top): rejected → autoRejected → unsure → autoSelected → confirmed
const SEGMENT_ORDER: Array<keyof typeof CATEGORY_CONFIG> = [
  'rejected', 'autoRejected', 'unsure', 'autoSelected', 'confirmed'
]

export default function SelectionBar({
  counts,
  previewCounts,
  total,
  containerHeight = '100%',
  showLabels = true,
}: Props) {
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null)

  const displayCounts = previewCounts ?? counts

  const segments = useMemo(() => {
    if (total === 0) return []

    return SEGMENT_ORDER.map(category => {
      const config = CATEGORY_CONFIG[category]
      const count = displayCounts[category]
      const percentage = total > 0 ? (count / total) * 100 : 0

      // Auto segments get stripe gradient on unsure background
      let background: string
      if (config.isAuto && count > 0) {
        background = getStripeGradient(config.color, COLORS.unsure)
      } else {
        background = config.color
      }

      return {
        category,
        label: config.label,
        count,
        percentage,
        background,
        isAuto: config.isAuto,
        color: config.color,
      }
    }).filter(s => s.count > 0)
  }, [displayCounts, total])

  return (
    <div
      className="selection-state-bar"
      style={{
        height: typeof containerHeight === 'number' ? `${containerHeight}px` : containerHeight,
      }}
    >
      {/* Vertical bar with segments */}
      <div
        className="selection-state-bar__bar"
        style={{
          width: 42,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
      >
        {segments.map((seg) => (
          <div
            key={seg.category}
            className="selection-state-bar__segment selection-state-bar__segment--interactive"
            style={{
              height: `${seg.percentage}%`,
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: seg.isAuto ? COLORS.unsure : seg.color,
              backgroundImage: seg.isAuto ? getStripeGradient(seg.color, COLORS.unsure) : undefined,
              position: 'relative',
            }}
            onMouseEnter={(e) => {
              setHoveredCategory(seg.category)
              setTooltipPosition({ x: e.clientX, y: e.clientY })
            }}
            onMouseMove={(e) => setTooltipPosition({ x: e.clientX, y: e.clientY })}
            onMouseLeave={() => { setHoveredCategory(null); setTooltipPosition(null) }}
          >
            {/* Left-side label */}
            {showLabels && (
              <div className="selection-state-bar__left-label">
                <span className="selection-state-bar__label-name">
                  {seg.label}
                  {seg.isAuto && (
                    <span className="selection-state-bar__label-auto">auto</span>
                  )}
                </span>
                <span className="selection-state-bar__label-count">
                  ({seg.count.toLocaleString()})
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Tooltip */}
      {hoveredCategory && tooltipPosition && (() => {
        const seg = segments.find(s => s.category === hoveredCategory)
        if (!seg) return null
        return (
          <Tooltip x={tooltipPosition.x} y={tooltipPosition.y}>
            <Tooltip.Header>{seg.label}</Tooltip.Header>
            <Tooltip.Row>{seg.count.toLocaleString()} blocks ({seg.percentage.toFixed(1)}%)</Tooltip.Row>
          </Tooltip>
        )
      })()}
    </div>
  )
}
