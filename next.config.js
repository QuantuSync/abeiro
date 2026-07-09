/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value:
              "frame-ancestors 'self' https://www.casaalaniz.es https://casaalaniz.es https://fasor.es https://www.fasor.es http://localhost:5173",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
