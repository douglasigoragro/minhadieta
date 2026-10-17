/* Minha dieta: cópia do app no aparelho para funcionar sem internet.
   Com internet, sempre busca a versão mais recente (e o controle de acesso da Cloudflare continua valendo).
   Sem internet, abre a última cópia guardada. */
const CACHE = 'minha-dieta-v1';
const FONTS = 'minha-dieta-fontes-v1';
const CORE = ['./', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(CORE.map(async url => {
      try {
        const res = await fetch(url, {credentials:'include', cache:'no-store'});
        if (res.ok && !res.redirected) await cache.put(url, res);
      } catch (e) { /* sem conexão ou bloqueado: tenta de novo na próxima abertura */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = [CACHE, FONTS];
    const names = await caches.keys();
    await Promise.all(names.filter(n => !keep.includes(n)).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

const timeout = ms => new Promise(resolve => setTimeout(resolve, ms));

async function openApp(request){
  const cache = await caches.open(CACHE);
  const cached = await cache.match('./');
  const network = fetch(request).then(res => {
    /* só guarda a página do app; respostas de login ou redirecionamento passam direto */
    if (res.ok && !res.redirected && res.type === 'basic') cache.put('./', res.clone());
    return res;
  });
  if (!cached){
    return network.catch(() => new Response(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<body style="font-family:system-ui;padding:32px;line-height:1.5"><h1 style="font-size:22px">Sem conexão</h1>' +
      '<p>Abra o app uma vez com internet para ele ficar disponível sem conexão.</p></body>',
      {status:503, headers:{'Content-Type':'text/html; charset=utf-8'}}));
  }
  /* com internet lenta, usa a cópia guardada depois de 4 segundos (a versão nova continua baixando) */
  return Promise.race([network.catch(() => cached), timeout(4000).then(() => cached)]);
}

async function staleWhileRevalidate(request, cacheName){
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request).then(res => {
    if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
    return res;
  }).catch(() => cached);
  return cached || network;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate' && url.origin === self.location.origin){
    event.respondWith(openApp(req));
  } else if (url.origin === self.location.origin){
    if (CORE.some(p => url.pathname.endsWith(p.replace('./', '/')) && p !== './')) event.respondWith(staleWhileRevalidate(req, CACHE));
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'){
    event.respondWith(staleWhileRevalidate(req, FONTS));
  }
});
