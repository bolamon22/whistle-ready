import { prisma } from '@/lib/db'
import { geocodeAddress, type GeoPoint, type GeoStore } from '@/lib/geocode'

// Looked-up addresses, kept in AppSetting under geocode:<address> (lib/geocode),
// so each one goes to the Census Bureau once. Server only.

const store: GeoStore = {
  async get(key) {
    const row = await prisma.appSetting.findUnique({ where: { key } }).catch(() => null)
    return row?.value ?? null
  },
  async set(key, value) {
    await prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } })
  },
}

export function geocodeCached(address: string, opts: { timeoutMs?: number } = {}): Promise<GeoPoint | null> {
  return geocodeAddress(address, store, opts)
}
