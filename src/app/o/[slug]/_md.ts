// Minimal, dependency-free Markdown -> HTML for org info pages.
// Supports: # ## ### headings, **bold**, *italic*, [text](url), - / * bullet lists,
// 1. numbered lists, --- horizontal rule, and paragraphs. Output is escaped first,
// so author content cannot inject markup.
function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function inline(s: string) {
  let t = esc(s)
  t = t.replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:|tel:|\/)[^\s)]+)\)/g, (_m: string, label: string, href: string) => {
    const ext = /^https?:\/\//.test(href)
    return `<a href="${href}"${ext ? ' target="_blank" rel="noreferrer"' : ''} class="text-teal-700 underline underline-offset-2 hover:text-teal-900">${label}</a>`
  })
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-slate-900">$1</strong>')
  t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  return t
}
export function mdToHtml(src: string): string {
  const lines = (src || '').replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let i = 0
  let para: string[] = []
  const flushPara = () => {
    if (para.length) { out.push(`<p class="text-slate-600 leading-relaxed mb-4">${para.map(inline).join('<br />')}</p>`); para = [] }
  }
  while (i < lines.length) {
    const line = lines[i]
    const t = line.trim()
    if (t === '') { flushPara(); i++; continue }
    if (/^---+$/.test(t)) { flushPara(); out.push('<hr class="my-8 border-slate-200" />'); i++; continue }
    const h = t.match(/^(#{1,3})\s+(.*)$/)
    if (h) {
      flushPara()
      const lvl = h[1].length
      const cls = lvl === 1 ? 'text-2xl font-extrabold tracking-tight text-slate-900 mt-8 mb-3'
        : lvl === 2 ? 'text-xl font-bold text-slate-900 mt-7 mb-2'
        : 'text-lg font-semibold text-slate-900 mt-6 mb-2'
      out.push(`<h${lvl + 1} class="${cls}">${inline(h[2])}</h${lvl + 1}>`)
      i++; continue
    }
    // A line that is only a link becomes a pill button (same style as the event
    // pages' Book-hotels button); a > line becomes a callout box. Both are driven
    // by how the line is written, so authors get them with no new editor fields.
    const btn = t.match(/^\[([^\]]+)\]\(((?:https?:\/\/|mailto:|tel:|\/)[^\s)]+)\)$/)
    if (btn) {
      flushPara()
      const ext = /^https?:\/\//.test(btn[2])
      out.push(`<a href="${btn[2]}"${ext ? ' target="_blank" rel="noreferrer"' : ''} class="inline-flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold px-5 py-2.5 rounded-full mb-4 no-underline">${inline(btn[1])}</a>`)
      i++; continue
    }
    if (/^>\s?/.test(t)) {
      flushPara(); const buf: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) { buf.push(lines[i].trim().replace(/^>\s?/, '')); i++ }
      out.push(`<div class="rounded-xl border border-teal-200 bg-teal-50 px-5 py-4 mb-5 text-slate-700 leading-relaxed">${buf.map(inline).join('<br />')}</div>`)
      continue
    }
    if (/^[-*]\s+/.test(t)) {
      flushPara(); const items: string[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) { items.push(`<li class="mb-1">${inline(lines[i].trim().replace(/^[-*]\s+/, ''))}</li>`); i++ }
      out.push(`<ul class="list-disc pl-6 mb-4 text-slate-600 leading-relaxed">${items.join('')}</ul>`); continue
    }
    if (/^\d+\.\s+/.test(t)) {
      flushPara(); const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) { items.push(`<li class="mb-1">${inline(lines[i].trim().replace(/^\d+\.\s+/, ''))}</li>`); i++ }
      out.push(`<ol class="list-decimal pl-6 mb-4 text-slate-600 leading-relaxed">${items.join('')}</ol>`); continue
    }
    para.push(t); i++
  }
  flushPara()
  return out.join('\n')
}
