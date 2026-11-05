import { useEffect, useMemo, useRef, useState } from 'react';
import GlobalVar from './subComponents/GlobalVar';
import ConfirmarCusto from './subComponents/ConfirmarCusto';
import {
    CatalogoVideo, CotarGeracaoSimples, GerarGeracaoSimples, ListarGeracoesSimples, StatusJob, rotaIndisponivel,
} from './funcionalidades/bancoGet';
import { erroDe } from './funcionalidades/fetchFunc';
import { Ico } from './subComponents/icones';
import { Contador, Esqueleto, Expandir, Girador, Vazio, avisar, MOV, motion, AnimatePresence } from './subComponents/Movimento';
import '../assets/css/Telas.css';
import '../assets/css/GeracaoSimples.css';

const PAPEIS = [
    { id: 'primeiro_quadro', rotulo: 'Primeiro quadro' },
    { id: 'ultimo_quadro', rotulo: 'Último quadro' },
    { id: 'referencia', rotulo: 'Referência' },
];
const FORMATOS = ['9:16', '16:9', '1:1'];
const LIMITE_MB = 50;
const MODELO_PREFERIDO = 'bytedance/seedance-1-5-pro';

let proximoId = 1;

function lerComoDataUrl(arquivo) {
    return new Promise((resolve, reject) => {
        const leitor = new FileReader();
        leitor.onload = () => resolve(leitor.result);
        leitor.onerror = () => reject(leitor.error);
        leitor.readAsDataURL(arquivo);
    });
}

function tamanhoTexto(bytes) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

function faixaDuracoes(d) {
    if (!Array.isArray(d) || !d.length) return '—';
    const s = [...d].sort((a, b) => a - b);
    const continuo = s.every((v, i) => i === 0 || v === s[i - 1] + 1);
    return continuo && s.length > 3 ? `${s[0]}–${s[s.length - 1]} s` : `${s.join(', ')} s`;
}

function quadrosDe(q) {
    if (!q || !q.length) return 'não';
    if (q.includes('first_frame') && q.includes('last_frame')) return 'início e fim';
    return q.includes('first_frame') ? 'início' : 'fim';
}

// Por que um modelo não serve para este pedido (lista vazia = serve).
function motivosRecusa(m, anexos, proporcao) {
    const motivos = [];
    if (!Array.isArray(m.duracoes) || !m.duracoes.length) motivos.push('precisa de entrada especial');
    if (anexos.some((a) => a.tipo === 'video')) motivos.push('vídeo de entrada ainda não é aceito');
    const imgs = anexos.filter((a) => a.tipo === 'imagem');
    const quadros = m.quadros || [];
    if (imgs.some((a) => a.papel === 'primeiro_quadro') && !quadros.includes('first_frame')) motivos.push('não aceita primeiro quadro');
    if (imgs.some((a) => a.papel === 'ultimo_quadro') && !quadros.includes('last_frame')) motivos.push('não aceita último quadro');
    const skus = m.pricingSkus || {};
    if (imgs.some((a) => a.papel === 'referencia') && !(skus.reference_input_images || skus.reference_images)) motivos.push('não aceita referências');
    if (Array.isArray(m.proporcoes) && !m.proporcoes.includes(proporcao)) motivos.push(`não faz ${proporcao}`);
    return motivos;
}

// Estimativa a partir do preço de exemplo do catálogo (o valor exato vem da cotação).
function estimar(m, duracaoS, resolucao, audio) {
    const p = m && m.precoExemplo;
    if (!p || p.erro || !p.duracaoS) return null;
    const base = audio && p.comAudioUsd != null ? p.comAudioUsd : p.semAudioUsd;
    if (base == null) return null;
    return { usd: (base / p.duracaoS) * duracaoS, mesmaResolucao: !resolucao || resolucao === p.resolucao, resolucaoExemplo: p.resolucao };
}

function precoExemplo(m) {
    const p = m.precoExemplo;
    return p && !p.erro && p.semAudioUsd != null ? p.semAudioUsd : Infinity;
}

const STATUS = { pronto: ['Pronto', 'ok', Ico.ok], pendente: ['Gerando', 'gerando', null], falhou: ['Falhou', 'perigo', Ico.erro] };
const ICONE_ANEXO = { imagem: Ico.imagem, video: Ico.video, texto: Ico.texto };
const NOME_ANEXO = { imagem: 'Imagem', video: 'Vídeo', texto: 'Texto' };

// Desenho do formato (o retângulo na proporção certa) dentro do seletor.
function Proporcao({ f }) {
    const [l, a] = f.split(':').map(Number);
    const esc = 14 / Math.max(l, a);
    return <span className="gs-proporcao" style={{ width: Math.round(l * esc), height: Math.round(a * esc) }} aria-hidden="true" />;
}

