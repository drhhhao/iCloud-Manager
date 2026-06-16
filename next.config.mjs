/** @type {import('next').NextConfig} */
const nextConfig = {
  // Export a fully static SPA into `out/` so the Python backend can serve
  // both the frontend and the /api/* routes from a single process/port.
  output: "export",
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
