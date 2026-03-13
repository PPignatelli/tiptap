export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // /c/anything → serve tip.html (keep the URL as-is)
    if (url.pathname.startsWith('/c/')) {
      url.pathname = '/tip.html';
      const response = await env.ASSETS.fetch(new Request(url, request));
      return new Response(response.body, {
        status: 200,
        headers: response.headers,
      });
    }

    // Everything else → serve normally
    return env.ASSETS.fetch(request);
  },
};
