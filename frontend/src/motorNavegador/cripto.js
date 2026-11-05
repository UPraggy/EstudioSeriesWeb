// `crypto` do Node para o motor do navegador, só o que o backend usa e de forma SÍNCRONA (o WebCrypto é assíncrono):
// createHash('sha1' | 'sha256'), createHmac('sha256'), randomBytes, randomUUID, timingSafeEqual.
// Implementação direta das normas FIPS 180-4 (SHA-1/SHA-256) e RFC 2104 (HMAC). Testada contra o crypto do Node.
import { Buffer, paraBytes } from './buffer.js';

const rotl = (x, n) => (x << n) | (x >>> (32 - n));
const rotr = (x, n) => (x >>> n) | (x << (32 - n));

// Preenchimento comum (mensagem + 0x80 + zeros + tamanho em bits, big-endian, 64 bits).
function preencher(bytes) {
    const tamBits = bytes.length * 8;
    const total = Math.ceil((bytes.length + 9) / 64) * 64;
    const m = new Uint8Array(total);
    m.set(bytes);
    m[bytes.length] = 0x80;
    const dv = new DataView(m.buffer);
    dv.setUint32(total - 8, Math.floor(tamBits / 0x100000000), false);
    dv.setUint32(total - 4, tamBits >>> 0, false);
    return { m, dv };
}

function sha1(bytes) {
    const { m, dv } = preencher(bytes);
    let h0 = 0x67452301; let h1 = 0xefcdab89; let h2 = 0x98badcfe; let h3 = 0x10325476; let h4 = 0xc3d2e1f0;
    const w = new Uint32Array(80);
    for (let off = 0; off < m.length; off += 64) {
        for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
        for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
        let a = h0; let b = h1; let c = h2; let d = h3; let e = h4;
        for (let i = 0; i < 80; i++) {
            let f; let k;
            if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
            else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
            else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
            else { f = b ^ c ^ d; k = 0xca62c1d6; }
            const t = (rotl(a, 5) + f + e + k + w[i]) >>> 0;
            e = d; d = c; c = rotl(b, 30) >>> 0; b = a; a = t;
        }
        h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
    }
    const out = new Uint8Array(20);
    const o = new DataView(out.buffer);
    [h0, h1, h2, h3, h4].forEach((h, i) => o.setUint32(i * 4, h, false));
    return out;
}

const K256 = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function sha256(bytes) {
    const { m, dv } = preencher(bytes);
    const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const w = new Uint32Array(64);
    for (let off = 0; off < m.length; off += 64) {
        for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
        for (let i = 16; i < 64; i++) {
            const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
            const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
        }
        let [a, b, c, d, e, f, g, hh] = h;
        for (let i = 0; i < 64; i++) {
            const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            const ch = (e & f) ^ (~e & g);
            const t1 = (hh + S1 + ch + K256[i] + w[i]) >>> 0;
            const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const t2 = (S0 + maj) >>> 0;
            hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
        }
        h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
        h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
    }
    const out = new Uint8Array(32);
    const o = new DataView(out.buffer);
    h.forEach((x, i) => o.setUint32(i * 4, x, false));
    return out;
}

const ALGORITMOS = { sha1, sha256 };

function algoritmo(nome) {
    const f = ALGORITMOS[String(nome).toLowerCase().replace('-', '')];
    if (!f) throw new Error(`Algoritmo de hash não suportado no navegador: ${nome}`);
    return f;
}

function juntar(partes) {
    const total = partes.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(total);
    let pos = 0;
    for (const p of partes) { out.set(p, pos); pos += p.length; }
    return out;
}

function saida(bytes, enc) {
    const b = Buffer.deBytes(bytes);
    return enc ? b.toString(enc) : b;
}

export function createHash(nome) {
    const f = algoritmo(nome);
    const partes = [];
    let feito = false;
    return {
        update(dados, enc) {
            if (feito) throw new Error('Hash já finalizado.');
            partes.push(Uint8Array.from(paraBytes(dados, enc)));
            return this;
        },
        digest(enc) {
            feito = true;
            return saida(f(juntar(partes)), enc);
        },
    };
}

export function createHmac(nome, chave) {
    const f = algoritmo(nome);
    const bloco = 64;
    let k = paraBytes(chave);
    if (k.length > bloco) k = f(k);
    const kp = new Uint8Array(bloco);
    kp.set(k);
    const ipad = kp.map((x) => x ^ 0x36);
    const opad = kp.map((x) => x ^ 0x5c);
    const partes = [ipad];
    return {
        update(dados, enc) {
            partes.push(Uint8Array.from(paraBytes(dados, enc)));
            return this;
        },
        digest(enc) {
            const interno = f(juntar(partes));
            return saida(f(juntar([opad, interno])), enc);
        },
    };
}

function webCrypto() {
    const c = globalThis.crypto;
    if (!c || !c.getRandomValues) throw new Error('Este navegador não tem gerador de números aleatórios seguro (crypto.getRandomValues).');
    return c;
}

export function randomBytes(n) {
    const b = Buffer.alloc(n);
    const c = webCrypto();
    for (let i = 0; i < n; i += 65536) c.getRandomValues(b.subarray(i, Math.min(n, i + 65536)));
    return b;
}

export function randomUUID() {
    const c = webCrypto();
    if (c.randomUUID) return c.randomUUID();
    const b = randomBytes(16);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = b.toString('hex');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function timingSafeEqual(a, b) {
    if (a.length !== b.length) throw new RangeError('Input buffers must have the same byte length');
    let d = 0;
    for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
    return d === 0;
}

export function randomInt(min, max) {
    if (max === undefined) { max = min; min = 0; }
    const faixa = max - min;
    const v = randomBytes(4).readUInt32BE(0);
    return min + (v % faixa);
}

const cripto = { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual, randomInt };
export default cripto;
