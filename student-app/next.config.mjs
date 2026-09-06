/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lint runs in dev/CI separately; don't block the production build.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
