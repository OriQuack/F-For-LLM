import { scaleLinear } from 'd3-scale'
import type { ScaleLinear } from 'd3-scale'
import { max } from 'd3-array'
import type { SimilarityHistogramData } from '../types'

export type NumericScale = ScaleLinear<number, number>

// ============================================================================
// TYPES
// ============================================================================

export interface HistogramBin {
  x0: number
  x1: number
  count: number
  density: number
}

export interface HistogramChart {
  bins: HistogramBin[]
  xScale: NumericScale
  yScale: NumericScale
  width: number
  height: number
  margin: { top: number; right: number; bottom: number; left: number }
}

export interface CategoryCounts {
  confirmed: number
  autoSelected: number
  rejected: number
  autoRejected: number
  unsure: number
}

interface CategoryBarSegment {
  x: number
  y: number
  width: number
  height: number
  color: string
  category: 'confirmed' | 'autoSelected' | 'rejected' | 'autoRejected' | 'unsure'
  count: number
  binIndex: number
}

interface AxisTickData {
  value: number
  position: number
  label: string
}

// ============================================================================
// CONSTANTS
// ============================================================================
const DEFAULT_MARGIN = { top: 30, right: 4, bottom: 55, left: 25 }

// ============================================================================
// HISTOGRAM LAYOUT
// ============================================================================

/**
 * Calculate histogram layout from SimilarityHistogramData.
 * Creates HistogramChart with bin objects, scales, and dimensions.
 */
export function calculateHistogramLayout(
  data: SimilarityHistogramData,
  containerWidth: number,
  containerHeight: number,
  customMargin?: { top: number; right: number; bottom: number; left: number }
): HistogramChart {
  const margin = customMargin || DEFAULT_MARGIN
  const width = containerWidth - margin.left - margin.right
  const height = containerHeight - margin.top - margin.bottom

  // Extend domain to include 0 (decision boundary)
  const dataMin = data.bin_edges[0]
  const dataMax = data.bin_edges[data.bin_edges.length - 1]
  const domainMin = Math.min(dataMin, 0)
  const domainMax = Math.max(dataMax, 0)

  const xScale = scaleLinear()
    .domain([domainMin, domainMax])
    .range([0, width])

  const maxCount = max(data.counts) ?? 0
  const yScale = scaleLinear()
    .domain([0, maxCount])
    .range([height, 0])

  const totalCount = data.counts.reduce((a, b) => a + b, 0) || 1
  const bins: HistogramBin[] = data.counts.map((count, i) => ({
    x0: data.bin_edges[i],
    x1: data.bin_edges[i + 1],
    count,
    density: count / totalCount
  }))

  return { bins, xScale, yScale, width, height, margin }
}

// ============================================================================
// STACKED CATEGORY BARS
// ============================================================================

/**
 * Calculate stacked category bars per histogram bin.
 * Shows distribution of selection categories within each bin.
 */
export function calculateCategoryStackedBars(
  chart: HistogramChart,
  categoryData: Map<number, CategoryCounts>,
  categoryColors: {
    confirmed: string
    autoSelected: string
    rejected: string
    autoRejected: string
    unsure: string
  }
): CategoryBarSegment[] {
  const segments: CategoryBarSegment[] = []

  const categoryOrder: Array<'confirmed' | 'autoSelected' | 'rejected' | 'autoRejected' | 'unsure'> = [
    'confirmed', 'autoSelected', 'rejected', 'autoRejected', 'unsure'
  ]

  chart.bins.forEach((bin, binIndex) => {
    const categories = categoryData.get(binIndex)
    if (!categories) return

    const totalCount = categories.confirmed + categories.autoSelected +
      categories.rejected + categories.autoRejected + categories.unsure
    if (totalCount === 0) return

    const x = chart.xScale(bin.x0) as number
    const x1 = chart.xScale(bin.x1) as number
    const barWidth = Math.max(1, x1 - x - 1)
    const maxBarHeight = chart.height - chart.yScale(bin.count)

    let yOffset = chart.yScale(bin.count)

    categoryOrder.forEach(category => {
      const count = categories[category]
      if (count > 0) {
        const segmentHeight = (count / totalCount) * maxBarHeight

        segments.push({
          x,
          y: yOffset,
          width: barWidth,
          height: segmentHeight,
          color: categoryColors[category],
          category,
          count,
          binIndex
        })

        yOffset += segmentHeight
      }
    })
  })

  return segments
}

// ============================================================================
// AXIS TICK CALCULATIONS
// ============================================================================

export function calculateXAxisTicks(
  chart: HistogramChart,
  tickCount: number = 8
): AxisTickData[] {
  const scale = chart.xScale as ScaleLinear<number, number>
  return scale.ticks(tickCount).map(tick => ({
    value: tick,
    position: scale(tick),
    label: tick.toFixed(2)
  }))
}

export function calculateYAxisTicks(
  chart: HistogramChart,
  tickCount: number = 5
): AxisTickData[] {
  const scale = chart.yScale as ScaleLinear<number, number>
  return scale.ticks(tickCount).map(tick => ({
    value: tick,
    position: scale(tick),
    label: tick.toString()
  }))
}

export const HISTOGRAM_MARGIN = DEFAULT_MARGIN
