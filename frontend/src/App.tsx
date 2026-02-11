import { useEffect } from 'react'
import { useStore } from './store'
import ClassifierView from './components/ClassifierView'
import './styles/App.css'

export default function App() {
  const initialize = useStore((s) => s.initialize)
  const initialized = useStore((s) => s.initialized)
  const isLoading = useStore((s) => s.isLoading)

  useEffect(() => {
    initialize()
  }, [initialize])

  if (!initialized) {
    return (
      <div className="app">
        <div className="loading-overlay">
          {isLoading ? 'Loading data...' : 'Initializing...'}
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Code Authorship Classifier</h1>
      </header>
      <ClassifierView />
    </div>
  )
}
