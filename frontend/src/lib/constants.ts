// Category labels
export const CATEGORIES = {
  selected: 'Human',
  rejected: 'LLM',
  unsure: 'Unsure',
} as const

// Category colors
export const COLORS = {
  selected: '#4CAF50',       // Green — Human
  selectedAuto: '#81C784',   // Light green — Human auto
  rejected: '#FF9800',       // Orange — LLM
  rejectedAuto: '#FFB74D',   // Light orange — LLM auto
  unsure: '#E0E0E0',         // Gray — Unsure
} as const

// Selection category type (5-state)
export type SelectionCategory = 'confirmed' | 'autoSelected' | 'rejected' | 'autoRejected' | 'unsure'

// ============================================================================
// ACADEMIC VISUALIZATION COLOR SCHEMES
// Colorblind-friendly Okabe-Ito palette
// ============================================================================
export const OKABE_ITO_PALETTE = {
  BLACK: '#000000',
  ORANGE: '#E69F00',
  SKY_BLUE: '#56B4E9',
  BLUISH_GREEN: '#009E73',
  YELLOW: '#F0E442',
  BLUE: '#0072B2',
  VERMILLION: '#D55E00',
  REDDISH_PURPLE: '#CC79A7',
  GRAY: '#999999'
} as const

// Neutral UI colors for tooltips, badges, etc.
export const NEUTRAL_ICON_COLORS = {
  ICON_FILL: '#6b7280',
  ICON_STROKE: '#475569',
  ICON_LIGHT: '#94a3b8',
  BACKGROUND_LIGHT: '#f8fafc',
  BACKGROUND_MEDIUM: '#f1f5f9',
  BORDER_LIGHT: '#e2e8f0',
  BORDER_MEDIUM: '#cbd5e1',
  BADGE_BACKGROUND: '#475569',
  BADGE_TEXT: '#ffffff',
  TEXT_PRIMARY: '#1f2937',
  TEXT_SECONDARY: '#64748b'
} as const

// ============================================================================
// STRIPE PATTERN - Unified settings for all stripe patterns
// Used across: SelectionBar, DecisionMarginHistogram
// ============================================================================
export const STRIPE_PATTERN = {
  width: 12,
  height: 12,
  stripeWidth: 6,
  gapWidth: 6,
  rotation: -45,
  opacity: 0.5,
  small: {
    width: 4,
    stripeWidth: 2,
    gapWidth: 2,
  }
}
