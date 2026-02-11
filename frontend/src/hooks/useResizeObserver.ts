import { useRef, useEffect, useState, useCallback } from 'react'

interface Size {
  width: number
  height: number
}

interface UseResizeObserverOptions {
  defaultWidth?: number
  defaultHeight?: number
  debounceMs?: number
}

interface UseResizeObserverReturn<T extends HTMLElement = HTMLElement> {
  ref: (node: T | null) => void
  size: Size
  hasMeasured: boolean
}

export const useResizeObserver = <T extends HTMLElement = HTMLElement>({
  defaultWidth = 0,
  defaultHeight = 0,
  debounceMs = 100,
}: UseResizeObserverOptions = {}): UseResizeObserverReturn<T> => {
  const [size, setSize] = useState<Size>({ width: defaultWidth, height: defaultHeight })
  const [hasMeasured, setHasMeasured] = useState(false)
  const timeoutRef = useRef<number | undefined>(undefined)
  const observerRef = useRef<ResizeObserver | null>(null)

  const callbackRef = useCallback((node: T | null) => {
    // Cleanup previous observer
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }

    if (node) {
      // Immediate measurement
      const rect = node.getBoundingClientRect()
      const newSize = {
        width: rect.width || defaultWidth,
        height: rect.height || defaultHeight
      }
      setSize(newSize)
      setHasMeasured(true)

      // Set up observer for future changes
      observerRef.current = new ResizeObserver(() => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
        }
        timeoutRef.current = window.setTimeout(() => {
          const rect = node.getBoundingClientRect()
          const newSize = {
            width: rect.width || defaultWidth,
            height: rect.height || defaultHeight
          }
          setSize(newSize)
        }, debounceMs)
      })
      observerRef.current.observe(node)
    } else {
      setHasMeasured(false)
    }
  }, [defaultWidth, defaultHeight, debounceMs])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return { ref: callbackRef, size, hasMeasured }
}
