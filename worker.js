// Taludtod AI proxy for Cloudflare Workers.
// Variables to set in the Cloudflare dashboard (Settings > Variables and Secrets):
//   GEMINI_API_KEY  (secret)  free key from Google AI Studio. Keep billing OFF on that project.
//   ALLOWED_ORIGIN  your site origin(s), comma-separated, no path, e.g. https://yourname.github.io
//   MODEL           optional, a free-tier model shown in AI Studio (default below)

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const ok = (env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': ok ? origin : 'null',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
      'Vary': 'Origin'
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST' || !ok) return new Response('Forbidden', { status: 403, headers: cors });

    let body;
    try { body = await req.json(); } catch { return new Response('Bad request', { status: 400, headers: cors }); }
    const system = String(body.system || '').slice(0, 1500);
    const user = String(body.user || '').slice(0, 6000);
    if (!user) return new Response('Bad request', { status: 400, headers: cors });

    const model = env.MODEL || 'gemini-2.5-flash';
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: 4096, responseMimeType: 'application/json' }
      })
    });
    if (!r.ok) return new Response('Upstream error', { status: r.status === 429 ? 429 : 502, headers: cors });

    const d = await r.json();
    const text = (d.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
    return new Response(JSON.stringify({ text }), { headers: { ...cors, 'content-type': 'application/json' } });
  }
};
