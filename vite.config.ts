// The shared Vite config below already includes the following — do NOT add them
// manually or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Deploy target. Nitro defaults to `cloudflare-module`, which emits a Workers
  // bundle (wrangler.json) that Vercel cannot serve -- SSR and deep-route
  // refresh would fail. We deploy to Vercel, so pin the preset.
  nitro: { preset: "vercel" },
});
