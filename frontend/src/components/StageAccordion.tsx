import { useCallback, useState } from 'react'
import { useStore } from '../store'
import type { ActiveStage } from '../types'
import type { BootstrapMode } from '../hooks/useSortableList'
import { stageToSortConfig } from '../hooks/useSortableList'
import ItemList from './ItemList'
import '../styles/StageAccordion.css'

interface Props {
  onSortChange: (sortMode: string, sortDirection: 'asc' | 'desc') => void
  hideTagged: boolean
  setHideTagged: (v: boolean) => void
}

const STAGES: { key: ActiveStage; label: string }[] = [
  { key: 'bootstrap', label: 'Bootstrap' },
  { key: 'learn', label: 'Learn' },
  { key: 'apply', label: 'Apply' },
]

export default function StageAccordion({ onSortChange, hideTagged, setHideTagged }: Props) {
  const activeStage = useStore((s) => s.activeStage)
  const setActiveStage = useStore((s) => s.setActiveStage)
  const histogramData = useStore((s) => s.histogramData)

  const [bootstrapMode, setBootstrapMode] = useState<BootstrapMode>('diversity')

  const handleStageClick = useCallback(
    (stage: ActiveStage) => {
      setActiveStage(stage)
      const config = stageToSortConfig(stage, bootstrapMode)
      onSortChange(config.sortMode, config.sortDirection)
    },
    [setActiveStage, onSortChange, bootstrapMode],
  )

  const toggleBootstrapMode = useCallback(() => {
    const next: BootstrapMode = bootstrapMode === 'diversity' ? 'byScore' : 'diversity'
    setBootstrapMode(next)
    const config = stageToSortConfig('bootstrap', next)
    onSortChange(config.sortMode, config.sortDirection)
  }, [bootstrapMode, onSortChange])

  const hasScores = histogramData !== null

  return (
    <div className="stage-accordion">
      <div className="stage-tabs">
        {STAGES.map((s) => (
          <button
            key={s.key}
            className={`stage-tab ${activeStage === s.key ? 'active' : ''}`}
            onClick={() => handleStageClick(s.key)}
            disabled={s.key !== 'bootstrap' && !hasScores}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="stage-controls">
        {activeStage === 'bootstrap' && (
          <button
            className={`bootstrap-toggle ${bootstrapMode === 'diversity' ? 'active' : ''}`}
            onClick={toggleBootstrapMode}
          >
            {bootstrapMode === 'diversity' ? 'Most Diverse' : 'By Score'}
          </button>
        )}
        <label style={{ marginLeft: 'auto' }}>
          <input
            type="checkbox"
            checked={hideTagged}
            onChange={(e) => setHideTagged(e.target.checked)}
          />
          Hide tagged
        </label>
      </div>

      <div className="item-list-container">
        <ItemList hideTagged={hideTagged} />
      </div>
    </div>
  )
}
