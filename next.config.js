/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Linting runs as its own gate in CI (`npm run lint`), so we don't also run
    // it during `next build` — that keeps builds fast and avoids duplicate work.
    ignoreDuringBuilds: true,
  },
}

module.exports = nextConfig
