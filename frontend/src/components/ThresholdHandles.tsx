import React, { useState, useRef, useCallback } from 'react'
import { OKABE_ITO_PALETTE, NEUTRAL_ICON_COLORS } from '../lib/constants'

// ============================================================================
// TYPES
// ============================================================================

interface ThresholdHandlesProps {
  orientation: 'horizontal' | 'vertical'
  bounds: { min: number; max: number }
  thresholds: number[]
  metricRange: { min: number; max: number }
  position: { x: number; y: number }
  parentOffset?: { x: number; y: number }
  lineBounds?: { min: number; max: number }
  showThresholdLine?: boolean
  showDragTooltip?: boolean
  onUpdate: (newThresholds: number[]) => void
  onDragUpdate?: (newThresholds: number[]) => void
  onDragStart?: () => void
  onDragEnd?: () => void
  handleDimensions?: { width: number; height: number }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function calculateHandlePositionFromThreshold(
  threshold: number,
  metricMin: number,
  metricMax: number,
  boundsMin: number,
  boundsMax: number
): number {
  const metricRange = metricMax - metricMin
  let ratio: number
  if (metricRange === 0 || !isFinite(metricRange)) {
    ratio = 0.5
  } else {
    ratio = (threshold - metricMin) / metricRange
  }
  if (!isFinite(ratio)) ratio = 0.5

  const boundsRange = boundsMax - boundsMin
  const result = boundsMin + ratio * boundsRange
  return isFinite(result) ? result : boundsMin + boundsRange * 0.5
}

function calculateThresholdFromHandlePosition(
  position: number,
  metricMin: number,
  metricMax: number,
  boundsMin: number,
  boundsMax: number
): number {
  const boundsRange = boundsMax - boundsMin
  let ratio: number
  if (boundsRange === 0 || !isFinite(boundsRange)) {
    ratio = 0.5
  } else {
    ratio = (position - boundsMin) / boundsRange
  }
  if (!isFinite(ratio)) ratio = 0.5

  const metricRange = metricMax - metricMin
  const result = metricMin + ratio * metricRange
  return isFinite(result) ? result : (metricMin + metricMax) / 2
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const ThresholdHandles: React.FC<ThresholdHandlesProps> = ({
  orientation,
  bounds,
  thresholds,
  metricRange,
  position,
  parentOffset = { x: 0, y: 0 },
  lineBounds,
  showThresholdLine = true,
  showDragTooltip = true,
  onUpdate,
  onDragUpdate,
  onDragStart,
  onDragEnd,
  handleDimensions = { width: 20, height: 16 }
}) => {
  const effectiveLineBounds = lineBounds || bounds
  const [draggingHandle, setDraggingHandle] = useState<number | null>(null)
  const [hoveredHandle, setHoveredHandle] = useState<number | null>(null)
  const [tempThresholds, setTempThresholds] = useState<number[]>(thresholds)
  const rafIdRef = useRef<number | null>(null)
  const svgElementRef = useRef<SVGSVGElement | null>(null)
  const offsetRef = useRef<number>(0)
  const dragStartOffsetRef = useRef<number>(0)
  const justUpdatedRef = useRef<boolean>(false)
  const lastPreviewRef = useRef<string>('')
  const pendingThresholdsRef = useRef<number[] | null>(null)

  // Update temp thresholds when props change (but not during our own updates)
  React.useEffect(() => {
    if (justUpdatedRef.current) {
      const propsKey = thresholds.map(t => t.toFixed(6)).join(',')
      const pendingKey = pendingThresholdsRef.current?.map(t => t.toFixed(6)).join(',')
      if (propsKey === pendingKey) {
        justUpdatedRef.current = false
        pendingThresholdsRef.current = null
      }
      return
    }
    if (draggingHandle === null) {
      setTempThresholds(thresholds)
    }
  }, [thresholds, draggingHandle])

  const displayThresholds = tempThresholds

  const handleMouseDown = useCallback((handleIndex: number) => (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()

    const svgElement = (e.target as Element).closest('svg') as SVGSVGElement
    if (svgElement) svgElementRef.current = svgElement

    offsetRef.current = orientation === 'horizontal'
      ? parentOffset.x + position.x
      : parentOffset.y + position.y

    const svgRect = svgElement.getBoundingClientRect()
    const mousePos = orientation === 'horizontal'
      ? e.clientX - svgRect.left
      : e.clientY - svgRect.top

    const currentHandlePos = calculateHandlePositionFromThreshold(
      tempThresholds[handleIndex],
      metricRange.min, metricRange.max,
      bounds.min, bounds.max
    )

    dragStartOffsetRef.current = mousePos - offsetRef.current - currentHandlePos

    document.body.style.userSelect = 'none'
    document.body.style.cursor = orientation === 'horizontal' ? 'ew-resize' : 'ns-resize'

    onDragStart?.()
    setDraggingHandle(handleIndex)
  }, [orientation, parentOffset, position, tempThresholds, metricRange, bounds, onDragStart])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (draggingHandle === null) return
    e.preventDefault()

    if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current)

    rafIdRef.current = requestAnimationFrame(() => {
      const svgElement = svgElementRef.current
      if (!svgElement) return

      const svgRect = svgElement.getBoundingClientRect()
      const mousePos = orientation === 'horizontal'
        ? e.clientX - svgRect.left
        : e.clientY - svgRect.top

      const adjustedPos = mousePos - offsetRef.current - dragStartOffsetRef.current
      const clampedPos = Math.max(bounds.min, Math.min(bounds.max, adjustedPos))

      const newThreshold = calculateThresholdFromHandlePosition(
        clampedPos, metricRange.min, metricRange.max, bounds.min, bounds.max
      )

      const computeUpdated = (prev: number[]) => {
        const updated = [...prev]
        updated[draggingHandle] = newThreshold

        if (draggingHandle === 0 && updated.length > 1) {
          updated[0] = Math.min(updated[0], updated[1] - 0.01)
        } else if (draggingHandle === updated.length - 1 && updated.length > 1) {
          updated[draggingHandle] = Math.max(updated[draggingHandle], updated[draggingHandle - 1] + 0.01)
        }

        return updated
      }

      const newValues = computeUpdated(tempThresholds)

      if (onDragUpdate) {
        const previewKey = newValues.join(',')
        if (previewKey !== lastPreviewRef.current) {
          lastPreviewRef.current = previewKey
          onDragUpdate(newValues)
        }
      }

      setTempThresholds(newValues)
    })
  }, [draggingHandle, bounds, metricRange, orientation, onDragUpdate, tempThresholds])

  const handleMouseUp = useCallback(() => {
    if (draggingHandle === null) return

    document.body.style.userSelect = ''
    document.body.style.cursor = ''

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }

    svgElementRef.current = null
    offsetRef.current = 0
    dragStartOffsetRef.current = 0
    lastPreviewRef.current = ''

    justUpdatedRef.current = true
    pendingThresholdsRef.current = [...tempThresholds]

    onUpdate(tempThresholds)
    onDragEnd?.()
    setDraggingHandle(null)
  }, [draggingHandle, tempThresholds, onUpdate, onDragEnd])

  // Global mouse event listeners during drag
  React.useEffect(() => {
    if (draggingHandle === null) return
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [draggingHandle, handleMouseMove, handleMouseUp])

  return (
    <g className="threshold-handles" transform={`translate(${position.x}, ${position.y})`}>
      {displayThresholds.map((threshold, index) => {
        const pos = calculateHandlePositionFromThreshold(
          threshold, metricRange.min, metricRange.max, bounds.min, bounds.max
        )
        const isDragging = draggingHandle === index
        const isHovered = hoveredHandle === index && !isDragging

        // Professional color states — always blue Okabe-Ito
        const lineColor = OKABE_ITO_PALETTE.BLUE
        const lineOpacity = isDragging ? 1.0 : isHovered ? 0.9 : 0.8
        const handleFillColor = OKABE_ITO_PALETTE.BLUE
        const handleFillOpacity = isDragging ? 1.0 : isHovered ? 1.0 : 0.9
        const handleStrokeWidth = isDragging ? 2.5 : isHovered ? 2 : 1.5

        const handleX = orientation === 'horizontal'
          ? pos - handleDimensions.width / 2
          : -handleDimensions.width / 2
        const handleY = orientation === 'vertical'
          ? pos - handleDimensions.height / 2
          : 0

        const lineX1 = orientation === 'horizontal' ? pos : effectiveLineBounds.min
        const lineY1 = orientation === 'vertical' ? pos : effectiveLineBounds.min
        const lineX2 = orientation === 'horizontal' ? pos : effectiveLineBounds.max
        const lineY2 = orientation === 'vertical' ? pos : effectiveLineBounds.max

        return (
          <g key={index}>
            {/* Threshold line */}
            {showThresholdLine && (
              <line
                x1={lineX1} y1={lineY1} x2={lineX2} y2={lineY2}
                stroke={lineColor}
                strokeWidth={isDragging ? 2 : 1.5}
                strokeDasharray={isDragging ? 'none' : '4,3'}
                opacity={lineOpacity}
                style={{
                  pointerEvents: 'none',
                  transition: 'stroke 150ms ease-out, stroke-width 150ms ease-out, opacity 150ms ease-out'
                }}
              />
            )}

            {/* Professional grip-style handle */}
            <g
              onMouseDown={handleMouseDown(index)}
              onMouseEnter={() => setHoveredHandle(index)}
              onMouseLeave={() => setHoveredHandle(null)}
              style={{ cursor: orientation === 'horizontal' ? 'ew-resize' : 'ns-resize' }}
            >
              {/* Handle background (rounded rectangle) */}
              <rect
                x={handleX} y={handleY}
                width={handleDimensions.width}
                height={handleDimensions.height}
                rx={4}
                fill={handleFillColor}
                fillOpacity={handleFillOpacity}
                stroke="#ffffff"
                strokeWidth={handleStrokeWidth}
                filter={isDragging || isHovered
                  ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
                  : 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))'}
                style={{
                  transition: 'fill-opacity 150ms ease-out, stroke-width 150ms ease-out, filter 150ms ease-out'
                }}
              />

              {/* 3 grip lines */}
              {orientation === 'horizontal'
                ? [-5, 0, 5].map((offset, i) => (
                    <line
                      key={i}
                      x1={pos + offset} y1={5}
                      x2={pos + offset} y2={handleDimensions.height - 5}
                      stroke="#ffffff" strokeWidth={2}
                      strokeOpacity={1.0} strokeLinecap="round"
                      style={{ pointerEvents: 'none' }}
                    />
                  ))
                : [-5, 0, 5].map((offset, i) => (
                    <line
                      key={i}
                      x1={handleX + 6} y1={pos + offset}
                      x2={handleX + handleDimensions.width - 6} y2={pos + offset}
                      stroke="#ffffff" strokeWidth={2}
                      strokeOpacity={1.0} strokeLinecap="round"
                      style={{ pointerEvents: 'none' }}
                    />
                  ))}
            </g>

            {/* Drag tooltip showing current value */}
            {isDragging && showDragTooltip && (
              <g>
                {orientation === 'horizontal' ? (
                  <>
                    <rect
                      x={pos - 25} y={handleDimensions.height + 5}
                      width={50} height={20} rx={3}
                      fill={NEUTRAL_ICON_COLORS.BACKGROUND_MEDIUM}
                      stroke={NEUTRAL_ICON_COLORS.BORDER_MEDIUM}
                      strokeWidth={1} opacity={0.95}
                      style={{ pointerEvents: 'none' }}
                    />
                    <text
                      x={pos} y={handleDimensions.height + 19}
                      dy="0.35em" fontSize="14" fontFamily="monospace"
                      fontWeight="600" fill={NEUTRAL_ICON_COLORS.TEXT_PRIMARY}
                      textAnchor="middle"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {threshold.toFixed(3)}
                    </text>
                  </>
                ) : (
                  <>
                    <rect
                      x={handleDimensions.width / 2 + 8} y={pos - 10}
                      width={50} height={20} rx={3}
                      fill={NEUTRAL_ICON_COLORS.BACKGROUND_MEDIUM}
                      stroke={NEUTRAL_ICON_COLORS.BORDER_MEDIUM}
                      strokeWidth={1} opacity={0.95}
                      style={{ pointerEvents: 'none' }}
                    />
                    <text
                      x={handleDimensions.width / 2 + 33} y={pos}
                      dy="0.35em" fontSize="14" fontFamily="monospace"
                      fontWeight="600" fill={NEUTRAL_ICON_COLORS.TEXT_PRIMARY}
                      textAnchor="middle"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {threshold.toFixed(3)}
                    </text>
                  </>
                )}
              </g>
            )}
          </g>
        )
      })}
    </g>
  )
}

export default ThresholdHandles
