/*
  TriPlan — Strava OAuth Proxy (Cloudflare Worker)

  This worker handles the Strava token exchange so your client_secret
  stays safe on the server side (never exposed in browser code).

  DEPLOYMENT:
  1. Go to https://dash.cloudflare.com → Workers & Pages → Create
  2. Name it something like "strava-proxy"
  3. Paste this entire file into the worker editor
  4. Go to Settings → Variables → add these Environment Variables:
     - STRAVA_CLIENT_ID     → your Strava app client ID
     - STRAVA_CLIENT_SECRET → your Strava app client secret
  5. Deploy
  6. Copy your worker URL (e.g., https://strava-proxy.yourname.workers.dev)
  7. Paste it into STRAVA_PROXY_URL in js/strava.js
*/

export default {
  async fetch(request, env) {
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // Token exchange: /exchange
    if (url.pathname === '/exchange' && request.method === 'POST') {
      try {
        const { code } = await request.json();

        const resp = await fetch('https://www.strava.com/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: env.STRAVA_CLIENT_ID,
            client_secret: env.STRAVA_CLIENT_SECRET,
            code: code,
            grant_type: 'authorization_code',
          }),
        });

        const data = await resp.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: 'Exchange failed' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Token refresh: /refresh
    if (url.pathname === '/refresh' && request.method === 'POST') {
      try {
        const { refresh_token } = await request.json();

        const resp = await fetch('https://www.strava.com/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: env.STRAVA_CLIENT_ID,
            client_secret: env.STRAVA_CLIENT_SECRET,
            refresh_token: refresh_token,
            grant_type: 'refresh_token',
          }),
        });

        const data = await resp.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: 'Refresh failed' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response('Not found', { status: 404, headers: corsHeaders });
  },
};
