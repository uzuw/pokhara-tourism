/** @type {import('next').NextConfig} */
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const nextConfig = {
  reactStrictMode: true,
  images: {
    // We serve real photos from the Express image host; allow that origin.
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost', port: '4000' },
      { protocol: 'https', hostname: 'upload.wikimedia.org' },
    ],
  },
  // Proxy /api and /assets to the Express backend during `next dev`
  // so the browser talks to one origin (no CORS, no env config needed).
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${API_URL}/api/:path*` },
      { source: '/assets/:path*', destination: `${API_URL}/assets/:path*` },
    ];
  },
};

export default nextConfig;
