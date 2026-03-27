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

export default Tooltip
