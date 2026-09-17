// Single place every Apple Wallet pass is built.
//
// Routes must NEVER import passkit-generator directly — they call buildApplePass().
// Same reasoning as src/lib/email.ts: one seam, one place the signing material is
// read, and one place Google Wallet slots in later without touching six routes.
//
// LIKE sendEmail(), THIS NEVER THROWS. It returns {ok,error}. A credential page
// must keep rendering when the certificate has expired or an env var is missing —
// the printed card and the verify page are the things that actually matter on
// game day, and a wallet pass is a convenience on top of them.
//
// Env (all absent = feature simply off, walletEnabled() returns false):
//   APPLE_PASS_TYPE_ID        — e.g. pass.app.whistleready.credential
//   APPLE_TEAM_ID             — the 10-character Apple team identifier
//   APPLE_PASS_CERT_PEM       — base64 of the pass signing CERTIFICATE, PEM
//   APPLE_PASS_KEY_PEM        — base64 of its PRIVATE KEY, PEM
//   APPLE_PASS_KEY_PASSPHRASE — only if the key is encrypted
//   APPLE_WWDR_PEM            — base64 of Apple's WWDR G4 intermediate, PEM
//
// WHY BASE64: a PEM is multi-line, and multi-line values get mangled going through
// dashboards, shells and .env files in ways that produce a signature failure with
// no useful error. One line in, decoded here.
import { PKPass } from 'passkit-generator'
import { ROLES, type CredentialRole } from './credentialCard'

const env = (k: string) => String(process.env[k] || '').trim()

/** Decode a base64 env var to PEM text. Tolerates a raw PEM pasted directly. */
function pem(k: string): string {
  const raw = env(k)
  if (!raw) return ''
  if (raw.includes('-----BEGIN')) return raw
  try {
    const out = Buffer.from(raw, 'base64').toString('utf8')
    return out.includes('-----BEGIN') ? out : ''
  } catch { return '' }
}

/** True when a pass can actually be signed. Use to hide the button. */
export function walletEnabled(): boolean {
  return !!(env('APPLE_PASS_TYPE_ID') && env('APPLE_TEAM_ID') &&
            pem('APPLE_PASS_CERT_PEM') && pem('APPLE_PASS_KEY_PEM') && pem('APPLE_WWDR_PEM'))
}

export type PassField = { key: string; label?: string; value: string }

export type WalletPassInput = {
  role: CredentialRole
  /** Stable per person per pass type — Apple replaces a pass with the same serial. */
  serialNumber: string
  /** Shown in the pass list and read aloud by VoiceOver. Required by Apple. */
  description: string
  orgName: string
  /** Small text beside the logo. Keep it short or it truncates. */
  logoText?: string
  headerFields?: PassField[]
  primaryFields?: PassField[]
  secondaryFields?: PassField[]
  auxiliaryFields?: PassField[]
  backFields?: PassField[]
  /** Encoded into the QR. Ours is always a public /verify URL. */
  barcodeMessage: string
  /** Square PNG for the pass icon and logo. The org logo, when we have one. */
  logoPng?: Buffer | null
  /** The person's photo, square PNG. Appears as the thumbnail. */
  thumbnailPng?: Buffer | null
  /** Up to 10. Wallet surfaces the pass on the lock screen near these. */
  locations?: { latitude: number; longitude: number; relevantText?: string }[]
  relevantDate?: Date | null
  expirationDate?: Date | null
}

export type BuildResult = { ok: true; buffer: Buffer } | { ok: false; error: string }

/**
 * A solid PNG of a given size, built by hand.
 *
 * Apple rejects a pass with no icon.png, so there has to be SOMETHING even for an
 * org that has never uploaded a logo. Hand-rolled rather than pulling in an image
 * library for one coloured square: zlib is in node, and this is about thirty lines
 * against a megabyte of dependency.
 */
function solidPng(size: number, hex: string): Buffer {
  const zlib = require('zlib') as typeof import('zlib')
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
  // Raw scanlines: one filter byte (0 = none) then RGBA per pixel.
  const row = Buffer.concat([Buffer.from([0]), Buffer.concat(Array(size).fill(Buffer.from([r, g, b, 255])))])
  const raw = Buffer.concat(Array(size).fill(row))

  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0)
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8    // bit depth
  ihdr[9] = 6    // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

