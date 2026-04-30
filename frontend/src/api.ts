import type {
  CodeBlock,
  WeightedBlockId,
  SimilarityScoreHistogramResponse,
  FilterSummary,
} from './types'

const BASE = '/api'

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

function post<T>(url: string, body: unknown): Promise<T> {
  return fetchJSON<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ---- Blocks ----

interface BlockListResponse {
  blocks: CodeBlock[]
  metric_columns: string[]
  total_blocks: number
  all_metric_columns: string[]
  filter_summary: FilterSummary | null
}

export async function fetchBlocks(): Promise<BlockListResponse> {
  return fetchJSON<BlockListResponse>(`${BASE}/blocks`)
}

interface BlockCodeResponse {
  block_id: number
  code: string
  language: string
}

export async function fetchBlockCode(blockId: number): Promise<string> {
  const res = await fetchJSON<BlockCodeResponse>(`${BASE}/blocks/${blockId}/code`)
  return res.code
}

// ---- SVM Histogram ----

export async function fetchSimilarityHistogram(
  selectedItems: WeightedBlockId[],
  rejectedItems: WeightedBlockId[],
  blockIds: number[],
  selectedFeatures?: string[],
): Promise<SimilarityScoreHistogramResponse> {
  return post<SimilarityScoreHistogramResponse>(
    `${BASE}/similarity-score-histogram`,
    {
      selected_items: selectedItems,
      rejected_items: rejectedItems,
      block_ids: blockIds,
      ...(selectedFeatures && { selected_features: selectedFeatures }),
    },
  )
}

// ---- Cold Start ----

interface ColdStartResponse {
  suggestion_ids: number[]
}

export async function fetchColdStartSuggestions(
  blockIds: number[],
  n: number = 30,
  selectedFeatures?: string[],
): Promise<number[]> {
  const res = await post<ColdStartResponse>(`${BASE}/cold-start/representative`, {
    block_ids: blockIds,
    num_suggestions: n,
    ...(selectedFeatures && { selected_features: selectedFeatures }),
  })
  return res.suggestion_ids
}

// ---- Export ----

export interface BlockResult {
  block_id: number
  label: string
  source: string
  score?: number | null
}

export async function fetchClassroomExport(
  blockResults: BlockResult[],
): Promise<unknown> {
  return post<unknown>(`${BASE}/export/classroom`, {
    block_results: blockResults,
  })
}
