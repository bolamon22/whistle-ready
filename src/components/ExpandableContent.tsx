'use client'
import { useState, useRef, useEffect } from 'react'

// Clamps rendered HTML to a few lines with a "Show more" toggle.
export default function ExpandableContent({ html, collapsedHeight = 116 }: { html: string; collapsedHeight?: number }) {
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) setOverflows(ref.current.scrollHeight > collapsedHeight + 24)
  }, [html, collapsedHeight])
  return (
    <div>
      <div ref={ref} className="prose-body relative overflow-hidden" style={{ maxHeight: expanded ? undefined : collapsedHeight }}>
        <div dangerouslySetInnerHTML={{ __html: html }} />
        {!expanded && overflows && <div className="absolute inset-x-0 bottom-0 h-12" style={{ background: 'linear-gradient(to bottom, transparent, #f8fafc)' }} aria-hidden="true" />}
      </div>
      {overflows && (
        <button type="button" onClick={() => setExpanded(e => !e)} className="mt-2 text-sm font-semibold text-teal-700 hover:text-teal-900">
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}
