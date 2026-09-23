import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'mymsalones\\.com\\.ar' }],
        destination: 'https://www.mymsalones.com.ar/:path*',
        permanent: true,
      },
      { source: '/salon-eventos-la-plata', destination: '/salones-de-fiestas-la-plata', permanent: true },
      { source: '/salon-15-anos-la-plata', destination: '/fiestas-de-15-la-plata', permanent: true },
      { source: '/salon-casamientos-la-plata', destination: '/casamientos-la-plata', permanent: true },
      { source: '/catering-eventos-la-plata', destination: '/catering-la-plata', permanent: true },
      { source: "/contacto", destination: "/whatsapp", permanent: true },
    ];
  },
};

export default nextConfig;
