export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // /c/anything → serve tip.html content but keep /c/slug URL
    if (url.pathname.startsWith('/c/') && url.pathname.length > 3) {
      // Fetch tip.html from assets
      const assetUrl = new URL(request.url);
      assetUrl.pathname = '/tip.html';
      const resp = await env.ASSETS.fetch(assetUrl.toString());
      // Return with original URL's context (200, same headers)
      return new Response(resp.body, {
        status: 200,
        headers: resp.headers,
      });
    }

    return env.ASSETS.fetch(request);
  },
};
