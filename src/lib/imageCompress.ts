// Shrink a picked image to a data URL small enough to sit in a database column.
//
// Club and team logos are stored as data: URLs on TeamRegistration.clubLogoUrl and
// RegisteredTeam.logoUrl rather than in object storage, so the size of what the
// browser produces IS the size of the row. A phone camera shot pasted in raw is
// several megabytes; this puts a ceiling on it before it ever leaves the page.
//
// Lifted verbatim from the staff registrations page, which is the code that writes
// these same two columns -- so a logo a club uploads and a logo Bo uploads for them
// come out identical. The same function is copy-pasted into five pages
// (registrations, divisions, org/assets, org/forms, org/site) with different
// dimensions and return types. Only the 512px data-URL variant lives here for now;
// consolidating the rest is worth doing when something other than a live event is
// on the line.
//
// Browser-only: it needs Image and canvas, so call it from an event handler.

/** Longest edge, in pixels, that a logo is stored at. */
export const LOGO_MAX_DIM = 512
/** Past this many characters, re-encode as JPEG rather than PNG. */
const PNG_CEILING = 200_000

/** Resize a data URL so its longest edge is at most maxDim. */
export function compressDataUrl(dataUrl: string, maxDim = LOGO_MAX_DIM): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width > maxDim || height > maxDim) {
        if (width >= height) { height = Math.round((height * maxDim) / width); width = maxDim }
        else { width = Math.round((width * maxDim) / height); height = maxDim }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('Canvas not supported')); return }
      ctx.drawImage(img, 0, 0, width, height)
      // PNG first, because a logo is usually flat color with a transparent edge and
      // JPEG puts a halo around it. JPEG only when PNG comes out too big to store.
      let url = canvas.toDataURL('image/png')
      if (url.length > PNG_CEILING) url = canvas.toDataURL('image/jpeg', 0.85)
      resolve(url)
    }
    img.onerror = () => reject(new Error('Could not read image'))
    img.src = dataUrl
  })
}

/** Read a picked File and return a resized data URL. */
export function compressImageFile(file: File, maxDim = LOGO_MAX_DIM): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) { reject(new Error('That is not an image file')); return }
    const reader = new FileReader()
    reader.onload = () => compressDataUrl(String(reader.result || ''), maxDim).then(resolve, reject)
    reader.onerror = () => reject(new Error('Could not read that file'))
    reader.readAsDataURL(file)
  })
}
