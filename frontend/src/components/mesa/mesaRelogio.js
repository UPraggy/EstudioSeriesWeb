// Relógio da prévia + motor de áudio (Web Audio).
// O tempo da linha do tempo anda pelo relógio; as falas são AGENDADAS no AudioContext no tempo exato (início,
// entrada no arquivo e duração do item), e o vídeo da prévia segue o relógio. Tocar/pausar/ir/velocidade
// reagendam tudo. J (taxa negativa) volta sem som.
import { useEffect, useState } from 'react';

class MotorAudio {
    constructor() {
        this.ctx = null;
        this.buffers = new Map();
        this.fontes = [];
        this.sessao = 0;
        this.ruido = null;
        this.mestre = null;
    }

    garantir() {
        if (!this.ctx) {
            const C = window.AudioContext || window.webkitAudioContext;
            if (!C) return null;
            this.ctx = new C();
            this.mestre = this.ctx.createGain();
            this.mestre.gain.value = 1;
            this.mestre.connect(this.ctx.destination);
        }
        return this.ctx;
    }

    carregar(url) {
        if (!url) return Promise.resolve(null);
        if (this.buffers.has(url)) return Promise.resolve(this.buffers.get(url));
        const ctx = this.garantir();
        if (!ctx) return Promise.resolve(null);
        const p = fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then((b) => ctx.decodeAudioData(b))
            .then((buf) => { this.buffers.set(url, buf); return buf; })
            .catch(() => { this.buffers.delete(url); return null; });
        this.buffers.set(url, p);
        return p;
    }

    pronto(url) {
        const b = this.buffers.get(url);
        return b && typeof b.then !== 'function' ? b : null;
    }

    parar() {
        this.sessao += 1;
        for (const f of this.fontes) { try { f.stop(); } catch { /* já parou */ } }
        this.fontes = [];
    }

    ruidoMarrom() {
        if (this.ruido) return this.ruido;
        const ctx = this.ctx;
        const n = ctx.sampleRate * 4;
        const buf = ctx.createBuffer(1, n, ctx.sampleRate);
        const d = buf.getChannelData(0);
        let ultimo = 0;
        let pico = 0;
        for (let i = 0; i < n; i++) {
            ultimo = (ultimo + 0.02 * (Math.random() * 2 - 1)) / 1.02;
            d[i] = ultimo;
            pico = Math.max(pico, Math.abs(ultimo));
        }
        for (let i = 0; i < n; i++) d[i] /= pico || 1;
        this.ruido = buf;
        return buf;
    }

    // itens: [{ url, inicioS, duracaoS, entradaS, ganho }]; ambiente: { volume } | null
    agendar({ itens, t, taxa, ambiente, duracao }) {
        const ctx = this.garantir();
        if (!ctx) return;
        this.parar();
        if (taxa <= 0) return;
        const sessao = this.sessao;
        const inicioCtx = ctx.currentTime + 0.02;
        const programar = (it, buf) => {
            if (sessao !== this.sessao || !buf) return;
            const fim = it.inicioS + it.duracaoS;
            const agoraT = t + (ctx.currentTime - inicioCtx) * taxa;
            if (fim <= agoraT + 0.01) return;
            const desde = Math.max(0, agoraT - it.inicioS);
            const quando = Math.max(ctx.currentTime, inicioCtx + (it.inicioS + desde - t) / taxa);
            const src = ctx.createBufferSource();
            src.buffer = buf;
            src.playbackRate.value = taxa;
            const g = ctx.createGain();
            g.gain.value = it.ganho ?? 1;
            src.connect(g).connect(this.mestre);
            const offset = (it.entradaS || 0) + desde;
            const dur = it.duracaoS - desde;
            if (offset >= buf.duration || dur <= 0.005) return;
            src.start(quando, offset, Math.min(dur, buf.duration - offset));
            this.fontes.push(src);
        };
        for (const it of itens) {
            const b = this.pronto(it.url);
            if (b) programar(it, b);
            else this.carregar(it.url).then((buf) => programar(it, buf));
        }
        if (ambiente && ambiente.volume > 0 && t < duracao) {
            const src = ctx.createBufferSource();
            src.buffer = this.ruidoMarrom();
            src.loop = true;
            const filtro = ctx.createBiquadFilter();
            filtro.type = 'lowpass';
            filtro.frequency.value = 380;
            const g = ctx.createGain();
            g.gain.value = Math.min(1, ambiente.volume * 1.6);
            src.connect(filtro).connect(g).connect(this.mestre);
            src.start(inicioCtx);
            src.stop(inicioCtx + (duracao - t) / taxa);
            this.fontes.push(src);
        }
    }
}

