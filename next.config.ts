import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

const localNetworkHosts = Object.values(networkInterfaces())
  .flatMap((interfaces) => interfaces ?? [])
  .filter((networkInterface) => networkInterface.family === "IPv4" && !networkInterface.internal)
  .map((networkInterface) => networkInterface.address);

const nextConfig: NextConfig = {
  allowedDevOrigins: localNetworkHosts,
};

export default nextConfig;
