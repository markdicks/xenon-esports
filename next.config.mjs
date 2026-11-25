/** @type {import('next').NextConfig} */
const nextConfig = {
  agentRules: false,
  async headers() {
    return ["/brackets/:path*", "/api/brackets/:path*"].map((source) => ({ source, headers: [
      { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }, { key: "Referrer-Policy", value: "no-referrer" },
    ] }));
  },
};

export default nextConfig;
