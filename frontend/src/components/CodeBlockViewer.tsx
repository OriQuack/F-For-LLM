import { useEffect, useState, useCallback, useMemo } from 'react'
import { useStore } from '../store'
import { fetchBlockCode } from '../api'
import Prism from 'prismjs'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-rust'
import 'prismjs/components/prism-go'
import '../styles/CodeBlockViewer.css'

const LANG_MAP: Record<string, string> = {
  python: 'python',
  javascript: 'javascript',
  typescript: 'typescript',
  rust: 'rust',
  go: 'go',
}

export default function CodeBlockViewer() {
  const currentBlockId = useStore((s) => s.currentBlockId)
  const blocks = useStore((s) => s.blocks)
  const selectionStates = useStore((s) => s.blockSelectionStates)
  const setBlockSelection = useStore((s) => s.setBlockSelection)
  const removeBlockSelection = useStore((s) => s.removeBlockSelection)
  const fetchHistogram = useStore((s) => s.fetchHistogram)

  const [code, setCode] = useState<string>('')
  const [loading, setLoading] = useState(false)

  const block = useMemo(
    () => blocks.find((b) => b.block_id === currentBlockId) ?? null,
    [blocks, currentBlockId],
  )

  useEffect(() => {
    if (currentBlockId === null) {
      setCode('')
      return
    }
    setLoading(true)
    fetchBlockCode(currentBlockId)
      .then(setCode)
      .catch(() => setCode('// Failed to load code'))
      .finally(() => setLoading(false))
  }, [currentBlockId])

  const highlightedHtml = useMemo(() => {
    if (!code || !block) return ''
    const grammar = Prism.languages[LANG_MAP[block.language] ?? 'javascript']
    if (!grammar) return code
    return Prism.highlight(code, grammar, block.language)
  }, [code, block])

  const linesHtml = useMemo(() => {
    if (!highlightedHtml || !block) return ''
    const lines = highlightedHtml.split('\n')
    return lines
      .map(
        (line, i) =>
          `<span class="line-number">${block.start_line + i}</span>${line}`,
      )
      .join('\n')
  }, [highlightedHtml, block])

  const currentState = currentBlockId !== null ? selectionStates.get(currentBlockId) : undefined

  const handleTag = useCallback(
    (state: 'selected' | 'rejected') => {
      if (currentBlockId === null) return
      if (currentState === state) {
        removeBlockSelection(currentBlockId)
      } else {
        setBlockSelection(currentBlockId, state, 'click')
      }
      // Auto-advance to next untagged block
      const idx = blocks.findIndex((b) => b.block_id === currentBlockId)
      for (let i = 1; i < blocks.length; i++) {
        const next = blocks[(idx + i) % blocks.length]
        if (!selectionStates.has(next.block_id)) {
          useStore.getState().setCurrentBlock(next.block_id)
          break
        }
      }
      // Trigger histogram update
      fetchHistogram()
    },
    [currentBlockId, currentState, blocks, selectionStates, setBlockSelection, removeBlockSelection, fetchHistogram],
  )

  if (!block) {
    return <div className="code-viewer"><div className="code-viewer-empty">Select a block to view</div></div>
  }

  return (
    <div className="code-viewer">
      <div className="code-viewer-header">
        <span className="file-path">{block.file_path}</span>
        <span className="lang-badge">{block.language}</span>
        <span className="line-range">L{block.start_line}-{block.end_line}</span>
        <span style={{ marginLeft: 'auto', fontWeight: 600, fontSize: 12 }}>{block.block_name}</span>
      </div>

      <div className="code-viewer-body">
        {loading ? (
          <pre style={{ color: '#666' }}>Loading...</pre>
        ) : (
          <pre dangerouslySetInnerHTML={{ __html: linesHtml }} />
        )}
      </div>

      <div className="code-viewer-actions">
        <button
          className={`btn-human ${currentState === 'selected' ? '' : ''}`}
          onClick={() => handleTag('selected')}
          style={{ opacity: currentState === 'selected' ? 1 : 0.7 }}
        >
          {currentState === 'selected' ? 'Human (tagged)' : 'Human'}
        </button>
        <button
          className="btn-unsure"
          onClick={() => {
            if (currentBlockId !== null) removeBlockSelection(currentBlockId)
          }}
          style={{ opacity: currentState === undefined ? 1 : 0.7 }}
        >
          Unsure
        </button>
        <button
          className={`btn-llm ${currentState === 'rejected' ? '' : ''}`}
          onClick={() => handleTag('rejected')}
          style={{ opacity: currentState === 'rejected' ? 1 : 0.7 }}
        >
          {currentState === 'rejected' ? 'LLM (tagged)' : 'LLM'}
        </button>
      </div>
    </div>
  )
}
