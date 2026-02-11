import { useCallback } from 'react'
import { useStore } from '../store'
import type { Commit } from '../types'

export function useCommitHistory() {
  const commits = useStore((s) => s.commits)
  const activeCommitId = useStore((s) => s.activeCommitId)
  const restoreCommit = useStore((s) => s.restoreCommit)

  const handleCommitClick = useCallback(
    (commitId: number) => {
      restoreCommit(commitId)
    },
    [restoreCommit],
  )

  // Filter out initial commit (id=0) for display
  const displayCommits = commits.filter((c) => c.id > 0)

  return {
    commits: displayCommits,
    activeCommitId,
    handleCommitClick,
    totalCommits: displayCommits.length,
  }
}

export function isUserConfirmed(commit: Commit): boolean {
  return commit.type === 'manual' || commit.type === 'threshold'
}