let CRC_TABLE: number[] | null = null
function crc32(buf: Buffer): number {
  if (!CRC_TABLE) {
    CRC_TABLE = []
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      CRC_TABLE[n] = c
    }
  }
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return c ^ 0xffffffff
}

/** Decode a data: URL to a PNG buffer. Remote URLs are not fetched — see below. */
export function pngFromDataUrl(url: string | null | undefined): Buffer | null {
  const s = String(url || '')
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(s)
  if (!m) return null
  try { return Buffer.from(m[2], 'base64') } catch { return null }
}

/**
 * Build a signed .pkpass.
 *
 * Returns a result rather than throwing, and every image is optional: a pass with
 * a plain coloured icon still scans, and scanning is the job.
 */
export async function buildApplePass(input: WalletPassInput): Promise<BuildResult> {
  if (!walletEnabled()) return { ok: false, error: 'Apple Wallet is not configured' }

  try {
    const theme = ROLES[input.role] || ROLES.staff
    const icon = input.logoPng || solidPng(58, theme.band)

    const pass = new PKPass(
      {
        // @1x and @2x from the same bytes: Wallet scales, and shipping one square
        // asset beats shipping none while we wait on exact-size artwork.
        'icon.png': icon,
        'icon@2x.png': icon,
        'logo.png': icon,
        'logo@2x.png': icon,
        ...(input.thumbnailPng ? { 'thumbnail.png': input.thumbnailPng, 'thumbnail@2x.png': input.thumbnailPng } : {}),
      },
      {
        wwdr: pem('APPLE_WWDR_PEM'),
        signerCert: pem('APPLE_PASS_CERT_PEM'),
        signerKey: pem('APPLE_PASS_KEY_PEM'),
        ...(env('APPLE_PASS_KEY_PASSPHRASE') ? { signerKeyPassphrase: env('APPLE_PASS_KEY_PASSPHRASE') } : {}),
      },
      {
        serialNumber: input.serialNumber,
        description: input.description,
        organizationName: input.orgName,
        passTypeIdentifier: env('APPLE_PASS_TYPE_ID'),
        teamIdentifier: env('APPLE_TEAM_ID'),
        ...(input.logoText ? { logoText: input.logoText } : {}),
        backgroundColor: hexToRgbCss(theme.band),
        foregroundColor: 'rgb(255, 255, 255)',
        labelColor: hexToRgbCss(theme.ink),
      },
    )

    // `generic` rather than `eventTicket`: these are identity documents that
    // outlive any one weekend. An eventTicket wants a single event and drops off
    // the lock screen once it passes.
    pass.type = 'generic'

    for (const f of input.headerFields || []) pass.headerFields.push(f)
    for (const f of input.primaryFields || []) pass.primaryFields.push(f)
    for (const f of input.secondaryFields || []) pass.secondaryFields.push(f)
    for (const f of input.auxiliaryFields || []) pass.auxiliaryFields.push(f)
    for (const f of input.backFields || []) pass.backFields.push(f)

    // iso-8859-1 is what Apple's own examples use and what every scanner expects.
    pass.setBarcodes({
      format: 'PKBarcodeFormatQR',
      message: input.barcodeMessage,
      messageEncoding: 'iso-8859-1',
    })

    // THE REASON TO DO THIS AT ALL: with venue coordinates on the pass, Wallet
    // puts the credential on the lock screen when someone pulls into the complex
    // on Saturday morning. Apple caps it at 10.
    if (input.locations?.length) pass.setLocations(...input.locations.slice(0, 10))
    if (input.relevantDate) pass.setRelevantDate(input.relevantDate)
    if (input.expirationDate) pass.setExpirationDate(input.expirationDate)

    return { ok: true, buffer: pass.getAsBuffer() }
  } catch (e: any) {
    // Logged, not thrown. The caller turns this into a 503 and the page survives.
    console.error('[wallet] pass build failed:', e?.message || e)
    return { ok: false, error: e?.message || 'Could not build the pass' }
  }
}

/** Apple wants rgb() strings, not hex. */
function hexToRgbCss(hex: string): string {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

export const WALLET_MIME = 'application/vnd.apple.pkpass'
