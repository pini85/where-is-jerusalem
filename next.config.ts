import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully client-side app — static export, deployed as plain files on Netlify
  output: "export",
};

export default nextConfig;
