/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      { source: "/v2", destination: "/", permanent: true },
      { source: "/v2/:path*", destination: "/:path*", permanent: true },
      { source: "/baralho/:id/estudar", destination: "/estudar/:id", permanent: true },
    ];
  },
};
export default nextConfig;
