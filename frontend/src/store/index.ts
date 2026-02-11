import { create } from 'zustand'
import type {
  CodeBlock,
  SelectionState,
  SelectionSource,
  WeightedBlockId,
  SimilarityHistogramData,
  SimilarityHistogramStatistics,
  CommitteeVoteInfo,
  Commit,
  CommitCounts,
  FlipHistoryEntry,
  ActiveStage,
} from '../types'
import {
  fetchBlocks,
  fetchSimilarityHistogram,
  fetchColdStartSuggestions,
} from '../api'

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

  // Cold start
  diversityIds: Set<number>

  // Commit history
  commits: Commit[]
  activeCommitId: number

  // Flip tracking
  flipHistory: FlipHistoryEntry[]
  totalIterations: number
  previousPredictions: Map<number, 'selected' | 'rejected'>

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
  restoreCommit: (commitId: number) => void
}

// ============================================================================
// HELPERS
// ============================================================================

function computeCounts(
  states: Map<number, SelectionState>,
  sources: Map<number, SelectionSource>,
  total: number,
): CommitCounts {
  let selected = 0, selectedAuto = 0, rejected = 0, rejectedAuto = 0
  for (const [id, state] of states) {
    const src = sources.get(id)
    if (state === 'selected') {
      if (src === 'click') selected++
      else selectedAuto++
    } else {
      if (src === 'click') rejected++
      else rejectedAuto++
    }
  }
  return {
    selected,
    selectedAuto,
    rejected,
    rejectedAuto,
    unsure: total - selected - selectedAuto - rejected - rejectedAuto,
  }
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

  // Cold start
  diversityIds: new Set(),

  // Commit history
  commits: [],
  activeCommitId: 0,

  // Flip tracking
  flipHistory: [],
  totalIterations: 0,
  previousPredictions: new Map(),

  // ---- Actions ----

  initialize: async () => {
    set({ isLoading: true })
    try {
      const { blocks, metric_columns } = await fetchBlocks()
      const blockIds = blocks.map((b) => b.block_id)
      const diversityIdsArr = await fetchColdStartSuggestions(blockIds, 10)

      // Create initial commit (Commit 0)
      const initialCommit: Commit = {
        id: 0,
        type: 'initial',
        timestamp: Date.now(),
        states: new Map(),
        sources: new Map(),
        counts: { selected: 0, selectedAuto: 0, rejected: 0, rejectedAuto: 0, unsure: blocks.length },
      }

      set({
        blocks,
        metricColumns: metric_columns,
        diversityIds: new Set(diversityIdsArr),
        initialized: true,
        isLoading: false,
        currentBlockId: diversityIdsArr[0] ?? blocks[0]?.block_id ?? null,
        commits: [initialCommit],
        activeCommitId: 0,
      })
    } catch (e) {
      console.error('Failed to initialize:', e)
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
      const resp = await fetchSimilarityHistogram(selectedItems, rejectedItems, blockIds)

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

      // Flip tracking
      const prevPreds = get().previousPredictions
      let flips = 0
      let total = 0
      const newPreds = new Map<number, 'selected' | 'rejected'>()

      for (const [id, score] of newScores) {
        const pred: 'selected' | 'rejected' = score > 0 ? 'selected' : 'rejected'
        newPreds.set(id, pred)
        if (prevPreds.has(id)) {
          total++
          if (prevPreds.get(id) !== pred) {
            flips++
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
      }

      const newHistory = [...flipHistory, newEntry].slice(-10)

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
        activeStage: 'learn',
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
      // Don't override manual (click) tags
      if (sources.get(block.block_id) === 'click') continue

      if (score >= selectThreshold) {
        states.set(block.block_id, 'selected')
        sources.set(block.block_id, 'threshold')
      } else if (score <= rejectThreshold) {
        states.set(block.block_id, 'rejected')
        sources.set(block.block_id, 'threshold')
      } else {
        // Clear previous auto-tags in the middle zone
        if (sources.get(block.block_id) === 'threshold') {
          states.delete(block.block_id)
          sources.delete(block.block_id)
        }
      }
    }

    // Create commit
    const counts = computeCounts(states, sources, blocks.length)
    const newCommit: Commit = {
      id: get().commits.length,
      type: 'threshold',
      timestamp: Date.now(),
      states: new Map(states),
      sources: new Map(sources),
      counts,
    }

    set({
      blockSelectionStates: states,
      blockSelectionSources: sources,
      commits: [...get().commits, newCommit],
      activeCommitId: newCommit.id,
      activeStage: 'apply',
    })

    // Retrain with the newly applied threshold tags
    await get().fetchHistogram()
  },

  setCurrentBlock: (blockId) => set({ currentBlockId: blockId }),

  updateThresholds: (select, reject) =>
    set({ selectThreshold: select, rejectThreshold: reject }),

  setIsDraggingThreshold: (dragging) => set({ isDraggingThreshold: dragging }),

  setActiveStage: (stage) => set({ activeStage: stage }),

  restoreCommit: (commitId) => {
    const commit = get().commits.find((c) => c.id === commitId)
    if (!commit) return
    set({
      blockSelectionStates: new Map(commit.states),
      blockSelectionSources: new Map(commit.sources),
      activeCommitId: commitId,
    })
  },
}))
