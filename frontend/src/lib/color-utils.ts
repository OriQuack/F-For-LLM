import { COLORS, STRIPE_PATTERN } from './constants'

/**
 * Add opacity to a hex color.
 * Converts #RRGGBB to #RRGGBBAA (hex with alpha)
 */
export function addOpacityToHex(hex: string, opacity: number): string {
  const cleanHex = hex.startsWith('#') ? hex.slice(1) : hex
  const alpha = Math.round(opacity * 255)
  const alphaHex = alpha.toString(16).padStart(2, '0').toUpperCase()
  return `#${cleanHex}${alphaHex}`
}

/**
 * Generate CSS repeating-linear-gradient for stripe patterns.
 * Color scheme: Tag-colored stripes on gray/unsure background.
 */
export function getStripeGradient(
  stripeColor: string,
  gapColor: string = COLORS.unsure,
  variant: 'standard' | 'small' = 'standard'
): string {
  const { rotation, opacity } = STRIPE_PATTERN
  const dims = variant === 'small' ? STRIPE_PATTERN.small : STRIPE_PATTERN
  const stripeColorWithOpacity = addOpacityToHex(stripeColor, opacity)

  return `repeating-linear-gradient(
    ${rotation}deg,
    ${gapColor},
    ${gapColor} ${dims.gapWidth}px,
    ${stripeColorWithOpacity} ${dims.gapWidth}px,
    ${stripeColorWithOpacity} ${dims.width}px
  )`
}

/**
 * Interpolate color for a score value between -1..+1.
 * Negative -> orange (LLM), positive -> green (Human).
 */
export function scoreColor(score: number): string {
  const t = Math.max(0, Math.min(1, (score + 1) / 2))
  const r = Math.round(255 * (1 - t) + 76 * t)
  const g = Math.round(152 * (1 - t) + 175 * t)
  const b = Math.round(0 * (1 - t) + 80 * t)
  return `rgb(${r},${g},${b})`
}
