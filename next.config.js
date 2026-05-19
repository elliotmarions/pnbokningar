/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['twilio'],
  eslint: { ignoreDuringBuilds: true },
}

module.exports = nextConfig
