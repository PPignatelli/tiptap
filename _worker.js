export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // /c/anything → serve tip.html (keep the original URL path for JS to read)
    if (url.pathname.startsWith('/c/')) {
      const tipUrl = new URL(request.url);
      tipUrl.pathname = '/tip.html';
      return env.ASSETS.fetch(tipUrl);
    }

    // Everything else → serve normally
    return env.ASSETS.fetch(request);
  },
};
