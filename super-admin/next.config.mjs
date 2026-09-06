/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@shared/types', '@shared/utils'],
  experimental: {
    typedRoutes: false,
  },
  // Linting runs in dev/CI separately. The production build must not be
  // blocked by lint rules (a broken type-aware ESLint config errors here).
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
