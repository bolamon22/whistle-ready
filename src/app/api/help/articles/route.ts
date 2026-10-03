import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { articlesFor, cleanId } from '@/lib/chirp'
import { HELP_CATEGORIES } from '@/lib/helpArticles'

export const runtime = 'nodejs'

// The Guides tab in Help & support: the manual pages this person's role can use
// (View as included), the same set Chirp answers from. Served from here rather
// than bundled into the page, since the manual is now well over 100 KB.
export async function GET(req: NextRequest) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const tournamentId = cleanId(req.nextUrl.searchParams.get('tournamentId'))
  const articles = articlesFor(gate.role, tournamentId).map(({ id, title, category, keywords, body }) => ({ id, title, category, keywords, body }))
  const used = new Set(articles.map(a => a.category))
  return NextResponse.json({ articles, categories: HELP_CATEGORIES.filter(c => used.has(c)) })
}
