import { useEffect, useState, useMemo } from 'react'
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
  const removeBlockSelection = useStore((s) => s.removeBlockSelection)
  const labelBlock = useStore((s) => s.labelBlock)
  const selectNextUntagged = useStore((s) => s.selectNextUntagged)

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
          className={`btn-llm ${currentState === 'rejected' ? 'active' : ''}`}
          onClick={() => currentBlockId !== null && labelBlock(currentBlockId, 'rejected')}
        >
          LLM
        </button>
        <button
          className={`btn-unsure ${currentState === undefined ? 'active' : ''}`}
          onClick={() => {
            if (currentBlockId !== null) {
              removeBlockSelection(currentBlockId)
              selectNextUntagged()
            }
          }}
        >
          Unsure
        </button>
        <button
          className={`btn-human ${currentState === 'selected' ? 'active' : ''}`}
          onClick={() => currentBlockId !== null && labelBlock(currentBlockId, 'selected')}
        >
          Human
        </button>
      </div>
    </div>
  )
}
