// Serves the site at / while the files stay in /site and the stickers stay at
// /birds and /easter. Asset requests never enter this script.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/index.html") {
      url.pathname = "/site/index.html";
      return env.ASSETS.fetch(
        new Request(url.toString(), {
          method: request.method,
          headers: request.headers,
        }),
      );
    }
    return env.ASSETS.fetch(request);
  },
};
