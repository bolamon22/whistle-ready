/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client','prisma'],
    // Training videos sit outside public/ and are streamed to signed-in staff only.
    outputFileTracingIncludes: { '/api/training/video/[id]': ['./videos/training/**/*'] },
  },
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
}
