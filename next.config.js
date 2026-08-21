/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  reactStrictMode: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
