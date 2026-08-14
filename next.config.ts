import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['@nhost/react-apollo', '@nhost/nextjs', '@apollo/client'],
};

export default nextConfig;
