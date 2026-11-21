import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "imapflow",
    "mailparser",
    "unpdf",
    "bullmq",
    "ioredis",
    "postgres",
    "pino",
  ],
};

export default nextConfig;
