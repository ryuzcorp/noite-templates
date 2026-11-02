import { scryptSync, scrypt } from 'node:crypto';
export default {
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/scrypt' || url.pathname === '/scrypt-async') {
      try {
        const out = url.pathname === '/scrypt'
          ? scryptSync('password', 'salt', 32)
          : await new Promise((res, rej) => scrypt('password', 'salt', 32, (e, k) => e ? rej(e) : res(k)));
        return Response.json({ ok: true, hex: Buffer.from(out).toString('hex').slice(0, 16) });
      } catch (e) {
        return Response.json({ ok: false, error: String((e && e.message) || e) }, 500);
      }
    }
    if (url.pathname === '/cache') {
      try {
        const c = caches.default;
        await c.put('https://probe/x', new Response('v1'));
        const hit = await c.match('https://probe/x');
        const body = hit ? await hit.text() : null;
        await c.delete('https://probe/x');
        const gone = await c.match('https://probe/x');
        return Response.json({ ok: true, body, deleted: gone === undefined || gone === null });
      } catch (e) {
        return Response.json({ ok: false, error: String((e && e.message) || e) }, 500);
      }
    }
    return Response.json({ ok: true, routes: ['/scrypt', '/scrypt-async', '/cache'] });
  }
};
