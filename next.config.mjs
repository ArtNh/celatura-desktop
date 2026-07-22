/** @type {import('next').NextConfig} */
const nextConfig = {
  // 必须配置静态导出，满足 Tauri 2.0 载入本地 HTML/JS 产物的要求
  output: 'export',
  
  // 禁用 Next.js 默认的服务端图片优化，适配本地静态环境
  images: {
    unoptimized: true,
  },
  
  // 补齐 URL 尾部斜杠，提升静态资源索引稳定性
  trailingSlash: true,
  
  // 严格模式
  reactStrictMode: true,

  // SWC 编译器选项
  swcMinify: true,
};

export default nextConfig;
