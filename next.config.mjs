/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  // 禁用 SWC 压缩可能导致的问题或定制 assetPrefix（如需）
  trailingSlash: true,
};

export default nextConfig;
