export type RuleSet = { id: string; name: string; format?: string; body: string; updatedAt?: string }

// An event's effective rules: a linked library set (live) wins; otherwise its own
// custom/legacy text. Detached events (no rulesSourceId) use content.rules.
export function resolveRules(content: any, sets: RuleSet[]): { body: string; sourceName?: string; sourceId?: string } {
  const sid = content?.rulesSourceId
  if (sid) {
    const s = (sets || []).find(x => x.id === sid)
    if (s) return { body: s.body || '', sourceName: s.name, sourceId: sid }
  }
  return { body: content?.rules || '' }
}

export function uidRule(): string { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36) }
