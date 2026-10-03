// Chirp's replies are markdown (bold, numbered steps, links). Email clients
// ignore CSS classes and most of them strip <style>, so this turns that small
// markdown into HTML with inline styles only. Text is escaped first, so a reply
// can't inject markup. Relative links become absolute on `base`.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function inline(s: string, base: string): string {
  let t = esc(s)
  t = t.replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:|\/)[^\s)]+)\)/g, (_m, label: string, href: string) => {
    const abs = href.startsWith('/') ? base + href : href
    return `<a href="${abs}" style="color:#0f766e;text-decoration:underline">${label}</a>`
  })
  t = t.replace(/\*\*([^*]+)\*\*/g, '<b style="color:#0f172a">$1</b>')
  t = t.replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
  return t
}

export function mdToEmailHtml(src: string, base: string): string {
  const lines = (src || '').replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let para: string[] = []
  const flush = () => { if (para.length) { out.push(`<p style="margin:0 0 10px;line-height:1.55">${para.map(l => inline(l, base)).join('<br>')}</p>`); para = [] } }
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    if (!t) { flush(); continue }
    const ol = /^\d+[.)]\s+/, ul = /^[-*•]\s+/
    if (ol.test(t) || ul.test(t)) {
      flush()
      const ordered = ol.test(t), re = ordered ? ol : ul
      const items: string[] = []
      // Chirp often leaves a blank line between steps; keep them in one list.
      while (i < lines.length) {
        const l = lines[i].trim()
        if (re.test(l)) { items.push(`<li style="margin:0 0 6px;line-height:1.5">${inline(l.replace(re, ''), base)}</li>`); i++; continue }
        if (!l && i + 1 < lines.length && re.test(lines[i + 1].trim())) { i++; continue }
        break
      }
      i--
      const tag = ordered ? 'ol' : 'ul'
      out.push(`<${tag} style="margin:0 0 10px;padding-left:22px">${items.join('')}</${tag}>`)
      continue
    }
    para.push(t.replace(/^#+\s*/, ''))
  }
  flush()
  return out.join('')
}