export class Relogio {
    constructor() {
        this.base = 0;
        this.t0 = 0;
        this.tocando = false;
        this.taxa = 1;
        this.duracao = 60;
        this.ouvintes = new Set();
        this.raf = null;
        this.audio = new MotorAudio();
        this.fonteAudio = () => ({ itens: [], ambiente: null });
    }

    agora() {
        if (!this.tocando) return this.base;
        const t = this.base + ((performance.now() - this.t0) / 1000) * this.taxa;
        return Math.max(0, Math.min(this.duracao, t));
    }

    avisar() {
        const t = this.agora();
        for (const f of this.ouvintes) f(t, this.tocando, this.taxa);
    }

    on(fn) {
        this.ouvintes.add(fn);
        return () => this.ouvintes.delete(fn);
    }

    // Um passo do relógio. Roda pelo requestAnimationFrame e, de reserva, por um timer de 40 ms: com a aba em
    // segundo plano (ou janela sem pintar) o rAF para, mas o tempo, o vídeo e as falas agendadas continuam juntos.
    tickar() {
        if (!this.tocando) return;
        const agora = performance.now();
        if (agora - (this.ultimoTick || 0) < 12) return;
        this.ultimoTick = agora;
        const t = this.agora();
        if ((this.taxa > 0 && t >= this.duracao - 1e-3) || (this.taxa < 0 && t <= 0)) {
            this.pausar();
            this.ir(this.taxa > 0 ? this.duracao : 0);
            return;
        }
        this.avisar();
    }

    laco = () => {
        if (!this.tocando) return;
        this.tickar();
        this.raf = requestAnimationFrame(this.laco);
    };

    reagendar() {
        if (!this.tocando) { this.audio.parar(); return; }
        const { itens, ambiente } = this.fonteAudio();
        this.audio.agendar({ itens, t: this.agora(), taxa: this.taxa, ambiente, duracao: this.duracao });
    }

    tocar(taxa = this.taxa || 1) {
        const ctx = this.audio.garantir();
        if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
        const t = this.agora();
        this.base = t >= this.duracao - 0.05 && taxa > 0 ? 0 : t;
        this.taxa = taxa;
        this.t0 = performance.now();
        this.tocando = true;
        this.reagendar();
        cancelAnimationFrame(this.raf);
        clearInterval(this.intervalo);
        this.raf = requestAnimationFrame(this.laco);
        this.intervalo = setInterval(() => this.tickar(), 40);
        this.avisar();
    }

    pausar() {
        this.base = this.agora();
        this.tocando = false;
        cancelAnimationFrame(this.raf);
        clearInterval(this.intervalo);
        this.audio.parar();
        this.avisar();
    }

    alternar() {
        if (this.tocando) this.pausar();
        else this.tocar(1);
    }

    ir(t) {
        this.base = Math.max(0, Math.min(this.duracao, Number(t) || 0));
        this.t0 = performance.now();
        if (this.tocando) this.reagendar();
        this.avisar();
    }

    passo(dt) {
        if (this.tocando) this.pausar();
        this.ir(this.base + dt);
    }

    mudarTaxa(taxa) {
        if (!this.tocando) { this.taxa = taxa; this.avisar(); return; }
        this.base = this.agora();
        this.t0 = performance.now();
        this.taxa = taxa;
        this.reagendar();
        this.avisar();
    }

    // Saindo da Mesa: para tudo e suspende o áudio (sem fechar: o StrictMode monta de novo em desenvolvimento,
    // e um contexto suspenso não gasta nada).
    soltar() {
        this.pausar();
        if (this.audio.ctx && this.audio.ctx.state === 'running') this.audio.ctx.suspend().catch(() => {});
    }
}

// Tempo atual para componentes pequenos (cursor, mostrador, legenda da prévia).
export function useTempo(relogio) {
    const [estado, setEstado] = useState({ t: relogio ? relogio.agora() : 0, tocando: false, taxa: 1 });
    useEffect(() => {
        if (!relogio) return undefined;
        setEstado({ t: relogio.agora(), tocando: relogio.tocando, taxa: relogio.taxa });
        return relogio.on((t, tocando, taxa) => setEstado({ t, tocando, taxa }));
    }, [relogio]);
    return estado;
}
