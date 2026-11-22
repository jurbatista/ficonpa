import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
