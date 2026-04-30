import { create } from 'zustand'
import type {
  CodeBlock,
  SelectionState,
  SelectionSource,
  WeightedBlockId,
  SimilarityHistogramData,
  SimilarityHistogramStatistics,
  CommitteeVoteInfo,
  FlipHistoryEntry,
  FeatureImportanceSnapshot,
  FilterSummary,
  ActiveStage,
} from '../types'
import {
  fetchBlocks,
  fetchSimilarityHistogram,
  fetchColdStartSuggestions,
} from '../api'
import { FLIP_HISTORY_WINDOW_SIZE } from '../lib/constants'

// ============================================================================
// HELPERS
// ============================================================================

const MAX_ENABLED = 15

function computeDefaultEnabled(
  allColumns: string[],
  filterSummary: FilterSummary | null,
): Set<string> {
  if (!filterSummary) return new Set(allColumns)

  const toDisable = new Set<string>()
  for (const col of filterSummary.removed_low_variance) {
    toDisable.add(col)
  }
  for (const { removed } of filterSummary.removed_correlated) {
    toDisable.add(removed)
  }

  let surviving = allColumns.filter(col => !toDisable.has(col))

  // If still more than MAX_ENABLED, keep top by coefficient of variation
  if (surviving.length > MAX_ENABLED) {
    const cv = (col: string) => {
      const v = filterSummary.variances[col] ?? 0
      const m = Math.abs(filterSummary.means[col] ?? 0)
      return m > 1e-10 ? Math.sqrt(v) / m : Math.sqrt(v)
    }
    surviving = surviving
      .slice()
      .sort((a, b) => cv(b) - cv(a))
      .slice(0, MAX_ENABLED)
  }

  const enabled = new Set(surviving)
  return enabled.size > 0 ? enabled : new Set(allColumns)
}

// ============================================================================
// STORE INTERFACE
// ============================================================================

interface AppState {
  // Data
  blocks: CodeBlock[]
  metricColumns: string[]
  initialized: boolean

  // Selection
  blockSelectionStates: Map<number, SelectionState>
  blockSelectionSources: Map<number, SelectionSource>

  // SVM
  similarityScores: Map<number, number>
  histogramData: SimilarityHistogramData | null
  histogramStatistics: SimilarityHistogramStatistics | null
  committeeVotes: Map<number, CommitteeVoteInfo>

  // Thresholds
  selectThreshold: number
  rejectThreshold: number
  isDraggingThreshold: boolean

  // UI
  currentBlockId: number | null
  isLoading: boolean
  activeStage: ActiveStage
  hideTagged: boolean
  showDisagreementOnly: boolean

  // Cold start
  diversityIds: Set<number>

  // Flip tracking
  flipHistory: FlipHistoryEntry[]
  totalIterations: number
  previousPredictions: Map<number, 'selected' | 'rejected'>

  // Feature selection
  allMetricColumns: string[]
  enabledFeatures: Set<string>
  featureImportances: Record<string, number> | null
  featureImportanceHistory: FeatureImportanceSnapshot[]
  filterSummary: FilterSummary | null

  // Actions
  initialize: () => Promise<void>
  setBlockSelection: (blockId: number, state: SelectionState, source: SelectionSource) => void
  removeBlockSelection: (blockId: number) => void
  fetchHistogram: () => Promise<void>
  applyThresholdTags: () => Promise<void>
  setCurrentBlock: (blockId: number | null) => void
  updateThresholds: (select: number, reject: number) => void
  setIsDraggingThreshold: (dragging: boolean) => void
  setActiveStage: (stage: ActiveStage) => void
  setHideTagged: (hide: boolean) => void
  setShowDisagreementOnly: (show: boolean) => void
  setFeatureEnabled: (feature: string, enabled: boolean) => void
  refetchColdStart: () => Promise<void>

  // Navigation
  getFilteredBlocks: () => CodeBlock[]
  selectFirstUntagged: () => void
  selectNextUntagged: () => void
  labelBlock: (blockId: number, state: SelectionState) => Promise<void>
}

// ============================================================================
// STORE
// ============================================================================

