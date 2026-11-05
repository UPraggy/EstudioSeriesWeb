// Configuração e utilidades globais (padrão do Rafael: classe estática).
export default class GlobalVar {
    static serverBase = '/api'; // Vite repassa /api para o backend (127.0.0.1:4190)

    static getLocalStorage(chave, padrao = null) {
        try {
            const v = localStorage.getItem(chave);
            return v == null ? padrao : JSON.parse(v);
        } catch {
            return padrao;
        }
    }

    static setLocalStorage(chave, valor) {
        try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* sem armazenamento */ }
    }

    static dataBR(iso) {
        const d = new Date(iso);
        return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR');
    }

    static usd(valor) {
        return `US$ ${Number(valor || 0).toFixed(2).replace('.', ',')}`;
    }

    static tempo(segundos) {
        const s = Math.max(0, Number(segundos) || 0);
        const m = Math.floor(s / 60);
        const r = (s - m * 60).toFixed(1).padStart(4, '0').replace('.', ',');
        return `${String(m).padStart(2, '0')}:${r}`;
    }

    // Valores pequenos (imagem, LLM) com 3 casas: "US$ 0,074" em vez de "US$ 0,07".
    static usdFino(valor) {
        const v = Number(valor || 0);
        const casas = v !== 0 && Math.abs(v) < 0.1 ? 3 : 2;
        return `US$ ${v.toFixed(casas).replace('.', ',')}`;
    }

    static dataHoraBR(iso) {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '';
        return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    }

    // Imagem/vídeo da pasta da série (caminho relativo à pasta da série), servido por GET /Midia com Range.
    static urlMidia(serie, caminho) {
        if (!serie || !caminho) return '';
        return `${GlobalVar.serverBase}/Midia?serie=${encodeURIComponent(serie)}&caminho=${encodeURIComponent(caminho)}`;
    }

    // Arquivo de uma geração simples (<dados>/geracao-simples/<id>/<caminho>), servido por GET /MidiaSimples.
    static urlMidiaSimples(id, caminho) {
        if (!id || !caminho) return '';
        return `${GlobalVar.serverBase}/MidiaSimples?id=${encodeURIComponent(id)}&caminho=${encodeURIComponent(caminho)}`;
    }

    // Etapas da série/status do episódio (CONTRATOS), na ordem.
    static ETAPAS = [
        { id: 'ideia', nome: 'Ideia' },
        { id: 'biblia', nome: 'Bíblia' },
        { id: 'roteiro', nome: 'Roteiro' },
        { id: 'elenco', nome: 'Elenco e locais' },
        { id: 'decupagem', nome: 'Decupagem' },
        { id: 'geracao', nome: 'Geração' },
        { id: 'audio', nome: 'Áudio' },
        { id: 'montagem', nome: 'Montagem' },
        { id: 'votacao', nome: 'Votação' },
        { id: 'publicado', nome: 'Publicado' },
    ];

    static nomeEtapa(id) {
        const e = GlobalVar.ETAPAS.find((x) => x.id === id);
        return e ? e.nome : (id || '—');
    }

    // Mesmo slug do backend (id da série a partir do título).
    static slug(texto) {
        return String(texto || '')
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 80)
            .replace(/-+$/g, '');
    }
}
