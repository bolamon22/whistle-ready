/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client','prisma'],
    // Training videos sit outside public/ and are streamed to signed-in staff only.
    // The club director's portal tour likewise (videos/how-to, api/how-to/video).
    outputFileTracingIncludes: { '/api/training/video/[id]': ['./videos/training/**/*'], '/api/how-to/video/[id]': ['./videos/how-to/**/*', './public/how-to/*.mp4'] },
  },
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
}
