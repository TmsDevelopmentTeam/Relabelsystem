/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  experimental: { serverActions: { bodySizeLimit: '25mb' } },
};
export default nextConfig;
