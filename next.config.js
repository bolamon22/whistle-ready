/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    // ffmpeg-static must stay external: bundled, its binary path points inside .next and spawn fails (ENOENT).
    serverComponentsExternalPackages: ['@prisma/client','prisma','ffmpeg-static'],
    // Training videos sit outside public/ and are streamed to signed-in staff only.
    // The club director's portal tour likewise (videos/how-to, api/how-to/video).
    outputFileTracingIncludes: { '/api/training/video/[id]': ['./videos/training/**/*'], '/api/how-to/video/[id]': ['./videos/how-to/**/*', './public/how-to/*.mp4'], '/api/social/normalize-video': ['./node_modules/ffmpeg-static/ffmpeg'] },
  },
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
}