function ItemGaleria({ g, previaLocal }) {
    const [semMidia, setSemMidia] = useState(false);
    const r = g.resultado;
    const [rotulo, classe, IconeEstado] = r ? (STATUS[r.status] || ['—', 'neutro', null]) : ['Cotado', 'neutro', null];
    const ehVideo = r && /\.(mp4|webm|mov)$/i.test(r.caminho || '');
    const proporcao = /^\d+:\d+$/.test(g.proporcao || '') ? g.proporcao.replace(':', ' / ') : '9 / 16';
    return (
        <motion.article
            className="gs-item"
            layout="position"
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: MOV.base, ease: MOV.enfatico } }}
        >
            <div className="gs-item-midia" style={{ aspectRatio: proporcao }}>
                {r && r.status === 'pronto' && !semMidia
                    ? (ehVideo
                        ? <video src={GlobalVar.urlMidiaSimples(g.id, r.caminho)} controls muted playsInline preload="metadata" onError={() => setSemMidia(true)} />
                        : <img className="foto" src={GlobalVar.urlMidiaSimples(g.id, r.caminho)} alt="Resultado" onError={() => setSemMidia(true)} />)
                    : previaLocal
                        ? <img className="foto gs-item-previa" src={previaLocal} alt="Anexo do pedido" />
                        : <div className="sem-foto"><Ico.video aria-hidden="true" />{semMidia ? 'Prévia indisponível neste servidor' : rotulo}</div>}
                {r && r.status === 'pendente' && <span className="gs-item-gerando"><span className="gs-ponto-sinal" aria-hidden="true" />Gerando</span>}
            </div>
            <div className="gs-item-corpo">
                <div className="gs-item-cab">
                    <span className={`gs-estado ${classe}`}>
                        {IconeEstado ? <IconeEstado aria-hidden="true" /> : classe === 'gerando' ? <Girador /> : <Ico.info aria-hidden="true" />}
                        {rotulo}
                    </span>
                    {r && r.simulado && <span className="gs-estado aviso"><Ico.simulado aria-hidden="true" />Simulado</span>}
                </div>
                <p className="gs-item-texto">{g.texto || <span className="suave">Sem texto</span>}</p>
                <p className="gs-item-meta gs-item-modelo">{g.modelo}</p>
                <p className="gs-item-meta num">
                    {[g.duracaoS ? `${g.duracaoS} s` : null, g.proporcao, g.resolucao, g.audio ? 'com áudio' : null].filter(Boolean).join(', ')}
                </p>
                <p className="gs-item-custo num">
                    <Ico.custo aria-hidden="true" />
                    {r && r.custoUsd != null ? GlobalVar.usdFino(r.custoUsd) : g.custoPrevistoUsd != null ? `${GlobalVar.usdFino(g.custoPrevistoUsd)} previsto` : '—'}
                </p>
                <p className="caminho">geracao-simples/{g.id}/{r && r.caminho ? r.caminho : ''}</p>
                {r && r.erro && <p className="nota-erro"><Ico.erro aria-hidden="true" /><span>{r.erro}</span></p>}
            </div>
        </motion.article>
    );
}

