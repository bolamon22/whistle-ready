// Server-only helper: fetch recent media via the Instagram API with Instagram Login
// (graph.instagram.com). The access token is read server-side and never sent to the client.
export type IgItem = { id: string; permalink: string; image: string; caption: string }

export async function fetchInstagram(token: string, limit = 8): Promise<IgItem[]> {
  if (!token) return []
  try {
    const fields = 'id,caption,media_type,media_url,permalink,thumbnail_url'
    const url = `https://graph.instagram.com/me/media?fields=${fields}&limit=${limit}&access_token=${encodeURIComponent(token)}`
    const res = await fetch(url, { next: { revalidate: 1800 } })
    if (!res.ok) return []
    const data = await res.json()
    const items = Array.isArray(data?.data) ? data.data : []
    return items
      .map((m: any) => ({
        id: m.id,
        permalink: m.permalink,
        image: m.media_type === 'VIDEO' ? (m.thumbnail_url || m.media_url) : m.media_url,
        caption: m.caption || '',
      }))
      .filter((x: IgItem) => x.image)
  } catch {
    return []
  }
}
