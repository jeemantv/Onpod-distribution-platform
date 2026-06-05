/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // archiver (+ its zip-stream/compress-commons deps) use dynamic requires
    // that Next's bundler can mangle. Keep it as a runtime node_modules
    // require so the streaming zip route works in production.
    serverComponentsExternalPackages: ["archiver", "@napi-rs/canvas"],
  },
};

export default nextConfig;
