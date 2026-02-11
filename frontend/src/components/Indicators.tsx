import { CATEGORIES, COLORS } from '../lib/constants'
import { getStripeGradient } from '../lib/color-utils'
import type { SelectionState, CommitteeVoteInfo } from '../types'

interface TagIndicatorProps {
  state?: SelectionState  // 'selected' | 'rejected' | undefined (unsure)
  isAuto: boolean         // threshold → stripe, click → solid
}

export function TagIndicator({ state, isAuto }: TagIndicatorProps) {
  if (!state) {
    return (
      <span className="tag-indicator" style={{ backgroundColor: COLORS.unsure }}>
        <span className="tag-indicator-text">{CATEGORIES.unsure}</span>
      </span>
    )
  }

  const label = state === 'selected' ? CATEGORIES.selected : CATEGORIES.rejected
  const tagColor = state === 'selected' ? COLORS.selected : COLORS.rejected

  const style: React.CSSProperties = isAuto
    ? {
        backgroundColor: COLORS.unsure,
        backgroundImage: getStripeGradient(tagColor, COLORS.unsure),
      }
    : {
        backgroundColor: tagColor,
      }

  return (
    <span className="tag-indicator" style={style}>
      <span className="tag-indicator-text">{label}</span>
    </span>
  )
}

interface DisagreementIndicatorProps {
  voteInfo: CommitteeVoteInfo | undefined
}

export function DisagreementIndicator({ voteInfo }: DisagreementIndicatorProps) {
  if (!voteInfo || voteInfo.vote_entropy === 0) return null

  return <span className="disagreement-dot" title="Committee disagreement" />
}