export const useStore = create<AppState>((set, get) => ({
  // Data
  blocks: [],
  metricColumns: [],
  initialized: false,

  // Selection
  blockSelectionStates: new Map(),
  blockSelectionSources: new Map(),

  // SVM
  similarityScores: new Map(),
  histogramData: null,
  histogramStatistics: null,
  committeeVotes: new Map(),

  // Thresholds
  selectThreshold: 0.5,
  rejectThreshold: -0.5,
  isDraggingThreshold: false,

  // UI
  currentBlockId: null,
  isLoading: false,
  activeStage: 'bootstrap',
  hideTagged: false,
  showDisagreementOnly: false,

  // Cold start
  diversityIds: new Set(),

  // Flip tracking
  flipHistory: [],
  totalIterations: 0,
  previousPredictions: new Map(),

  // Feature selection
  allMetricColumns: [],
  enabledFeatures: new Set<string>(),
  featureImportances: null,
  featureImportanceHistory: [],
  filterSummary: null,

  // ---- Actions ----

  initialize: async () => {
    set({ isLoading: true })
    try {
      const resp = await fetchBlocks()
      const { blocks, metric_columns } = resp
      const allCols = resp.all_metric_columns ?? metric_columns
      const enabled = computeDefaultEnabled(allCols, resp.filter_summary ?? null)
      const blockIds = blocks.map((b) => b.block_id)
      const diversityIdsArr = await fetchColdStartSuggestions(blockIds, 20, Array.from(enabled))
      const diversitySet = new Set(diversityIdsArr)
      const topBootstrapBlock = blocks.find((b) => diversitySet.has(b.block_id))

      set({
        blocks,
        metricColumns: metric_columns,
        allMetricColumns: allCols,
        enabledFeatures: enabled,
        filterSummary: resp.filter_summary ?? null,
        diversityIds: diversitySet,
        initialized: true,
        isLoading: false,
        currentBlockId: topBootstrapBlock?.block_id ?? blocks[0]?.block_id ?? null,
      })
    } catch (e) {
      console.error('Failed to initialize:', e)
      set({ isLoading: false })
    }
  },

  refetchColdStart: async () => {
    const { blocks, enabledFeatures, activeStage } = get()
    if (blocks.length === 0) return
    set({ isLoading: true })
    try {
      const blockIds = blocks.map((b) => b.block_id)
      const diversityIdsArr = await fetchColdStartSuggestions(
        blockIds, 20, Array.from(enabledFeatures),
      )
      const diversitySet = new Set(diversityIdsArr)
      set({ diversityIds: diversitySet, isLoading: false })
      if (activeStage === 'bootstrap') {
        get().selectFirstUntagged()
      }
    } catch (e) {
      console.error('Failed to refetch cold start:', e)
      set({ isLoading: false })
    }
  },

  setBlockSelection: (blockId, state, source) => {
    set((s) => {
      const states = new Map(s.blockSelectionStates)
      const sources = new Map(s.blockSelectionSources)
      states.set(blockId, state)
      sources.set(blockId, source)
      return { blockSelectionStates: states, blockSelectionSources: sources }
    })
  },

  removeBlockSelection: (blockId) => {
    set((s) => {
      const states = new Map(s.blockSelectionStates)
      const sources = new Map(s.blockSelectionSources)
      states.delete(blockId)
      sources.delete(blockId)
      return { blockSelectionStates: states, blockSelectionSources: sources }
    })
  },

  fetchHistogram: async () => {
    const { blocks, blockSelectionStates, blockSelectionSources, similarityScores } = get()
    const selectedItems: WeightedBlockId[] = []
    const rejectedItems: WeightedBlockId[] = []

    for (const [id, state] of blockSelectionStates) {
      const src = blockSelectionSources.get(id) ?? 'click'
      if (src === 'predicted') continue
      const item: WeightedBlockId = { id, source: src === 'click' ? 'click' : 'threshold' }
      if (state === 'selected') selectedItems.push(item)
      else rejectedItems.push(item)
    }

    if (selectedItems.length < 3 || rejectedItems.length < 3) return

    set({ isLoading: true })
    try {
      const blockIds = blocks.map((b) => b.block_id)
      const enabledArr = Array.from(get().enabledFeatures)
      const resp = await fetchSimilarityHistogram(selectedItems, rejectedItems, blockIds, enabledArr)

      const newScores = new Map<number, number>()
      for (const [k, v] of Object.entries(resp.scores)) {
        newScores.set(Number(k), v)
      }

      const newVotes = new Map<number, CommitteeVoteInfo>()
      if (resp.committee_votes) {
        for (const [k, v] of Object.entries(resp.committee_votes)) {
          newVotes.set(Number(k), v)
        }
      }

      // Feature importances
      const newImportances = resp.feature_importances ?? null
      let newImportanceHistory = get().featureImportanceHistory
      if (newImportances) {
        const snapshot: FeatureImportanceSnapshot = {
          iteration: get().totalIterations + 1,
          importances: newImportances,
        }
        newImportanceHistory = [...newImportanceHistory, snapshot].slice(-20)
      }

      // Flip tracking
      const prevPreds = get().previousPredictions
      let flips = 0
      let total = 0
      const newPreds = new Map<number, 'selected' | 'rejected'>()
      const flipTransitions: Record<string, number> = {}

      for (const [id, score] of newScores) {
        const pred: 'selected' | 'rejected' = score > 0 ? 'selected' : 'rejected'
        newPreds.set(id, pred)
        if (prevPreds.has(id)) {
          total++
          if (prevPreds.get(id) !== pred) {
            flips++
            const transitionKey = `${prevPreds.get(id)!}\u2192${pred}`
            flipTransitions[transitionKey] = (flipTransitions[transitionKey] || 0) + 1
          }
        }
      }

      const flipRate = total > 0 ? flips / total : 0
      const { flipHistory, totalIterations } = get()

      // Prediction counts
      let selCount = 0, rejCount = 0
      for (const pred of newPreds.values()) {
        if (pred === 'selected') selCount++
        else rejCount++
      }

      const newEntry: FlipHistoryEntry = {
        flipRate,
        isBatch: false,
        iteration: totalIterations + 1,
        predictionCounts: { selected: selCount, rejected: rejCount },
        flipTransitions,
      }

      const newHistory = [...flipHistory, newEntry].slice(-FLIP_HISTORY_WINDOW_SIZE)

      // Auto-set thresholds based on score range
      const scoreArr = Array.from(newScores.values())
      const minScore = Math.min(...scoreArr)
      const maxScore = Math.max(...scoreArr)
      const range = maxScore - minScore
      const defaultSelect = range > 0 ? minScore + range * 0.7 : 0.5
      const defaultReject = range > 0 ? minScore + range * 0.3 : -0.5

      set({
        similarityScores: newScores,
        histogramData: resp.histogram,
        histogramStatistics: resp.statistics,
        committeeVotes: newVotes,
        isLoading: false,
        previousPredictions: newPreds,
        flipHistory: newHistory,
        totalIterations: totalIterations + 1,
        selectThreshold: get().histogramData ? get().selectThreshold : defaultSelect,
        rejectThreshold: get().histogramData ? get().rejectThreshold : defaultReject,
        featureImportances: newImportances,
        featureImportanceHistory: newImportanceHistory,
      })
    } catch (e) {
      console.error('Failed to fetch histogram:', e)
      set({ isLoading: false })
    }
  },

  applyThresholdTags: async () => {
    const { blocks, similarityScores, selectThreshold, rejectThreshold, blockSelectionStates, blockSelectionSources } = get()
    const states = new Map(blockSelectionStates)
    const sources = new Map(blockSelectionSources)

    for (const block of blocks) {
      const score = similarityScores.get(block.block_id)
      if (score === undefined) continue
      // Only tag currently-unsure blocks; leave already-applied ones alone
      if (states.has(block.block_id)) continue

      if (score >= selectThreshold) {
        states.set(block.block_id, 'selected')
        sources.set(block.block_id, 'threshold')
      } else if (score <= rejectThreshold) {
        states.set(block.block_id, 'rejected')
        sources.set(block.block_id, 'threshold')
      }
    }

    set({
      blockSelectionStates: states,
      blockSelectionSources: sources,
      activeStage: 'apply',
      hideTagged: true,
      showDisagreementOnly: true,
    })

    // Retrain with the newly applied threshold tags
    await get().fetchHistogram()
  },

  setCurrentBlock: (blockId) => set({ currentBlockId: blockId }),

  updateThresholds: (select, reject) =>
    set({ selectThreshold: select, rejectThreshold: reject }),

  setIsDraggingThreshold: (dragging) => set({ isDraggingThreshold: dragging }),

  setActiveStage: (stage) => {
    if (stage === 'apply') {
      set({ activeStage: stage, hideTagged: true, showDisagreementOnly: true })
    } else {
      set({ activeStage: stage })
    }
    get().selectFirstUntagged()
  },

  setHideTagged: (hide) => set({ hideTagged: hide }),

  setShowDisagreementOnly: (show) => set({ showDisagreementOnly: show }),

  setFeatureEnabled: (feature, enabled) => {
    set((s) => {
      const next = new Set(s.enabledFeatures)
      if (enabled) next.add(feature)
      else next.delete(feature)
      return { enabledFeatures: next }
    })
  },

  // ---- Navigation ----

  getFilteredBlocks: () => {
    const s = get()
    let list = s.blocks

    if (s.activeStage === 'bootstrap' && s.diversityIds.size > 0) {
      list = list.filter((b) => s.diversityIds.has(b.block_id))
    }

    if (s.activeStage === 'learn') {
      list = [...list].sort((a, b) => {
        const sa = s.similarityScores.get(a.block_id)
        const sb = s.similarityScores.get(b.block_id)
        return (sa !== undefined ? Math.abs(sa) : Infinity) -
               (sb !== undefined ? Math.abs(sb) : Infinity)
      })
    } else if (s.activeStage === 'apply') {
      list = list.filter((b) => {
        const score = s.similarityScores.get(b.block_id)
        return score !== undefined && (score >= s.selectThreshold || score <= s.rejectThreshold)
      })
      list = [...list].sort((a, b) => {
        const sa = s.similarityScores.get(a.block_id)!
        const sb = s.similarityScores.get(b.block_id)!
        return Math.abs(sa) - Math.abs(sb)
      })
    }

    if (s.showDisagreementOnly) {
      list = list.filter((b) => {
        const vote = s.committeeVotes.get(b.block_id)
        return vote !== undefined && vote.vote_entropy > 0
      })
    }

    if (s.hideTagged) {
      list = list.filter((b) => !s.blockSelectionStates.has(b.block_id))
    }

    return list
  },

  selectFirstUntagged: () => {
    const list = get().getFilteredBlocks()
    const states = get().blockSelectionStates
    for (const b of list) {
      if (!states.has(b.block_id)) {
        set({ currentBlockId: b.block_id })
        return
      }
    }
    // All tagged — select the first item if any
    if (list.length > 0) {
      set({ currentBlockId: list[0].block_id })
    }
  },

  selectNextUntagged: () => {
    const { currentBlockId, blockSelectionStates } = get()
    if (currentBlockId === null) return
    const list = get().getFilteredBlocks()
    const idx = list.findIndex((b) => b.block_id === currentBlockId)
    for (let i = 1; i < list.length; i++) {
      const next = list[(idx + i) % list.length]
      if (!blockSelectionStates.has(next.block_id)) {
        set({ currentBlockId: next.block_id })
        return
      }
    }
  },

  labelBlock: async (blockId, state) => {
    const { blockSelectionStates, activeStage } = get()
    const currentState = blockSelectionStates.get(blockId)

    // Toggle off if re-clicking same label
    if (currentState === state) {
      get().removeBlockSelection(blockId)
      get().fetchHistogram()
      return
    }

    // Set the label
    get().setBlockSelection(blockId, state, 'click')

    if (activeStage === 'bootstrap') {
      // Bootstrap: advance immediately, fire-and-forget retrain (sort doesn't depend on scores)
      get().selectNextUntagged()
      get().fetchHistogram()
    } else {
      // Learn/Apply: await retrain so scores update, THEN pick the new top item
      await get().fetchHistogram()
      get().selectFirstUntagged()
    }
  },
}))
