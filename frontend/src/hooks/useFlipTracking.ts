import { useStore } from '../store'

export function useFlipTracking() {
  const flipHistory = useStore((s) => s.flipHistory)
  const totalIterations = useStore((s) => s.totalIterations)
  const flippedBins = useStore((s) => s.flippedBins)

  const latestFlipRate = flipHistory.length > 0 ? flipHistory[flipHistory.length - 1].flipRate : 0
  const isConverging = flipHistory.length >= 3 && latestFlipRate < 0.1

  return {
    flipHistory,
    totalIterations,
    flippedBins,
    latestFlipRate,
    isConverging,
  }
}
