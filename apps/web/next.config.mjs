/**
 * The frontend deliberately does not import the feature/plan/agent registries as
 * static modules. "What exists" for a given organisation is answered by the API at
 * runtime (`/platform/catalog`, `/me/workspace`) — the sidebar, the wizard's
 * feature list and the dashboard are all rendered from those responses. This keeps
 * the modular-platform promise honest on the client: nothing here asserts that a
 * feature, page or agent always exists.
 *
 * `@vsp/contracts` is transpiled so type-only imports of the shared response
 * shapes resolve without a separate build step.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@vsp/contracts'],
  // The API base is read at runtime on the client. Falls back to local dev.
  env: {
    NEXT_PUBLIC_API_BASE: process.env['NEXT_PUBLIC_API_BASE'] ?? 'http://localhost:4000',
  },
  async rewrites() {
    return []
  },
}

export default nextConfig
