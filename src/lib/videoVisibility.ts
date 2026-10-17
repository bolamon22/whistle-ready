// Who may see each how-to video, as set in the Video library (lib/howToVideos howToVis).
// AppSetting `howToVisibility` holds only the changes from the defaults. Server only.
import { prisma } from '@/lib/db'
import { HOW_TO_VIDEOS, type HowToVisMap } from '@/lib/howToVideos'

const KEY = 'howToVisibility'

export async function getHowToVisibility(): Promise<HowToVisMap> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: KEY } })
    const v = row ? JSON.parse(row.value || '{}') : {}
    const out: HowToVisMap = {}
    for (const h of HOW_TO_VIDEOS) if (v?.[h.id] === 'public' || v?.[h.id] === 'members') out[h.id] = v[h.id]
    return out
  } catch { return {} }
}

export async function setHowToVisibility(id: string, vis: 'public' | 'members'): Promise<HowToVisMap> {
  const cur = await getHowToVisibility()
  cur[id] = vis
  await prisma.appSetting.upsert({ where: { key: KEY }, update: { value: JSON.stringify(cur) }, create: { key: KEY, value: JSON.stringify(cur) } })
  return cur
}
