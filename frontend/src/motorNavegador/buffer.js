// Buffer mínimo para o código do backend rodar no navegador (motor "navegador").
// Cobre só o que o backend usa: from/alloc/concat/isBuffer/byteLength, toString em utf8/base64/base64url/hex/latin1,
// equals, leitura de inteiros. É um Uint8Array: subarray/slice devolvem Buffer (species).
const codificador = new TextEncoder();
const decodificador = new TextDecoder('utf-8');

function normalizarCodificacao(enc) {
    const e = String(enc || 'utf8').toLowerCase();
    if (e === 'utf-8') return 'utf8';
    if (e === 'binary') return 'latin1';
    if (e === 'ucs2' || e === 'ucs-2' || e === 'utf16le' || e === 'utf-16le') return 'utf16le';
    return e;
}

function base64ParaBytes(texto) {
    let t = String(texto).replace(/[\s=]+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    const bin = atob(t);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

function bytesParaBase64(bytes) {
    let bin = '';
    const passo = 0x8000;
    for (let i = 0; i < bytes.length; i += passo) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + passo));
    }
    return btoa(bin);
}

function textoParaBytes(texto, enc) {
    const e = normalizarCodificacao(enc);
    const s = String(texto);
    switch (e) {
        case 'utf8': return codificador.encode(s);
        case 'base64':
        case 'base64url': return base64ParaBytes(s);
        case 'hex': {
            const n = Math.floor(s.length / 2);
            const out = new Uint8Array(n);
            for (let i = 0; i < n; i++) {
                const v = parseInt(s.substr(i * 2, 2), 16);
                if (Number.isNaN(v)) return out.subarray(0, i);
                out[i] = v;
            }
            return out;
        }
        case 'latin1':
        case 'ascii': {
            const out = new Uint8Array(s.length);
            for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
            return out;
        }
        case 'utf16le': {
            const out = new Uint8Array(s.length * 2);
            for (let i = 0; i < s.length; i++) {
                const c = s.charCodeAt(i);
                out[i * 2] = c & 0xff;
                out[i * 2 + 1] = c >> 8;
            }
            return out;
        }
        default: throw new TypeError(`Codificação não suportada no navegador: ${enc}`);
    }
}

export class Buffer extends Uint8Array {
    static from(valor, codOuOffset, tamanho) {
        if (typeof valor === 'string') return Buffer.deBytes(textoParaBytes(valor, codOuOffset));
        if (valor instanceof ArrayBuffer) {
            // Igual ao Node: compartilha a memória do ArrayBuffer.
            const ini = codOuOffset || 0;
            return new Buffer(valor, ini, tamanho !== undefined ? tamanho : valor.byteLength - ini);
        }
        if (ArrayBuffer.isView(valor)) {
            const b = new Buffer(valor.byteLength);
            b.set(new Uint8Array(valor.buffer, valor.byteOffset, valor.byteLength));
            return b;
        }
        if (Array.isArray(valor)) {
            const b = new Buffer(valor.length);
            for (let i = 0; i < valor.length; i++) b[i] = valor[i] & 0xff;
            return b;
        }
        if (valor && valor.type === 'Buffer' && Array.isArray(valor.data)) return Buffer.from(valor.data);
        throw new TypeError('Buffer.from: valor não suportado.');
    }

