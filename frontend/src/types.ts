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
}

// ============================================================================
// COMMIT HISTORY TYPES
// ============================================================================

export type CommitType = 'initial' | 'manual' | 'threshold'

export interface CommitCounts {
  selected: number
  selectedAuto: number
  rejected: number
  rejectedAuto: number
  unsure: number
}

export interface Commit {
  id: number
  type: CommitType
  timestamp: number
  states: Map<number, SelectionState>
  sources: Map<number, SelectionSource>
  counts: CommitCounts
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
  flippedBins: Set<number>
  previousPredictions: Map<number, 'selected' | 'rejected'>
}

// ============================================================================
// UI TYPES
// ============================================================================

export type SortMode = 'default' | 'decisionMargin' | 'diversity'
export type ActiveStage = 'bootstrap' | 'learn' | 'apply'
