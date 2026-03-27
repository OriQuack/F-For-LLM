// ============================================================================
// CORE TYPES
// ============================================================================

export interface CodeBlock {
  block_id: number
  file_id: number
  file_path: string
  block_type: string
  block_name: string
  language: string
  start_line: number
  end_line: number
}

export type SelectionState = 'selected' | 'rejected'
export type SelectionSource = 'click' | 'threshold' | 'predicted'

export interface WeightedBlockId {
  id: number
  source: 'click' | 'threshold'
}

// ============================================================================
// SVM / HISTOGRAM TYPES
// ============================================================================

export interface SimilarityHistogramData {
  bins: number[]
  counts: number[]
  bin_edges: number[]
}

export interface SimilarityHistogramStatistics {
  min: number
  max: number
  mean: number
  median: number
}

export interface CommitteeVoteInfo {
  svm_prediction: 0 | 1
  rf_prediction: 0 | 1
  mlp_prediction: 0 | 1
  vote_entropy: number
}

export interface SimilarityScoreHistogramResponse {
  scores: Record<string, number>
  histogram: SimilarityHistogramData
  statistics: SimilarityHistogramStatistics
  total_items: number
  committee_votes?: Record<string, CommitteeVoteInfo> | null
  feature_importances?: Record<string, number> | null
}

// ============================================================================
// FLIP TRACKING TYPES
// ============================================================================

export interface FlipHistoryEntry {
  flipRate: number
  isBatch: boolean
  iteration: number
  predictionCounts?: Record<string, number>
  flipTransitions?: Record<string, number>
}

export interface FlipTrackingInfo {
  flipHistory: FlipHistoryEntry[]
  totalIterations: number
  previousPredictions: Map<number, 'selected' | 'rejected'>
}

// ============================================================================
// FEATURE SELECTION TYPES
// ============================================================================

export interface FeatureImportanceSnapshot {
  iteration: number
  importances: Record<string, number>
}

export interface CorrelationPair {
  col_a: string
  col_b: string
  r: number
}

export interface FilterSummary {
  removed_low_variance: string[]
  removed_correlated: { removed: string; kept_instead: string }[]
  original_count: number
  surviving_count: number
  variances: Record<string, number>
  means: Record<string, number>
  correlations: CorrelationPair[]
}

// ============================================================================
// UI TYPES
// ============================================================================

export type ActiveStage = 'bootstrap' | 'learn' | 'apply'
