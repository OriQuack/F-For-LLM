import { useMemo, useEffect, useRef } from 'react'
import { useStore } from '../store'
import type { ActiveStage } from '../types'
import ItemList from './ItemList'
import '../styles/StageAccordion.css'

const STAGES: { key: ActiveStage; label: string; number: number; sortLabel: string; tooltip: string }[] = [
  { key: 'bootstrap', label: 'Prototype', number: 1, sortLabel: 'Most Diverse First', tooltip: 'Tag a few diverse blocks to start.' },
  { key: 'learn', label: 'Uncertainty', number: 2, sortLabel: 'Most Uncertain First', tooltip: 'Tag the blocks the model is least sure about.' },
  { key: 'apply', label: 'Disagreement', number: 3, sortLabel: 'Least Confident First', tooltip: 'Auto-tag confident blocks; review the rest.' },
]

export default function StageAccordion() {
  const activeStage = useStore((s) => s.activeStage)
  const setActiveStage = useStore((s) => s.setActiveStage)
  const histogramData = useStore((s) => s.histogramData)
  const hideTagged = useStore((s) => s.hideTagged)
  const setHideTagged = useStore((s) => s.setHideTagged)
  const showDisagreementOnly = useStore((s) => s.showDisagreementOnly)
  const setShowDisagreementOnly = useStore((s) => s.setShowDisagreementOnly)
  const committeeVotes = useStore((s) => s.committeeVotes)

  const blocks = useStore((s) => s.blocks)
  const selectionStates = useStore((s) => s.blockSelectionStates)
  const similarityScores = useStore((s) => s.similarityScores)
  const diversityIds = useStore((s) => s.diversityIds)
  const selectThreshold = useStore((s) => s.selectThreshold)
  const rejectThreshold = useStore((s) => s.rejectThreshold)
  const enabledFeatures = useStore((s) => s.enabledFeatures)
  const initialized = useStore((s) => s.initialized)
  const refetchColdStart = useStore((s) => s.refetchColdStart)

  const lastColdStartSigRef = useRef<string | null>(null)
  useEffect(() => {
    if (!initialized) return
    if (activeStage !== 'bootstrap') return
    const sig = [...enabledFeatures].sort().join('|')
    if (lastColdStartSigRef.current === null) {
      lastColdStartSigRef.current = sig
      return
    }
    if (lastColdStartSigRef.current === sig) return
    const id = setTimeout(() => {
      lastColdStartSigRef.current = sig
      refetchColdStart()
    }, 300)
    return () => clearTimeout(id)
  }, [enabledFeatures, activeStage, initialized, refetchColdStart])

  const hasScores = histogramData !== null
  const currentStage = STAGES.find((s) => s.key === activeStage)!

  const filteredCount = useMemo(() => {
    return useStore.getState().getFilteredBlocks().length
  }, [blocks, activeStage, diversityIds, similarityScores, selectionStates, selectThreshold, rejectThreshold, hideTagged, showDisagreementOnly, committeeVotes])

  return (
    <div className="stage-selector">
      {/* Row 1: Notebook-style stage tabs */}
      <div className="stage-selector__tabs">
        {STAGES.map((s) => {
          const active = activeStage === s.key
          const disabled = s.key !== 'bootstrap' && !hasScores
          return (
            <button
              key={s.key}
              className={`stage-selector__tab ${active ? 'stage-selector__tab--active' : ''} ${disabled ? 'stage-selector__tab--disabled' : ''}`}
              onClick={() => setActiveStage(s.key)}
              disabled={disabled}
              data-tooltip-title={`${s.number}. ${s.label}`}
              data-tooltip={s.tooltip}
            >
              <span className="stage-selector__number">{s.number}</span>
              <span className="stage-selector__label">{s.label}</span>
            </button>
          )
        })}
      </div>

      {/* Row 2: Sort order indicator (read-only) */}
      <div className="stage-selector__sort-indicator">
        <span className="stage-selector__sort-label">{currentStage.sortLabel} ({filteredCount} blocks)</span>
      </div>

      {/* Row 3: Checkboxes */}
      <div className="stage-selector__checkboxes">
        <label className="stage-selector__checkbox-label">
          <input
            type="checkbox"
            checked={hideTagged}
            onChange={(e) => setHideTagged(e.target.checked)}
          />
          Hide tagged
        </label>
        {activeStage === 'apply' && committeeVotes.size > 0 && (
          <label
              className="stage-selector__checkbox-label"
              data-tooltip-title="Disagreement only"
              data-tooltip="Show only blocks the auxiliary classifiers disagree on."
            >
              <input
                type="checkbox"
                checked={showDisagreementOnly}
                onChange={(e) => setShowDisagreementOnly(e.target.checked)}
              />
              <span className="stage-selector__legend-text">Disagreement only</span>
            </label>
        )}
      </div>

      {/* Item list */}
      <div className="stage-selector__list">
        <ItemList />
      </div>
    </div>
  )
}