export default function GeracaoSimples({ ativaResp }) {
    const [anexos, setAnexos] = useState([]);
    const [texto, setTexto] = useState('');
    const [catalogo, setCatalogo] = useState(null);
    const [erroCatalogo, setErroCatalogo] = useState('');
    const [modeloId, setModeloId] = useState('');
    const [duracaoS, setDuracaoS] = useState(8);
    const [proporcao, setProporcao] = useState('9:16');
    const [resolucao, setResolucao] = useState('');
    const [audio, setAudio] = useState(false);
    const [mostrarRecusados, setMostrarRecusados] = useState(false);
    const [arrastando, setArrastando] = useState(false);
    const [erroAnexo, setErroAnexo] = useState('');

    const [cotando, setCotando] = useState(false);
    const [cot, setCot] = useState(null);
    const [gerando, setGerando] = useState(false);
    const [progresso, setProgresso] = useState('');
    const [erro, setErro] = useState('');

    const [galeria, setGaleria] = useState(null);
    const [galeriaIndisponivel, setGaleriaIndisponivel] = useState(false);
    const [daSessao, setDaSessao] = useState([]); // gerações feitas aqui (com a prévia local do anexo)
    const entradas = { imagem: useRef(null), video: useRef(null), texto: useRef(null) };
    const vivo = useRef(true);
    const profundidadeArraste = useRef(0); // dragenter/dragleave disparam nos filhos: conta para não piscar

    useEffect(() => {
        vivo.current = true;
        CatalogoVideo().then((r) => {
            if (erroDe(r)) { setErroCatalogo(erroDe(r)); return; }
            setCatalogo(r);
        });
        carregarGaleria();
        return () => { vivo.current = false; };
    }, []);

    // Libera as URLs locais das prévias ao sair.
    const anexosRef = useRef(anexos);
    anexosRef.current = anexos;
    useEffect(() => () => anexosRef.current.forEach((a) => a.url && URL.revokeObjectURL(a.url)), []);

    function carregarGaleria() {
        ListarGeracoesSimples().then((r) => {
            if (!vivo.current) return;
            if (rotaIndisponivel(r)) { setGaleriaIndisponivel(true); setGaleria([]); return; }
            setGaleria(erroDe(r) ? [] : r.geracoes || []);
        });
    }

    const modelos = useMemo(() => (catalogo ? catalogo.modelos || [] : []), [catalogo]);
    const avaliados = useMemo(() => modelos.map((m) => ({ m, motivos: motivosRecusa(m, anexos, proporcao) })), [modelos, anexos, proporcao]);
    const servem = avaliados.filter((x) => !x.motivos.length).map((x) => x.m).sort((a, b) => precoExemplo(a) - precoExemplo(b));
    const recusados = avaliados.filter((x) => x.motivos.length);
    const modelo = servem.find((m) => m.id === modeloId) || null;

    // Mantém um modelo válido escolhido quando o filtro muda.
    useEffect(() => {
        if (!servem.length) { if (modeloId) setModeloId(''); return; }
        if (!servem.some((m) => m.id === modeloId)) {
            const pref = servem.find((m) => m.id === MODELO_PREFERIDO) || servem[0];
            setModeloId(pref.id);
        }
    }, [servem.map((m) => m.id).join('|')]);

    // Ajusta duração/resolução/áudio ao que o modelo aceita.
    useEffect(() => {
        if (!modelo) return;
        const d = modelo.duracoes || [];
        if (d.length && !d.includes(Number(duracaoS))) setDuracaoS(d.includes(8) ? 8 : d.reduce((p, c) => (Math.abs(c - 8) < Math.abs(p - 8) ? c : p), d[0]));
        const rs = modelo.resolucoes || [];
        if (rs.length && !rs.includes(resolucao)) setResolucao(rs.includes('720p') ? '720p' : rs[0]);
        if (!modelo.audio && audio) setAudio(false);
    }, [modelo]);

    async function adicionarArquivos(lista, tipoForcado) {
        setErroAnexo('');
        const novos = [];
        for (const arquivo of Array.from(lista || [])) {
            const tipo = tipoForcado || (arquivo.type.startsWith('image/') ? 'imagem' : arquivo.type.startsWith('video/') ? 'video' : (arquivo.type.startsWith('text/') || /\.txt$/i.test(arquivo.name)) ? 'texto' : null);
            if (!tipo) { setErroAnexo(`"${arquivo.name}" não é imagem, vídeo nem texto.`); continue; }
            if (arquivo.size > LIMITE_MB * 1024 * 1024) { setErroAnexo(`"${arquivo.name}" passa de ${LIMITE_MB} MB.`); continue; }
            const a = { id: proximoId++, tipo, arquivo, nome: arquivo.name, tamanho: arquivo.size };
            if (tipo === 'texto') a.texto = await arquivo.text();
            else a.url = URL.createObjectURL(arquivo);
            novos.push(a);
        }
        setAnexos((atuais) => {
            const todos = [...atuais];
            for (const a of novos) {
                if (a.tipo === 'imagem') {
                    const usados = todos.filter((x) => x.tipo === 'imagem').map((x) => x.papel);
                    a.papel = !usados.includes('primeiro_quadro') ? 'primeiro_quadro' : !usados.includes('ultimo_quadro') ? 'ultimo_quadro' : 'referencia';
                }
                todos.push(a);
            }
            return todos;
        });
        setCot(null);
    }

    function removerAnexo(id) {
        setAnexos((xs) => {
            const a = xs.find((x) => x.id === id);
            if (a && a.url) URL.revokeObjectURL(a.url);
            return xs.filter((x) => x.id !== id);
        });
    }

    const imagens = anexos.filter((a) => a.tipo === 'imagem');
    const misturaQuadroRef = imagens.some((a) => a.papel === 'referencia') && imagens.some((a) => a.papel !== 'referencia');
    const papelRepetido = ['primeiro_quadro', 'ultimo_quadro'].some((p) => imagens.filter((a) => a.papel === p).length > 1);
    const temVideo = anexos.some((a) => a.tipo === 'video');
    const temPedido = Boolean(texto.trim()) || anexos.some((a) => a.tipo === 'texto') || imagens.some((a) => a.papel === 'primeiro_quadro');
    const bloqueio = !modelo ? (temVideo ? 'Vídeo de entrada ainda não é aceito pelo servidor: remova o vídeo para gerar.' : 'Nenhum modelo aceita este pedido.')
        : misturaQuadroRef ? 'Use quadros OU referências: com os dois, o OpenRouter ignora as referências.'
            : papelRepetido ? 'Só pode haver um primeiro quadro e um último quadro.'
                : !temPedido ? 'Escreva o pedido (ou anexe um texto ou um primeiro quadro).' : '';
    const est = modelo ? estimar(modelo, Number(duracaoS), resolucao, audio) : null;

    async function cotar() {
        if (bloqueio) return;
        setCotando(true);
        setErro('');
        try {
            const anexosEnvio = [];
            for (const a of anexos) {
                if (a.tipo === 'texto') anexosEnvio.push({ tipo: 'texto', nome: a.nome, texto: a.texto });
                else if (a.tipo === 'imagem') anexosEnvio.push({ tipo: 'imagem', papel: a.papel, nome: a.nome, base64: await lerComoDataUrl(a.arquivo) });
            }
            const r = await CotarGeracaoSimples({
                tipo: 'video', texto: texto.trim(), anexos: anexosEnvio, modelo: modelo.id,
                duracaoS: Number(duracaoS), proporcao, resolucao: resolucao || undefined, audio,
            });
            if (erroDe(r)) { setErro(erroDe(r)); avisar(`Não consegui cotar: ${erroDe(r)}`, 'erro'); return; }
            setCot(r);
        } catch (e) {
            setErro(`Não consegui ler o anexo: ${e.message}`);
            avisar(`Não consegui ler o anexo: ${e.message}`, 'erro');
        } finally {
            setCotando(false);
        }
    }

    async function acompanhar(jobId) {
        for (let i = 0; i < 120 && vivo.current; i++) {
            await new Promise((ok) => setTimeout(ok, 5000));
            const s = await StatusJob({ jobId });
            if (erroDe(s)) return { erro: erroDe(s) };
            const st = s.job && s.job.status;
            setProgresso(`Gerando… (${st || 'pendente'}, ${(i + 1) * 5} s)`);
            if (st && st !== 'pendente') return s.job;
        }
        return null;
    }

    async function confirmar() {
        if (!cot) return;
        setGerando(true);
        setErro('');
        setProgresso('Enviando o pedido…');
        const r = await GerarGeracaoSimples({ id: cot.id, token: cot.token });
        if (erroDe(r)) { setErro(erroDe(r)); setGerando(false); setProgresso(''); avisar(`Não consegui gerar: ${erroDe(r)}`, 'erro'); return; }
        window.dispatchEvent(new Event('estudio:gasto'));
        const previa = (imagens.find((a) => a.papel === 'primeiro_quadro') || imagens[0] || {}).url || null;
        setDaSessao((xs) => [{ id: r.id, previa, pedido: r.pedido }, ...xs.filter((x) => x.id !== r.id)]);
        setCot(null);
        setGerando(false);
        setProgresso('');
        if (r.job && r.job.status === 'pendente') {
            avisar('Pedido enviado. O vídeo leva alguns minutos.', 'info');
            setProgresso('Gerando… o vídeo leva alguns minutos; pode sair desta tela.');
            const fim = await acompanhar(r.job.jobId);
            setProgresso('');
            if (fim && fim.erro) { setErro(fim.erro); avisar(`Falhou: ${fim.erro}`, 'erro'); }
            else if (fim) {
                setDaSessao((xs) => xs.map((x) => (x.id === r.id && x.pedido ? { ...x, pedido: { ...x.pedido, resultado: { ...(x.pedido.resultado || {}), status: fim.status, custoUsd: fim.custoUsd ?? null } } } : x)));
                if (fim.status === 'pronto') avisar('Vídeo pronto');
                else if (fim.status === 'falhou') avisar('A geração falhou', 'erro');
                else avisar(`Geração terminou: ${fim.status}`, 'info');
            }
        } else {
            const falhou = r.job && r.job.status === 'falhou';
            avisar(falhou ? 'A geração falhou' : 'Vídeo gerado', falhou ? 'erro' : 'ok');
        }
        carregarGaleria();
    }

    const previaDe = (id) => (daSessao.find((x) => x.id === id) || {}).previa || null;
    // Galeria = lista do servidor + o que foi gerado nesta visita (caso a lista ainda não tenha chegado ou a rota falte).
    const doServidor = galeria || [];
    const listaGaleria = [
        ...daSessao.filter((x) => x.pedido && !doServidor.some((g) => g.id === x.id)).map((x) => x.pedido),
        ...doServidor,
    ].filter((g) => g.resultado);
    const cotadasSemGerar = (galeria || []).filter((g) => !g.resultado).length;

    const nomePapel = (id) => (PAPEIS.find((p) => p.id === id) || {}).rotulo;

    return (
        <main className={`tela gs${ativaResp ? ' resp' : ''}`}>
            <div className="tela-cab gs-cab">
                <div>
                    <h1>Geração simples</h1>
                    <p>Um vídeo avulso a partir de um pedido e, se quiser, de imagens ou texto. O custo aparece antes e nada é cobrado sem confirmação.</p>
                </div>
            </div>

            <div className="gs-grade">
                <div className="gs-form">
                    <section className="secao" aria-labelledby="h-anexos">
                        <div className="secao-cab"><h2 id="h-anexos"><Ico.anexo aria-hidden="true" />Anexos</h2><p>Opcional. A prévia fica só no navegador até você cotar.</p></div>
                        <motion.div
                            className={`gs-soltar${arrastando ? ' arrastando' : ''}${anexos.length ? ' com-anexos' : ''}`}
                            animate={{ scale: arrastando ? 1.01 : 1 }}
                            transition={MOV.mola}
                            onDragEnter={(e) => { e.preventDefault(); profundidadeArraste.current += 1; setArrastando(true); }}
                            onDragOver={(e) => { e.preventDefault(); if (!arrastando) setArrastando(true); }}
                            onDragLeave={() => { profundidadeArraste.current = Math.max(0, profundidadeArraste.current - 1); if (!profundidadeArraste.current) setArrastando(false); }}
                            onDrop={(e) => { e.preventDefault(); profundidadeArraste.current = 0; setArrastando(false); adicionarArquivos(e.dataTransfer.files); }}
                        >
                            {anexos.length > 0 && (
                                <ul className="gs-anexos">
                                    <AnimatePresence initial={false}>
                                        {anexos.map((a) => {
                                            const IconeTipo = ICONE_ANEXO[a.tipo] || Ico.anexo;
                                            return (
                                                <motion.li
                                                    key={a.id}
                                                    className="gs-anexo"
                                                    layout
                                                    initial={{ opacity: 0, scale: 0.94 }}
                                                    animate={{ opacity: 1, scale: 1, transition: MOV.mola }}
                                                    exit={{ opacity: 0, scale: 0.94, transition: { duration: MOV.rapido } }}
                                                >
                                                    <div className="gs-anexo-previa">
                                                        {a.tipo === 'imagem' && <img className="foto" src={a.url} alt={`Prévia de ${a.nome}`} />}
                                                        {a.tipo === 'video' && <video src={a.url} muted playsInline controls preload="metadata" />}
                                                        {a.tipo === 'texto' && <pre>{(a.texto || '').slice(0, 280)}</pre>}
                                                    </div>
                                                    <div className="gs-anexo-info">
                                                        <span className="gs-anexo-nome" title={a.nome}>{a.nome}</span>
                                                        <span className="gs-anexo-meta"><IconeTipo aria-hidden="true" />{NOME_ANEXO[a.tipo]}, <span className="num">{tamanhoTexto(a.tamanho)}</span></span>
                                                        {a.tipo === 'imagem' && (
                                                            <label className="gs-papel">
                                                                <span className="sr">Papel de {a.nome}</span>
                                                                <select className="entrada" value={a.papel} onChange={(e) => { const v = e.target.value; setAnexos((xs) => xs.map((x) => (x.id === a.id ? { ...x, papel: v } : x))); setCot(null); }}>
                                                                    {PAPEIS.map((p) => <option key={p.id} value={p.id}>{p.rotulo}</option>)}
                                                                </select>
                                                            </label>
                                                        )}
                                                        {a.tipo === 'video' && <span className="gs-anexo-aviso"><Ico.aviso aria-hidden="true" />Só prévia: o servidor ainda não envia vídeo de entrada.</span>}
                                                        {a.tipo === 'texto' && <span className="gs-anexo-nota">Entra no pedido, depois do seu texto.</span>}
                                                    </div>
                                                    <button
                                                        type="button"
                                                        className="btn fantasma icone mini gs-anexo-remover"
                                                        aria-label={`Remover ${a.nome}`}
                                                        title="Remover"
                                                        onClick={() => { removerAnexo(a.id); setCot(null); }}
                                                    >
                                                        <Ico.fechar aria-hidden="true" />
                                                    </button>
                                                </motion.li>
                                            );
                                        })}
                                    </AnimatePresence>
                                </ul>
                            )}
                            <div className="gs-soltar-chamada">
                                {anexos.length === 0 && (
                                    <motion.span className="gs-soltar-ico" animate={{ y: arrastando ? -4 : 0 }} transition={MOV.mola} aria-hidden="true">
                                        <Ico.upload />
                                    </motion.span>
                                )}
                                <span className="gs-soltar-txt">
                                    {arrastando
                                        ? <strong>Solte para anexar</strong>
                                        : anexos.length
                                            ? <span className="suave">Adicionar mais:</span>
                                            : <><strong>Arraste imagens, um vídeo ou um texto para cá</strong><span className="suave">ou escolha o tipo:</span></>}
                                </span>
                                <div className="gs-soltar-acoes">
                                    <button type="button" className="btn mini" onClick={() => entradas.imagem.current.click()}><Ico.imagem aria-hidden="true" />Imagem</button>
                                    <button type="button" className="btn mini" onClick={() => entradas.video.current.click()}><Ico.video aria-hidden="true" />Vídeo</button>
                                    <button type="button" className="btn mini" onClick={() => entradas.texto.current.click()}><Ico.texto aria-hidden="true" />Texto (.txt)</button>
                                </div>
                            </div>
                            <input ref={entradas.imagem} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => { adicionarArquivos(e.target.files, 'imagem'); e.target.value = ''; }} />
                            <input ref={entradas.video} type="file" accept="video/*" hidden onChange={(e) => { adicionarArquivos(e.target.files, 'video'); e.target.value = ''; }} />
                            <input ref={entradas.texto} type="file" accept=".txt,text/plain" hidden onChange={(e) => { adicionarArquivos(e.target.files, 'texto'); e.target.value = ''; }} />
                        </motion.div>
                        {erroAnexo && <p className="nota-erro gs-nota-bloco" role="alert"><Ico.erro aria-hidden="true" /><span>{erroAnexo}</span></p>}
                    </section>

                    <section className="secao" aria-labelledby="h-pedido">
                        <div className="secao-cab"><h2 id="h-pedido"><Ico.roteiro aria-hidden="true" />Pedido</h2></div>
                        <label className="campo">
                            <span className="sr">Pedido</span>
                            <textarea id="gs-texto" className="entrada" rows={4} value={texto} placeholder="Ex.: câmera lenta se aproxima do farol à noite, mar agitado, luzes da cidade ao fundo." onChange={(e) => { setTexto(e.target.value); setCot(null); }} />
                            <small>Descreva a cena, o movimento de câmera e a luz. Sem falas: o áudio da série vem do módulo de vozes.</small>
                        </label>
                    </section>

                    <section className="secao" aria-labelledby="h-modelo">
                        <div className="secao-cab">
                            <h2 id="h-modelo"><Ico.video aria-hidden="true" />Modelo</h2>
                            <p>
                                {catalogo ? <><span className="num">{servem.length}</span> de <span className="num">{modelos.length}</span> servem para este pedido</> : 'Lendo o catálogo…'}
                                {catalogo && catalogo.simulado ? ' (catálogo de exemplo, modo simulado)' : ''}
                            </p>
                        </div>
                        {erroCatalogo && <p className="nota-erro" role="alert"><Ico.erro aria-hidden="true" /><span>Não consegui ler o catálogo: {erroCatalogo}</span></p>}
                        {!catalogo && !erroCatalogo && <div className="gs-carregando-modelos"><Esqueleto altura={36} /><Esqueleto altura={36} /><Esqueleto altura={36} /></div>}
                        {catalogo && (
                            <>
                                <div className="tabela-wrap gs-modelos" role="radiogroup" aria-labelledby="h-modelo">
                                    <table className="tabela">
                                        <thead>
                                            <tr><th scope="col"><span className="sr">Escolher</span></th><th scope="col">Modelo</th><th scope="col">Durações</th><th scope="col">Quadros</th><th scope="col">Áudio</th><th scope="col" className="num">8 s, 720p</th></tr>
                                        </thead>
                                        <tbody>
                                            {servem.map((m) => (
                                                <tr key={m.id} className={m.id === modeloId ? 'escolhido' : ''} onClick={() => { setModeloId(m.id); setCot(null); }}>
                                                    <td><input type="radio" name="gs-modelo" checked={m.id === modeloId} onChange={() => { setModeloId(m.id); setCot(null); }} aria-label={m.nome} /></td>
                                                    <td><span className="gs-modelo-nome">{m.nome}</span><span className="gs-modelo-id">{m.id}</span></td>
                                                    <td className="num-texto">{faixaDuracoes(m.duracoes)}</td>
                                                    <td>{quadrosDe(m.quadros)}</td>
                                                    <td>{m.audio ? <span className="gs-sim"><Ico.volume aria-hidden="true" />sim</span> : <span className="suave">não</span>}</td>
                                                    <td className="num">{precoExemplo(m) === Infinity ? '—' : GlobalVar.usdFino(precoExemplo(m))}</td>
                                                </tr>
                                            ))}
                                            {servem.length === 0 && <tr><td colSpan={6} className="gs-modelos-vazio"><Ico.aviso aria-hidden="true" />Nenhum modelo serve para este pedido.</td></tr>}
                                        </tbody>
                                    </table>
                                </div>
                                {recusados.length > 0 && (
                                    <div className="gs-recusados">
                                        <button type="button" className="btn fantasma mini gs-recusados-btn" aria-expanded={mostrarRecusados} onClick={() => setMostrarRecusados((v) => !v)}>
                                            <Ico.expandir className={mostrarRecusados ? 'virado' : ''} aria-hidden="true" />
                                            {mostrarRecusados ? 'Esconder' : 'Mostrar'} os {recusados.length} que não servem
                                        </button>
                                        <Expandir aberto={mostrarRecusados}>
                                            <ul>
                                                {recusados.map(({ m, motivos }) => <li key={m.id}><span className="gs-recusado-id">{m.id}</span> <span className="suave">{motivos.join('; ')}</span></li>)}
                                            </ul>
                                        </Expandir>
                                    </div>
                                )}
                            </>
                        )}
                    </section>

                    <section className="secao" aria-labelledby="h-ajustes">
                        <div className="secao-cab"><h2 id="h-ajustes"><Ico.filtro aria-hidden="true" />Ajustes</h2></div>
                        <div className="gs-ajustes">
                            <label className="campo">
                                <span>Duração</span>
                                <select className="entrada" value={duracaoS} disabled={!modelo} onChange={(e) => { setDuracaoS(Number(e.target.value)); setCot(null); }}>
                                    {(modelo && modelo.duracoes ? [...modelo.duracoes].sort((a, b) => a - b) : [duracaoS]).map((d) => <option key={d} value={d}>{d} s</option>)}
                                </select>
                            </label>
                            <fieldset className="campo gs-formato">
                                <legend>Formato</legend>
                                <div className="gs-seg">
                                    {FORMATOS.map((f) => (
                                        <label key={f} className={proporcao === f ? 'ativo' : ''}>
                                            <input type="radio" name="gs-formato" value={f} checked={proporcao === f} onChange={() => { setProporcao(f); setCot(null); }} />
                                            {proporcao === f && <motion.span layoutId="gs-seg-marca" className="gs-seg-marca" transition={MOV.mola} />}
                                            <Proporcao f={f} />
                                            <span className="gs-seg-txt num">{f}</span>
                                        </label>
                                    ))}
                                </div>
                            </fieldset>
                            <label className="campo">
                                <span>Resolução</span>
                                <select className="entrada" value={resolucao} disabled={!modelo || !(modelo.resolucoes || []).length} onChange={(e) => { setResolucao(e.target.value); setCot(null); }}>
                                    {(modelo && modelo.resolucoes ? modelo.resolucoes : ['']).map((r) => <option key={r} value={r}>{r || 'padrão'}</option>)}
                                </select>
                            </label>
                            <label className={`gs-audio${modelo && !modelo.audio ? ' desligado' : ''}`}>
                                <input type="checkbox" checked={audio} disabled={!modelo || !modelo.audio} onChange={(e) => { setAudio(e.target.checked); setCot(null); }} />
                                <span>Gerar áudio{modelo && !modelo.audio ? ' (este modelo não gera)' : ''}</span>
                            </label>
                        </div>
                    </section>
                </div>

                <aside className="gs-resumo painel" aria-labelledby="h-custo">
                    <div className="painel-cab"><h2 id="h-custo"><Ico.custo aria-hidden="true" />Custo e gerar</h2></div>
                    <div className="painel-corpo">
                        <div className="gs-preco">
                            <span className="gs-preco-rot">Custo previsto</span>
                            {est
                                ? <Contador valor={est.usd} formatar={(n) => `≈ ${GlobalVar.usdFino(n)}`} className="gs-preco-valor" />
                                : <span className="gs-preco-valor vazio-valor">—</span>}
                            <small>{est ? (est.mesmaResolucao ? 'Estimativa do catálogo. O valor exato aparece ao cotar.' : `Estimativa em ${est.resolucaoExemplo}; cote para o valor exato em ${resolucao}.`) : 'Escolha um modelo.'}</small>
                        </div>
                        <dl className="gs-resumo-dl">
                            <div><dt><Ico.video aria-hidden="true" />Modelo</dt><dd>{modelo ? modelo.nome : '—'}</dd></div>
                            <div><dt><Ico.duracao aria-hidden="true" />Vídeo</dt><dd className="num">{modelo ? [`${duracaoS} s`, proporcao, resolucao, audio ? 'com áudio' : null].filter(Boolean).join(', ') : '—'}</dd></div>
                            <div><dt><Ico.anexo aria-hidden="true" />Anexos</dt><dd>{anexos.length ? anexos.map((a) => (a.tipo === 'imagem' ? nomePapel(a.papel) : a.tipo === 'video' ? 'vídeo (só prévia)' : 'texto')).join(', ') : 'nenhum'}</dd></div>
                        </dl>
                        <AnimatePresence initial={false}>
                            {bloqueio && (
                                <motion.p key="bloqueio" className="nota-aviso gs-nota-bloco" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: MOV.rapido }}>
                                    <Ico.aviso aria-hidden="true" /><span>{bloqueio}</span>
                                </motion.p>
                            )}
                        </AnimatePresence>
                        {erro && !cot && <p className="nota-erro gs-nota-bloco" role="alert"><Ico.erro aria-hidden="true" /><span>{erro}</span></p>}
                        <button type="button" className="btn primario gs-cotar" disabled={Boolean(bloqueio) || cotando || gerando} onClick={cotar} aria-busy={cotando}>
                            {cotando && <Girador />}
                            <Ico.custo aria-hidden="true" />
                            <span>{cotando ? 'Cotando…' : 'Ver custo e gerar'}</span>
                        </button>
                        {progresso && !cot && <p className="gs-progresso" aria-live="polite"><span className="gs-ponto-sinal" aria-hidden="true" />{progresso}</p>}
                        <p className="gs-nota"><Ico.info aria-hidden="true" /><span>Cotar não cobra nada: grava o pedido em <code>geracao-simples/</code> e mostra o valor exato para você confirmar.</span></p>
                    </div>
                </aside>
            </div>

            <section className="secao gs-galeria" aria-labelledby="h-galeria">
                <div className="secao-cab">
                    <h2 id="h-galeria">Resultados</h2>
                    <p>
                        {galeria === null ? 'Carregando…' : `${listaGaleria.length} ${listaGaleria.length === 1 ? 'geração' : 'gerações'}`}
                        {cotadasSemGerar > 0 ? `, ${cotadasSemGerar} ${cotadasSemGerar === 1 ? 'cotação não gerada' : 'cotações não geradas'}` : ''}
                    </p>
                </div>
                {galeriaIndisponivel && <p className="nota-aviso gs-nota-bloco"><Ico.aviso aria-hidden="true" /><span>A lista completa está indisponível: a rota ListarGeracoesSimples ainda não foi registrada no servidor. Aparecem só as gerações feitas agora.</span></p>}
                {galeria === null && (
                    <div className="gs-galeria-grade" aria-hidden="true">
                        {[0, 1, 2].map((i) => <Esqueleto key={i} altura="auto" className="gs-esq-item" />)}
                    </div>
                )}
                {galeria !== null && listaGaleria.length === 0 && (
                    <div className="gs-galeria-vazia">
                        <Vazio icone={Ico.video} titulo="Nada gerado ainda" texto="Escreva o pedido, veja o custo e confirme. O vídeo aparece aqui assim que ficar pronto." />
                    </div>
                )}
                {listaGaleria.length > 0 && (
                    <div className="gs-galeria-grade">
                        {listaGaleria.map((g) => <ItemGaleria key={g.id} g={g} previaLocal={previaDe(g.id)} />)}
                    </div>
                )}
            </section>

            <ConfirmarCusto
                aberto={Boolean(cot)}
                titulo="Gerar vídeo avulso"
                descricao={cot ? `${cot.nomeModelo || cot.modelo} · ${cot.parametros ? `${cot.parametros.duracaoS} s · ${cot.parametros.proporcao || ''} · ${cot.parametros.resolucao || ''}` : ''}` : ''}
                itens={cot ? (Array.isArray(cot.detalhe) && cot.detalhe.length
                    ? cot.detalhe.map((d) => ({ descricao: d.item, usd: d.usd }))
                    : [{ descricao: 'Vídeo', usd: cot.custoPrevistoUsd }]) : []}
                totalUsd={cot ? cot.custoPrevistoUsd : 0}
                estimativa={cot ? cot.estimativa : false}
                teto={cot && cot.orcamento && cot.orcamento.tetos && cot.orcamento.tetos.plano != null ? { rotulo: 'Teto por geração', tetoUsd: cot.orcamento.tetos.plano, gastoUsd: 0 } : undefined}
                avisos={cot ? cot.avisos || [] : []}
                simulado={cot ? cot.simulado : false}
                arquivos={cot ? [`geracao-simples/${cot.id}/resultado.mp4`] : []}
                ocupado={gerando}
                progresso={progresso}
                erro={erro}
                onCancelar={() => { setCot(null); setErro(''); }}
                onConfirmar={confirmar}
            />
        </main>
    );
}
