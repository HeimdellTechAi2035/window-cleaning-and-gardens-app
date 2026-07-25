// Netlify sets COMMIT_REF to the deployed commit's SHA at build time. Baking
// it into the client bundle (and serving it fresh, uncached, from an API
// route) lets a long-lived open tab detect it's running an old build once a
// newer one has deployed — see components/layout/update-available-banner.tsx.
const buildId = process.env.COMMIT_REF ?? String(Date.now());

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "**.amazonaws.com" },
      { protocol: "https", hostname: "res.cloudinary.com" },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
