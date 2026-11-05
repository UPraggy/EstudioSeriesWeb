// Service worker do Estúdio (motor do navegador): entrega as MÍDIAS das séries para <img>, <video>, <audio> e fontes.
// As telas montam URLs comuns ("./__motor/Midia?serie=...&caminho=..."), iguais às do backend. Aqui elas são
// interceptadas e o arquivo vem da própria aba (o motor lê do OPFS, IndexedDB ou da pasta escolhida) por mensagem.
// Suporta Range (o <video> precisa para avançar/voltar). Não guarda cache de nada: atualizar o site não fica preso.
const PREFIXO = '/__motor/';
const ESPERA_MS = 30000;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (evento) => {
    const url = new URL(evento.request.url);
    if (url.origin !== self.location.origin) return;
    const i = url.pathname.indexOf(PREFIXO);
    if (i === -1) return;
    const rota = url.pathname.slice(i + PREFIXO.length);
    evento.respondWith(responder(evento, rota, url));
});

async function acharCliente(id) {
    if (id) {
        const c = await self.clients.get(id);
        if (c) return c;
    }
    const todos = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    return todos.find((c) => c.focused) || todos[0] || null;
}

function perguntar(cliente, msg) {
    return new Promise((ok) => {
        const canal = new MessageChannel();
        const t = setTimeout(() => ok({ ok: false, status: 504, erro: 'A aba do Estúdio não respondeu.' }), ESPERA_MS);
        canal.port1.onmessage = (e) => { clearTimeout(t); ok(e.data); };
        cliente.postMessage(msg, [canal.port2]);
    });
}

function json(status, corpo) {
    return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

async function responder(evento, rota, url) {
    if (rota !== 'Midia' && rota !== 'MidiaSimples') return json(404, { Error: `Rota ${rota} não é mídia.` });
    const cliente = await acharCliente(evento.clientId || evento.resultingClientId);
    if (!cliente) return json(503, { Error: 'Abra o Estúdio numa aba para ver as mídias.' });
    const r = await perguntar(cliente, { tipo: 'estudio:midia', rota, query: Object.fromEntries(url.searchParams) });
    if (!r || !r.ok) return json((r && r.status) || 500, { Error: (r && r.erro) || 'Falha ao ler a mídia.' });
    const blob = r.blob;
    const tamanho = blob.size;
    const base = { 'Content-Type': r.tipo || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
    const m = /bytes=(\d*)-(\d*)/.exec(evento.request.headers.get('range') || '');
    if (m) {
        const ini = m[1] === '' ? Math.max(0, tamanho - Number(m[2])) : Number(m[1]);
        const fim = m[1] !== '' && m[2] !== '' ? Math.min(Number(m[2]), tamanho - 1) : tamanho - 1;
        if (ini >= tamanho || ini > fim) return new Response(null, { status: 416, headers: { ...base, 'Content-Range': `bytes */${tamanho}` } });
        return new Response(blob.slice(ini, fim + 1), {
            status: 206,
            headers: { ...base, 'Content-Range': `bytes ${ini}-${fim}/${tamanho}`, 'Content-Length': String(fim - ini + 1) },
        });
    }
    return new Response(blob, { status: 200, headers: { ...base, 'Content-Length': String(tamanho) } });
}
