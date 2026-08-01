/**
 * The frontend deliberately does not import the feature/plan/agent registries as
 * static modules. "What exists" for a given organisation is answered by the API at
 * runtime (`/platform/catalog`, `/me/workspace`) — the sidebar, the wizard's
 * feature list and the dashboard are all rendered from those responses. This keeps
 * the modular-platform promise honest on the client: nothing here asserts that a
 * feature, page or agent always exists.
 *
 * The app is self-contained — it has no `@vsp/*` workspace imports — so it builds
 * standalone on Vercel without needing the rest of the monorepo resolved.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Linting is a dedicated CI step (`eslint src`), so `next build` should not run
  // its own ESLint pass — it would try to use Next's integration (which expects
  // eslint-config-next) and can fail the build over lint, which is not the build's
  // job. This does not disable linting; it just keeps it out of the build.
  eslint: { ignoreDuringBuilds: true },
  // The backend API base URL. Read at build time (NEXT_PUBLIC_* is inlined) and
  // falls back to local dev when unset — so `pnpm dev` needs no configuration and
  // production/preview are driven entirely by the Vercel environment variable.
  env: {
    NEXT_PUBLIC_API_URL: process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000',
  },
}

export default nextConfig
