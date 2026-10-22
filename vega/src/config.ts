// Where the Couch Game Studio server is reachable from the Fire TV.
// Use an HTTPS URL (WebView blocks plain HTTP by default), e.g. a Cloudflare quick tunnel:
//   npm start                                     (in the repo root)
//   cloudflared tunnel --url http://localhost:8787
// then paste the https://….trycloudflare.com address here and rebuild.
export const STUDIO_URL = 'https://YOUR-STUDIO-HOST';
