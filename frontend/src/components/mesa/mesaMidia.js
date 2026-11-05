// Miniaturas (tira de quadros) e forma de onda, com cache por arquivo durante a sessão.
import { useEffect, useState } from 'react';
import { MiniaturasClipe, OndaAudio, CatalogoVideo } from '../funcionalidades/bancoGet';
import { erroDe } from '../funcionalidades/fetchFunc';

// Catálogo de vídeo do OpenRouter (GET grátis; no simulado vem do retrato em amostras/), uma vez por sessão.
let catalogoPromessa = null;
export function useCatalogo() {
    const [cat, setCat] = useState(null);
    useEffect(() => {
        if (!catalogoPromessa) catalogoPromessa = CatalogoVideo();
        let vivo = true;
        catalogoPromessa.then((r) => {
            if (erroDe(r)) catalogoPromessa = null;
            else if (vivo) setCat(r);
        });
        return () => { vivo = false; };
    }, []);
    return cat;
}

const cacheMini = new Map();
const cacheOnda = new Map();

function usarCache(cache, chave, buscar) {
    const [valor, setValor] = useState(() => {
        const v = cache.get(chave);
        return v && typeof v.then !== 'function' ? v : null;
    });
    useEffect(() => {
        if (!chave) { setValor(null); return undefined; }
        let vivo = true;
        const v = cache.get(chave);
        if (v && typeof v.then !== 'function') { setValor(v); return undefined; }
        const p = v || buscar().then((r) => {
            const ok = r && !erroDe(r) ? r : { erro: erroDe(r) || 'falhou' };
            cache.set(chave, ok);
            return ok;
        });
        if (!v) cache.set(chave, p);
        p.then((r) => { if (vivo) setValor(r); });
        return () => { vivo = false; };
    }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps
    return valor;
}

export function useMiniaturas(serie, arquivo, altura = 96) {
    const chave = serie && arquivo ? `${serie}|${arquivo}|${altura}` : null;
    return usarCache(cacheMini, chave, () => MiniaturasClipe({ serie, caminho: arquivo, altura }));
}

export function useOnda(serie, arquivo) {
    const chave = serie && arquivo ? `${serie}|${arquivo}` : null;
    return usarCache(cacheOnda, chave, () => OndaAudio({ serie, caminho: arquivo }));
}

export function esquecerOnda(serie, arquivo) {
    cacheOnda.delete(`${serie}|${arquivo}`);
}
