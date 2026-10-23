// Where the Couch Game Studio server is reachable from the Fire TV. It must be HTTPS
// (WebView blocks plain HTTP by default). This is the permanent studio on AWS
// (infra/aws/studio.yaml). For your own server, use its address or a tunnel:
//   npm start                                     (in the repo root)
//   cloudflared tunnel --url http://localhost:8787
// then paste the https://… address here and rebuild.
export const STUDIO_URL = 'https://16-171-214-22.sslip.io';
