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
// ============================================================================
// METRIC DISPLAY NAMES — human-readable labels for metric column names
// ============================================================================
export const METRIC_LABELS: Record<string, string> = {
  // Lexical
  avg_identifier_len: 'Avg Identifier Length',
  std_identifier_len: 'Identifier Length Std',
  single_char_identifier_ratio: 'Single-Char Identifiers',
  camel_case_ratio: 'camelCase Ratio',
  snake_case_ratio: 'snake_case Ratio',
  digit_in_identifier_ratio: 'Digits in Identifiers',
  repeated_identifier_ratio: 'Identifier Reuse',
  identifier_entropy: 'Identifier Entropy',
  unique_token_ratio: 'Unique Token Ratio',
  type_token_ratio: 'Type-Token Ratio',
  yules_k: "Yule's K",
  zipf_alpha_proxy: 'Zipf \u03b1 Proxy',
  identifier_ratio: 'Identifier Ratio',
  literal_ratio: 'Literal Ratio',
  keyword_ratio: 'Keyword Ratio',
  whitespace_ratio: 'Whitespace Ratio',
  // Comments
  comment_line_ratio: 'Comment Lines',
  inline_comment_ratio: 'Inline Comments',
  block_comment_ratio: 'Block Comments',
  docstring_ratio: 'Docstrings',
  avg_comment_len: 'Avg Comment Length',
  informal_tag_ratio: 'TODO/FIXME Tags',
  // Formatting
  avg_line_length: 'Avg Line Length',
  std_line_length: 'Line Length Std',
  blank_line_ratio: 'Blank Lines',
  blank_run_entropy: 'Blank Run Entropy',
  indentation_depth_mean: 'Avg Indentation',
  indentation_depth_std: 'Indentation Std',
  tab_ratio: 'Tab Usage',
  trailing_whitespace_ratio: 'Trailing Whitespace',
  // Complexity
  loc: 'Lines of Code',
  non_empty_loc: 'Non-Empty Lines',
  token_count: 'Token Count',
  function_count: 'Function Count',
  avg_function_len: 'Avg Function Length',
  cyclomatic_complexity: 'Cyclomatic Complexity',
  max_nesting_depth: 'Max Nesting Depth',
  loop_count: 'Loops',
  branch_count: 'Branches',
  exception_count: 'Exceptions',
  return_count: 'Returns',
  // LM Probability
  lm_all_avg_logprob: 'LM Avg Log-Prob',
  lm_all_avg_rank: 'LM Avg Rank',
  lm_names_avg_logprob: 'LM Names Log-Prob',
  lm_special_avg_logprob: 'LM Special Log-Prob',
  lm_comments_avg_logprob: 'LM Comments Log-Prob',
  lm_others_avg_logprob: 'LM Other Log-Prob',
  lm_names_scaled_sum: 'LM Names Scaled',
  lm_special_scaled_sum: 'LM Special Scaled',
  lm_comments_scaled_sum: 'LM Comments Scaled',
  lm_others_scaled_sum: 'LM Other Scaled',
} as const

export function getMetricLabel(name: string): string {
  return METRIC_LABELS[name] ?? name
}

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