    // Embrulha bytes sem copiar.
    static deBytes(bytes) {
        return new Buffer(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    }

    static alloc(tamanho, preencher = 0) {
        const b = new Buffer(tamanho);
        if (preencher) b.fill(typeof preencher === 'number' ? preencher : Buffer.from(String(preencher))[0] || 0);
        return b;
    }

    static allocUnsafe(tamanho) {
        return new Buffer(tamanho);
    }

    static isBuffer(x) {
        return x instanceof Buffer;
    }

    static isEncoding(enc) {
        return ['utf8', 'base64', 'base64url', 'hex', 'latin1', 'ascii', 'utf16le'].includes(normalizarCodificacao(enc));
    }

    static byteLength(valor, enc) {
        if (typeof valor === 'string') return textoParaBytes(valor, enc).length;
        return valor.byteLength;
    }

    static concat(lista, total) {
        const soma = total !== undefined ? total : lista.reduce((s, b) => s + b.length, 0);
        const out = new Buffer(soma);
        let pos = 0;
        for (const b of lista) {
            if (pos >= soma) break;
            const parte = b.length > soma - pos ? b.subarray(0, soma - pos) : b;
            out.set(parte, pos);
            pos += parte.length;
        }
        return out;
    }

    toString(enc = 'utf8', inicio = 0, fim = this.length) {
        const bytes = this.subarray(inicio, fim);
        switch (normalizarCodificacao(enc)) {
            case 'utf8': return decodificador.decode(bytes);
            case 'base64': return bytesParaBase64(bytes);
            case 'base64url': return bytesParaBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            case 'hex': {
                let s = '';
                for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
                return s;
            }
            case 'latin1':
            case 'ascii': {
                let s = '';
                for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
                return s;
            }
            case 'utf16le': {
                let s = '';
                for (let i = 0; i + 1 < bytes.length; i += 2) s += String.fromCharCode(bytes[i] | (bytes[i + 1] << 8));
                return s;
            }
            default: throw new TypeError(`Codificação não suportada no navegador: ${enc}`);
        }
    }

    toJSON() {
        return { type: 'Buffer', data: Array.from(this) };
    }

    equals(outro) {
        if (!outro || this.length !== outro.length) return false;
        for (let i = 0; i < this.length; i++) if (this[i] !== outro[i]) return false;
        return true;
    }

    compare(outro) {
        const n = Math.min(this.length, outro.length);
        for (let i = 0; i < n; i++) if (this[i] !== outro[i]) return this[i] < outro[i] ? -1 : 1;
        return this.length === outro.length ? 0 : (this.length < outro.length ? -1 : 1);
    }

    copy(alvo, inicioAlvo = 0, inicio = 0, fim = this.length) {
        const parte = this.subarray(inicio, fim);
        alvo.set(parte.subarray(0, Math.max(0, alvo.length - inicioAlvo)), inicioAlvo);
        return Math.min(parte.length, alvo.length - inicioAlvo);
    }

    write(texto, offset = 0, tamanho, enc = 'utf8') {
        if (typeof offset === 'string') { enc = offset; offset = 0; }
        const bytes = textoParaBytes(texto, enc);
        const n = Math.min(bytes.length, tamanho !== undefined ? tamanho : this.length - offset, this.length - offset);
        this.set(bytes.subarray(0, n), offset);
        return n;
    }

    visao() {
        return new DataView(this.buffer, this.byteOffset, this.byteLength);
    }

    readUInt8(o = 0) { return this[o]; }
    readInt8(o = 0) { return this.visao().getInt8(o); }
    readUInt16LE(o = 0) { return this.visao().getUint16(o, true); }
    readUInt16BE(o = 0) { return this.visao().getUint16(o, false); }
    readInt16LE(o = 0) { return this.visao().getInt16(o, true); }
    readInt16BE(o = 0) { return this.visao().getInt16(o, false); }
    readUInt32LE(o = 0) { return this.visao().getUint32(o, true); }
    readUInt32BE(o = 0) { return this.visao().getUint32(o, false); }
    readInt32LE(o = 0) { return this.visao().getInt32(o, true); }
    readInt32BE(o = 0) { return this.visao().getInt32(o, false); }
    readFloatLE(o = 0) { return this.visao().getFloat32(o, true); }
    readDoubleLE(o = 0) { return this.visao().getFloat64(o, true); }
    writeUInt32BE(v, o = 0) { this.visao().setUint32(o, v, false); return o + 4; }
    writeUInt32LE(v, o = 0) { this.visao().setUint32(o, v, true); return o + 4; }
    writeUInt16LE(v, o = 0) { this.visao().setUint16(o, v, true); return o + 2; }
    writeInt16LE(v, o = 0) { this.visao().setInt16(o, v, true); return o + 2; }
}

// Aliases que o Node também tem.
Buffer.prototype.readUint8 = Buffer.prototype.readUInt8;
Buffer.prototype.readUint16LE = Buffer.prototype.readUInt16LE;
Buffer.prototype.readUint32LE = Buffer.prototype.readUInt32LE;
Buffer.prototype.readUint32BE = Buffer.prototype.readUInt32BE;

// Converte qualquer dado de escrita (string, Buffer, Uint8Array, ArrayBuffer, DataView) em bytes.
export function paraBytes(dados, enc) {
    if (typeof dados === 'string') return textoParaBytes(dados, enc);
    if (dados instanceof Uint8Array) return dados;
    if (dados instanceof ArrayBuffer) return new Uint8Array(dados);
    if (ArrayBuffer.isView(dados)) return new Uint8Array(dados.buffer, dados.byteOffset, dados.byteLength);
    throw new TypeError('Dado de escrita não suportado (use texto ou bytes).');
}

export default Buffer;
