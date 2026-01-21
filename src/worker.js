// Worker entry point for serving static assets
// The assets binding is automatically handled by Cloudflare Workers

export default {
  async fetch(request, env) {
    // Static assets are served automatically via [assets] config
    // This worker handles any custom logic if needed
    return env.ASSETS.fetch(request);
  },
};
