import { useEffect, useState, useMemo } from 'react'
import { useStore } from '../store'
import '../styles/MetricsPanel.css'

export default function MetricsPanel() {
  const currentBlockId = useStore((s) => s.currentBlockId)
  const metricColumns = useStore((s) => s.metricColumns)
  const [metrics, setMetrics] = useState<Record<string, number>>({})

  useEffect(() => {
    if (currentBlockId === null || metricColumns.length === 0) {
      setMetrics({})
      return
    }
    // Fetch metrics inline (we already have them in store via blocks, but metrics are separate)
    // For now fetch from API
    fetch(`/api/blocks`)
      .then((r) => r.json())
      .then(() => {
        // Metrics are loaded server-side; for display we use similarity scores if available
        // This is a simplified panel — real metrics would come from a dedicated endpoint
        setMetrics({})
      })
      .catch(() => setMetrics({}))
  }, [currentBlockId, metricColumns])

  const score = useStore((s) =>
    currentBlockId !== null ? s.similarityScores.get(currentBlockId) : undefined,
  )

  const displayMetrics = useMemo(() => {
    const items: { label: string; value: number }[] = []
    if (score !== undefined) {
      items.push({ label: 'SVM Score', value: score })
    }
    for (const [k, v] of Object.entries(metrics)) {
      items.push({ label: k, value: v })
    }
    return items
  }, [score, metrics])

  if (currentBlockId === null) return null

  return (
    <div className="metrics-panel">
      <h3>Metrics</h3>
      {displayMetrics.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
          Tag 3+ Human and 3+ LLM blocks to see SVM scores
        </div>
      ) : (
        displayMetrics.map((m) => (
          <div key={m.label} className="metric-row">
            <span className="metric-label">{m.label}</span>
            <div className="metric-bar-bg">
              <div
                className="metric-bar-fill"
                style={{ width: `${Math.max(0, Math.min(100, (m.value + 2) * 25))}%` }}
              />
            </div>
            <span className="metric-value">{m.value.toFixed(3)}</span>
          </div>
        ))
      )}
    </div>
  )
}
