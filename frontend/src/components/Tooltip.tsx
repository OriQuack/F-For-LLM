import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import '../styles/Tooltip.css'

interface TooltipProps {
  x: number
  y: number
  children: ReactNode
}

function TooltipRoot({ x, y, children }: TooltipProps) {
  return (
    <div
      className="tooltip"
      style={{
        position: 'fixed',
        left: x + 12,
        top: y - 12,
        pointerEvents: 'none',
        zIndex: 1000,
      }}
    >
      {children}
    </div>
  )
}

function Header({ children }: { children: ReactNode }) {
  return <div className="tooltip__header">{children}</div>
}

function Summary({ children }: { children: ReactNode }) {
  return <div className="tooltip__summary">{children}</div>
}

function Row({ children }: { children: ReactNode }) {
  return <div className="tooltip__row">{children}</div>
}

function Swatch({ color }: { color: string }) {
  return <span className="tooltip__swatch" style={{ backgroundColor: color }} />
}

const Tooltip = Object.assign(TooltipRoot, {
  Header,
  Summary,
  Row,
  Swatch,
})

// ============================================================================
// DATA-TOOLTIP LAYER — global event-delegated tooltip for [data-tooltip] elements
// ============================================================================
// Mount once in App.tsx. Any element with data-tooltip="..." shows a tooltip on
// hover. Optionally use data-tooltip-title="..." for a bold header line.

type DataTipState = { text: string; title?: string; x: number; y: number }

export function DataTooltipLayer() {
  const [state, setState] = useState<DataTipState | null>(null)
  const activeRef = useRef(false)
  const layerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const findTarget = (e: Event): HTMLElement | null =>
      (e.target as HTMLElement)?.closest?.('[data-tooltip],[data-tooltip-title]') as HTMLElement | null

    const onOver = (e: MouseEvent) => {
      const target = findTarget(e)
      if (!target) return
      const text = target.getAttribute('data-tooltip') || ''
      const title = target.getAttribute('data-tooltip-title') || undefined
      if (!text && !title) return
      activeRef.current = true
      setState({ text, title, x: e.clientX, y: e.clientY })
    }

    const onMove = (e: MouseEvent) => {
      if (activeRef.current) {
        setState(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)
      }
    }

    const onOut = (e: MouseEvent) => {
      const target = findTarget(e)
      if (!target) return
      const related = e.relatedTarget as HTMLElement | null
      if (!target.contains(related)) {
        activeRef.current = false
        setState(null)
      }
    }

    document.addEventListener('mouseover', onOver)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseout', onOut)
    return () => {
      document.removeEventListener('mouseover', onOver)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseout', onOut)
    }
  }, [])

  // Auto-flip when overflowing viewport
  useLayoutEffect(() => {
    const el = layerRef.current?.querySelector('.tooltip') as HTMLElement | null
    if (!el || !state) return
    const rect = el.getBoundingClientRect()
    if (rect.bottom > window.innerHeight) {
      el.style.top = `${state.y - rect.height - 8}px`
    }
    if (rect.right > window.innerWidth) {
      el.style.left = `${state.x - rect.width - 8}px`
    }
  })

  if (!state) return null

  return (
    <div ref={layerRef}>
      <Tooltip x={state.x} y={state.y}>
        {state.title && <Tooltip.Header>{state.title}</Tooltip.Header>}
        {state.text && <Tooltip.Summary>{state.text}</Tooltip.Summary>}
      </Tooltip>
    </div>
  )
}

export default Tooltip
