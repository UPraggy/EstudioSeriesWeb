// INSPETOR (direita): o item selecionado. Vídeo → segmento + plano (prompt, âncoras, quadro-chave, modelo, takes);
// fala → quem, voz, intenção, tom, velocidade, texto falado/exibido, ouvir e regerar; texto, legenda, A/B, ambiente;
// sem seleção → resumo do episódio. Seções recolhíveis (lembradas entre sessões) e troca de conteúdo animada.
import { useEffect, useRef, useState } from 'react';
import '../../assets/css/MesaInspetor.css';
import * as M from './mesaUtil';
import { useCatalogo } from './mesaMidia';
import { useTempo } from './mesaRelogio';
import MesaMiniatura from './MesaMiniatura';
import { ExtrairQuadro, RegerarFala, RegerarLegenda } from '../funcionalidades/bancoGet';
import { erroDe } from '../funcionalidades/fetchFunc';
import GlobalVar from '../subComponents/GlobalVar';
import { Ico } from '../subComponents/icones';
import { Expandir, Trocar, Girador, Contador, Lista, Item } from '../subComponents/Movimento';

function Campo({ rotulo, valor, onSalvar, multilinha = false, linhas = 3, placeholder, dica, mono = false }) {
    const [v, setV] = useState(valor ?? '');
    useEffect(() => { setV(valor ?? ''); }, [valor]);
    const salvar = () => { if (String(v) !== String(valor ?? '')) onSalvar(v); };
    return (
        <label className="in-campo">
            <span className="in-rotulo">{rotulo}</span>
            {multilinha
                ? <textarea rows={linhas} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={salvar} />
                : <input className={mono ? 'mono' : ''} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={salvar} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />}
            {dica && <span className="in-dica">{dica}</span>}
        </label>
    );
}

function CampoNumero({ rotulo, valor, onSalvar, passo = 0.01, min = 0, sufixo = 's' }) {
    const [v, setV] = useState(valor === null || valor === undefined ? '' : String(M.arred(valor, 3)).replace('.', ','));
    useEffect(() => { setV(valor === null || valor === undefined ? '' : String(M.arred(valor, 3)).replace('.', ',')); }, [valor]);
    const salvar = () => {
        const n = Number(String(v).replace(',', '.'));
        if (Number.isFinite(n) && Math.abs(n - Number(valor)) > 1e-6) onSalvar(Math.max(min, n));
        else setV(String(M.arred(valor, 3)).replace('.', ','));
    };
    return (
        <label className="in-campo in-num" title="Setas ↑ ↓ mudam o valor (Shift: 10×)">
            <span className="in-rotulo">{rotulo}</span>
            <span className="in-num-caixa">
                <input className="num" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} onBlur={salvar}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                            e.preventDefault();
                            const n = Number(String(v).replace(',', '.')) + (e.key === 'ArrowUp' ? passo : -passo) * (e.shiftKey ? 10 : 1);
                            onSalvar(Math.max(min, M.arred(n, 3)));
                        }
                    }}
                />
                <span className="in-sufixo">{sufixo}</span>
            </span>
        </label>
    );
}

// Seção recolhível: o título é um botão; aberto/fechado fica lembrado por seção (localStorage).
const CHAVE_SECOES = 'mesa.inspetor.secoes';
function Secao({ id, titulo, icone: Icone, children, direita, inicial = true }) {
    const [aberto, setAberto] = useState(() => {
        const s = GlobalVar.getLocalStorage(CHAVE_SECOES, {});
        return id && s && typeof s[id] === 'boolean' ? s[id] : inicial;
    });
    const trocar = () => {
        const novo = !aberto;
        setAberto(novo);
        if (id) GlobalVar.setLocalStorage(CHAVE_SECOES, { ...(GlobalVar.getLocalStorage(CHAVE_SECOES, {}) || {}), [id]: novo });
    };
    return (
        <section className={`in-secao ${aberto ? 'aberta' : ''}`}>
            <header className="in-secao-cab">
                <button type="button" className="in-secao-botao" aria-expanded={aberto} onClick={trocar}>
                    <Ico.expandir className="in-secao-seta" aria-hidden="true" />
                    {Icone && <Icone className="in-secao-ico" aria-hidden="true" />}
                    <h3>{titulo}</h3>
                </button>
                {direita && <span className="in-secao-dir">{direita}</span>}
            </header>
            <Expandir aberto={aberto}>
                <div className="in-secao-corpo">{children}</div>
            </Expandir>
        </section>
    );
}

// Estado de uma regeração: ícone + texto (gerando = ponto vivo vermelho)
function EstadoRegeracao({ r }) {
    if (r.status === 'pronto') return <span className="estado-in ok"><Ico.ok aria-hidden="true" />Pronto</span>;
    if (r.status === 'falhou') return <span className="estado-in perigo"><Ico.erro aria-hidden="true" />Falhou</span>;
    if (r.status === 'gerando') return <span className="estado vivo">Gerando</span>;
    return <span className="estado-in"><Ico.relogio aria-hidden="true" />{r.status}</span>;
}

// ---------------------------------------------------------------- plano
function InspetorPlano({ serie, doc, ctx, n, relogio, mudarPlano, aplicar, mostrarAviso }) {
    const cat = useCatalogo();
    const plano = (doc.planos || []).find((p) => p.n === n);
    const [sobre, setSobre] = useState(false);
    const [pegando, setPegando] = useState(false);
    if (!plano) return null;
    const lim = M.limitesPlanos(doc).find((l) => l.n === n) || plano;
    const fichas = [...(ctx.acervo.elenco || []), ...(ctx.acervo.locais || []), ...(ctx.acervo.objetos || [])];
    const ancoras = (plano.ancoras || []).map((id) => fichas.find((f) => f.id === id)).filter(Boolean);
    const takes = ((ctx.mesa && ctx.mesa.takes) || {})[String(n)] || [];
    const emUso = new Set((doc.faixas.video || []).map((v) => v.take).filter(Boolean));
    const regs = ((ctx.mesa && ctx.mesa.regeracoes) || []).filter((r) => r.plano === n && r.status !== 'cotado');
    const modelos = cat ? cat.modelos.filter((m) => (m.quadros || []).includes('first_frame') && (m.proporcoes || []).includes('9:16')) : [];

    const usarTake = (t) => {
        const d = M.clonar(doc);
        const de = t.deS !== undefined && t.deS !== null ? t.deS : lim.deS;
        const ate = t.ateS !== undefined && t.ateS !== null ? t.ateS : lim.ateS;
        const item = { id: M.novoId('v'), plano: n, arquivo: t.arquivo, inicioS: M.arred(de), duracaoS: M.arred(ate - de), entradaS: 0, duracaoArquivoS: t.duracaoS, origem: 'take', take: t.id, mudo: true, volume: 0.6, descricao: t.instrucao || `Take ${t.id}` };
        d.faixas.video = M.sobrescreverVideo(d.faixas.video, item);
        aplicar(d);
    };
    const quadroDoCursor = async () => {
        const t = relogio.agora();
        const p = M.linhaDeVideo(doc).find((x) => t >= x.inicioS && t < x.inicioS + x.duracaoS);
        if (!p || !p.arquivo) return mostrarAviso('Não há vídeo no cursor.', 'aviso');
        setPegando(true);
        const r = await ExtrairQuadro({ serie, caminho: p.arquivo, tS: p.entradaS + (t - p.inicioS) });
        setPegando(false);
        if (erroDe(r)) return mostrarAviso(erroDe(r), 'erro');
        mudarPlano(n, { quadroChave: { arquivo: r.arquivo, origem: 'quadro_do_cursor', tS: M.arred(t) } });
        return null;
    };
    const soltarQuadro = (e) => {
        setSobre(false);
        let d;
        try { d = JSON.parse(e.dataTransfer.getData('application/x-mesa')); } catch { return; }
        if (!d || !M.ehImagem(d.arquivo)) return mostrarAviso('Solte uma imagem de referência (elenco ou local).', 'aviso');
        e.preventDefault();
        mudarPlano(n, { quadroChave: { arquivo: d.arquivo, origem: 'ref' } });
        return null;
    };

    return (
        <>
            <Secao id="plano" titulo={`Plano ${n}`} icone={Ico.decupagem} direita={<span className="in-tempo num">{M.fmtTempo(lim.deS, 2)} – {M.fmtTempo(lim.ateS, 2)}</span>}>
                <div className="in-linha2">
                    <label className="in-campo">
                        <span className="in-rotulo">Tipo</span>
                        <select value={plano.tipo} onChange={(e) => mudarPlano(n, { tipo: e.target.value })}>
                            <option value="video_ia">Vídeo IA</option>
                            <option value="apresentador">Apresentador</option>
                            <option value="grafico">Gráfico</option>
                            <option value="reaproveitar">Reaproveitar take</option>
                        </select>
                    </label>
                    <div className="in-campo">
                        <span className="in-rotulo">Duração</span>
                        <span className="in-valor num">{M.fmtS(lim.ateS - lim.deS, 2)}</span>
                        {plano.duracaoAudioS ? <span className="in-dica">as falas pedem {M.fmtS(plano.duracaoAudioS, 2)}</span> : null}
                    </div>
                </div>
                {[plano.local, ...(plano.elenco || []), ...(plano.objetos || [])].filter(Boolean).length > 0 && (
                    <div className="in-chips">
                        {[plano.local, ...(plano.elenco || []), ...(plano.objetos || [])].filter(Boolean).map((id) => {
                            const f = fichas.find((x) => x.id === id);
                            const IcoFicha = id === plano.local ? Ico.local : (plano.objetos || []).includes(id) ? Ico.objeto : Ico.personagem;
                            return <span key={id} className="in-chip" title={f ? f.ancora : ''}><IcoFicha aria-hidden="true" />{f ? f.nome : id}</span>;
                        })}
                    </div>
                )}
                <Campo rotulo="Prompt do plano" valor={plano.prompt} multilinha linhas={4} onSalvar={(v) => mudarPlano(n, { prompt: v })} />
                {ancoras.length > 0 && (
                    <div className="in-ancoras">
                        <span className="in-rotulo">Âncoras das fichas (vão junto no pedido)</span>
                        {ancoras.map((a) => <p key={a.id}><b>{a.nome}:</b> {a.ancora}</p>)}
                    </div>
                )}
                <div
                    className={`in-quadro ${sobre ? 'sobre' : ''}`}
                    onDragOver={(e) => { if (Array.from(e.dataTransfer.types || []).includes('application/x-mesa')) { e.preventDefault(); setSobre(true); } }}
                    onDragLeave={() => setSobre(false)} onDrop={soltarQuadro}
                >
                    <span className="in-rotulo"><Ico.quadroChave aria-hidden="true" />Quadro-chave</span>
                    {plano.quadroChave && plano.quadroChave.arquivo ? (
                        <div className="in-quadro-img">
                            <img src={M.midiaUrl(serie, plano.quadroChave.arquivo)} alt="Quadro-chave do plano" />
                            <div>
                                <span className="in-dica">{plano.quadroChave.origem === 'ref' ? 'Da referência' : 'Do vídeo no cursor'}</span>
                                <button type="button" className="btn mini fantasma" onClick={() => mudarPlano(n, { quadroChave: null })}><Ico.fechar aria-hidden="true" />Tirar</button>
                            </div>
                        </div>
                    ) : <p className="in-dica">Arraste uma referência do acervo para cá, ou use o quadro do cursor.</p>}
                    <button type="button" className="btn mini" onClick={quadroDoCursor} aria-busy={pegando} disabled={pegando}>
                        {pegando && <Girador />}<Ico.camera aria-hidden="true" />Usar o quadro do cursor
                    </button>
                </div>
                <label className="in-campo">
                    <span className="in-rotulo">Modelo de vídeo</span>
                    <select value={plano.modelo || ''} onChange={(e) => mudarPlano(n, { modelo: e.target.value || null })}>
                        <option value="">Padrão da série</option>
                        {plano.modelo && !modelos.some((m) => m.id === plano.modelo) && <option value={plano.modelo}>{plano.modelo}</option>}
                        {modelos.map((m) => (
                            <option key={m.id} value={m.id}>
                                {m.nome} · {(m.duracoes || []).length ? `${m.duracoes[0]}–${m.duracoes.at(-1)} s` : 's livre'}{m.precoExemplo && m.precoExemplo.semAudioUsd !== undefined ? ` · ${M.fmtUsd(m.precoExemplo.semAudioUsd)}/${m.precoExemplo.duracaoS} s` : ''}
                            </option>
                        ))}
                    </select>
                </label>
            </Secao>
            <Secao id="takes" titulo="Takes do plano" icone={Ico.camera} direita={<span className="in-contagem num">{takes.length}</span>}>
                {takes.length === 0 ? (
                    <p className="in-vazio"><Ico.regerarTrecho aria-hidden="true" />Nenhum take gerado. O plano usa clipes do acervo. Arraste na régua para marcar um trecho e regerar só aquele pedaço.</p>
                ) : (
                    <Lista as="ul" className="in-takes">
                        {takes.map((t) => {
                            const uso = emUso.has(t.id);
                            return (
                                <Item as="li" key={t.id} className={uso ? 'uso' : ''}>
                                    <button
                                        type="button" className="in-take" onClick={() => usarTake(t)} aria-pressed={uso}
                                        title={`${t.instrucao || 'Sem instrução'}\n${M.fmtTempo(t.deS, 1)}–${M.fmtTempo(t.ateS, 1)} · ${t.modelo || ''}\n${uso ? 'Em uso na edição' : 'Clique para usar este take no plano'}`}
                                    >
                                        <MesaMiniatura serie={serie} arquivo={t.arquivo} duracaoS={t.duracaoS} rotulo={`Take ${t.id}`} mostrarDuracao>
                                            {uso && <span className="in-take-uso"><Ico.ok aria-hidden="true" />Em uso</span>}
                                        </MesaMiniatura>
                                    </button>
                                    <span className="in-take-nome">
                                        {String(t.id).replace('_', ' ')}
                                        {t.simulado && <Ico.simulado className="in-take-sim" aria-label="Simulado" />}
                                    </span>
                                </Item>
                            );
                        })}
                    </Lista>
                )}
                {regs.length > 0 && (
                    <ul className="in-regs">
                        {regs.slice(-5).reverse().map((r) => (
                            <li key={r.id}>
                                <EstadoRegeracao r={r} />
                                <span className="in-regs-txt"><span className="num">{M.fmtTempo(r.deS, 1)}–{M.fmtTempo(r.ateS, 1)}</span> · {r.instrucao || 'sem instrução'}{r.erro ? ` · ${r.erro}` : ''}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </Secao>
        </>
    );
}

// palavras da fala: a que está sendo dita acende enquanto a prévia toca; clique leva o cursor até ela
function Palavras({ palavras, relogio, fim }) {
    const { t } = useTempo(relogio);
    let ativa = -1;
    for (let i = 0; i < palavras.length; i++) {
        const prox = i + 1 < palavras.length ? palavras[i + 1].t : fim;
        if (t >= palavras[i].t - 1e-3 && t < prox) { ativa = i; break; }
    }
    return (
        <div className="in-palavras" role="group" aria-label="Palavras da fala (clique para ir)">
            {palavras.map((w, i) => (
                <button key={i} type="button" className={i === ativa ? 'ativa' : ''} onClick={() => relogio.ir(w.t)} title={M.fmtTempo(w.t, 2)}>{w.texto}</button>
            ))}
        </div>
    );
}

// ---------------------------------------------------------------- fala
function InspetorFala({ serie, ep, item, intencoes, relogio, mudarItem, salvarAgora, receberDoServidor, mostrarAviso, destacar }) {
    const [form, setForm] = useState({});
    const [ocupado, setOcupado] = useState(null);
    const [avisos, setAvisos] = useState([]);
    const [ouvindo, setOuvindo] = useState(false);
    const formRef = useRef(null);
    const audioRef = useRef(null);
    const pararRef = useRef(null);
    useEffect(() => {
        setForm({ intencao: item.intencao || '', tom: '', velocidade: '', texto: item.texto || '', textoFalado: item.textoFalado && item.textoFalado !== item.texto ? item.textoFalado : '' });
        setAvisos([]);
    }, [item.id, item.arquivo, item.texto, item.intencao, item.textoFalado]);
    useEffect(() => { if (destacar && formRef.current) formRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [destacar]);
    useEffect(() => () => { clearInterval(pararRef.current); if (audioRef.current) audioRef.current.pause(); }, []);
    const voz = intencoes && intencoes.vozes ? intencoes.vozes.find((v) => v.id === item.voz) : null;
    const palavras = M.palavrasAbsolutas(item);

    const ouvir = () => {
        if (!item.arquivo) return;
        if (!audioRef.current) audioRef.current = new Audio();
        const a = audioRef.current;
        clearInterval(pararRef.current);
        if (!a.paused) { a.pause(); setOuvindo(false); return; }
        a.src = M.midiaUrl(serie, item.arquivo);
        a.currentTime = Number(item.entradaS) || 0;
        a.onended = () => setOuvindo(false);
        a.play().then(() => setOuvindo(true)).catch(() => setOuvindo(false));
        pararRef.current = setInterval(() => {
            if (a.currentTime >= (Number(item.entradaS) || 0) + item.duracaoS) { a.pause(); setOuvindo(false); clearInterval(pararRef.current); }
        }, 50);
    };
    const regerar = async () => {
        setOcupado('fala');
        await salvarAgora();
        const r = await RegerarFala({
            serie, ep, id: item.id, intencao: form.intencao || undefined, tom: form.tom || undefined, velocidade: form.velocidade || undefined,
            texto: form.texto !== item.texto ? form.texto : undefined, textoFalado: form.textoFalado || undefined,
        });
        setOcupado(null);
        if (erroDe(r)) return mostrarAviso(erroDe(r), 'erro');
        setAvisos(r.avisos || []);
        await receberDoServidor(r);
        mostrarAviso(`Fala regerada (${M.fmtS(r.fala.duracaoS, 2)}${r.delta ? `, ${r.delta > 0 ? '+' : ''}${M.fmtS(r.delta, 2)}` : ''}). A legenda acompanhou.`, 'ok');
        return null;
    };
    const soLegenda = async () => {
        if (form.texto === item.texto) return;
        setOcupado('legenda');
        mudarItem({ texto: form.texto });
        await salvarAgora();
        const r = await RegerarLegenda({ serie, ep, deS: item.inicioS, ateS: item.inicioS + item.duracaoS });
        setOcupado(null);
        if (erroDe(r)) return mostrarAviso(erroDe(r), 'erro');
        await receberDoServidor(r);
        mostrarAviso('Legenda refeita com o texto novo (o áudio não mudou).', 'ok');
        return null;
    };

    return (
        <>
            <Secao id="fala" titulo={M.nomeDe(item.quem)} icone={Ico.voz} direita={<span className="in-amostra" style={{ background: M.corDe(item.quem) }} aria-hidden="true" />}>
                <div className="in-linha2">
                    <div className="in-campo"><span className="in-rotulo">Voz</span><span className="in-valor">{voz ? voz.nome : item.voz || '—'}</span><span className="in-dica">A mesma ao regerar</span></div>
                    <div className="in-campo">
                        <span className="in-rotulo">Via</span><span className="in-valor">{item.via || '—'}</span>
                        {item.status === 'sem_audio' && <span className="estado-in aviso"><Ico.aviso aria-hidden="true" />Sem áudio</span>}
                    </div>
                </div>
                <div className="in-linha2">
                    <CampoNumero rotulo="Início" valor={item.inicioS} onSalvar={(v) => mudarItem({ inicioS: v })} />
                    <CampoNumero rotulo="Duração" valor={item.duracaoS} onSalvar={(v) => mudarItem({ duracaoS: Math.min(v, Number(item.duracaoArquivoS) - (Number(item.entradaS) || 0) || v) })} />
                </div>
                <div className="in-acoes">
                    <button type="button" className={`btn mini ${ouvindo ? 'ligado' : ''}`} onClick={ouvir} disabled={!item.arquivo} aria-pressed={ouvindo}>
                        {ouvindo ? <Ico.pausar aria-hidden="true" /> : <Ico.ouvir aria-hidden="true" />}{ouvindo ? 'Parar' : 'Ouvir'}
                    </button>
                    <button type="button" className="btn mini" onClick={() => relogio.ir(item.inicioS)}><Ico.irCursor aria-hidden="true" />Ir para a fala</button>
                    <button type="button" className={`btn mini ${item.mudo ? 'ligado' : ''}`} aria-pressed={Boolean(item.mudo)} onClick={() => mudarItem({ mudo: !item.mudo })}>
                        {item.mudo ? <Ico.mudo aria-hidden="true" /> : <Ico.volume aria-hidden="true" />}{item.mudo ? 'Mudo' : 'Som ligado'}
                    </button>
                </div>
                {palavras.length > 0 && <Palavras palavras={palavras} relogio={relogio} fim={M.fimDe(item)} />}
            </Secao>
            <Secao id="regerarFala" titulo="Regerar esta fala" icone={Ico.regerar} direita={<span className="in-dica">TTS grátis</span>}>
                <div ref={formRef} className={`in-form ${destacar ? 'in-destaque' : ''}`}>
                    <label className="in-campo">
                        <span className="in-rotulo">Intenção</span>
                        <select value={form.intencao || ''} onChange={(e) => setForm({ ...form, intencao: e.target.value })}>
                            {!intencoes && <option value={item.intencao || ''}>{item.intencao || '—'}</option>}
                            {intencoes && intencoes.intencoes.map((i) => <option key={i.id} value={i.id}>{i.nome || i.id}</option>)}
                        </select>
                    </label>
                    <div className="in-linha2">
                        <label className="in-campo"><span className="in-rotulo">Tom</span><input className="num" placeholder={item.tom || '+0Hz'} value={form.tom || ''} onChange={(e) => setForm({ ...form, tom: e.target.value })} /></label>
                        <label className="in-campo"><span className="in-rotulo">Velocidade</span><input className="num" placeholder={item.velocidade || '+0%'} value={form.velocidade || ''} onChange={(e) => setForm({ ...form, velocidade: e.target.value })} /></label>
                    </div>
                    <span className="in-dica">Tom e velocidade em branco seguem a intenção; preenchidos, valem como estão (ex.: −3Hz, +8%).</span>
                    <label className="in-campo">
                        <span className="in-rotulo">Texto exibido (legenda)</span>
                        <textarea rows={3} value={form.texto || ''} onChange={(e) => setForm({ ...form, texto: e.target.value })} />
                    </label>
                    <label className="in-campo">
                        <span className="in-rotulo">Texto falado (opcional)</span>
                        <textarea rows={2} placeholder="Igual ao exibido (com o dicionário de pronúncia)" value={form.textoFalado || ''} onChange={(e) => setForm({ ...form, textoFalado: e.target.value })} />
                    </label>
                    <div className="in-acoes">
                        <button type="button" className="btn mini primario" aria-busy={ocupado === 'fala'} disabled={Boolean(ocupado)} onClick={regerar}>
                            {ocupado === 'fala' && <Girador />}<Ico.regerar className="ico-girar" aria-hidden="true" />Regerar fala
                        </button>
                        <button type="button" className="btn mini" aria-busy={ocupado === 'legenda'} disabled={Boolean(ocupado) || form.texto === item.texto} onClick={soLegenda}>
                            {ocupado === 'legenda' && <Girador />}<Ico.legenda aria-hidden="true" />Só a legenda
                        </button>
                    </div>
                    {avisos.map((a, i) => <p key={i} className="nota-aviso in-nota"><Ico.aviso aria-hidden="true" />{a}</p>)}
                </div>
            </Secao>
        </>
    );
}

// ---------------------------------------------------------------- outros itens
function InspetorVideo({ item, mudarItem }) {
    const origem = { take: 'Take gerado', acervo: 'Do acervo', quadro: 'Imagem parada' }[item.origem || 'acervo'] || item.origem;
    return (
        <Secao id="segmento" titulo="Segmento de vídeo" icone={Ico.video} direita={<span className="in-dica">{origem}</span>}>
            <p className="in-arquivo" title={item.arquivo}>{M.nomeArquivo(item.arquivo)}</p>
            <div className="in-linha3">
                <CampoNumero rotulo="Início" valor={item.inicioS} onSalvar={(v) => mudarItem({ inicioS: v }, true)} />
                <CampoNumero rotulo="Duração" valor={item.duracaoS} onSalvar={(v) => mudarItem({ duracaoS: item.duracaoArquivoS ? Math.min(v, item.duracaoArquivoS - (item.entradaS || 0)) : v }, true)} />
                <CampoNumero rotulo="Entrada" valor={item.entradaS || 0} onSalvar={(v) => mudarItem({ entradaS: item.duracaoArquivoS ? Math.min(v, item.duracaoArquivoS - item.duracaoS) : v })} />
            </div>
            <div className="in-volume">
                <button
                    type="button" className={`btn mini icone ${item.mudo ? 'ligado' : ''}`} aria-pressed={Boolean(item.mudo)} onClick={() => mudarItem({ mudo: !item.mudo })}
                    title={item.mudo ? 'Som do clipe mudo (clique para ligar)' : 'Deixar o som do clipe mudo'} aria-label="Som do clipe mudo"
                >
                    {item.mudo ? <Ico.mudo aria-hidden="true" /> : <Ico.volume aria-hidden="true" />}
                </button>
                <input type="range" min="0" max="1" step="0.05" value={Number(item.volume ?? 0.6)} disabled={item.mudo} onChange={(e) => mudarItem({ volume: Number(e.target.value) })} aria-label="Volume do som do clipe" />
                <span className="num">{Math.round(Number(item.volume ?? 0.6) * 100)}%</span>
            </div>
        </Secao>
    );
}

function InspetorTexto({ item, mudarItem }) {
    return (
        <Secao id="texto" titulo="Texto de tela" icone={Ico.texto} direita={<span className="in-dica">Na zona segura</span>}>
            <Campo rotulo="Texto" valor={item.texto} onSalvar={(v) => mudarItem({ texto: v })} />
            <div className="in-linha2">
                <CampoNumero rotulo="Início" valor={item.inicioS} onSalvar={(v) => mudarItem({ inicioS: v })} />
                <CampoNumero rotulo="Duração" valor={item.duracaoS} onSalvar={(v) => mudarItem({ duracaoS: Math.max(0.2, v) })} />
            </div>
        </Secao>
    );
}

function InspetorLegenda({ item, doc, aplicar }) {
    const mudar = (campos) => {
        const d = M.clonar(doc);
        d.legenda = d.legenda.map((b) => (b.id === item.id ? { ...b, ...campos, manual: true } : b));
        aplicar(d);
    };
    return (
        <Secao
            id="legenda" titulo="Bloco de legenda" icone={Ico.legenda}
            direita={item.manual ? <span className="estado-in aviso"><Ico.editar aria-hidden="true" />Editado</span> : <span className="in-dica">Do TTS</span>}
        >
            {[0, 1].map((k) => (
                <Campo key={k} rotulo={`Linha ${k + 1}`} valor={(item.linhas || [])[k] || ''} onSalvar={(v) => {
                    const linhas = [...(item.linhas || [])];
                    linhas[k] = v;
                    mudar({ linhas: linhas.filter((x, i) => x || i === 0) });
                }} />
            ))}
            <div className="in-linha2">
                <CampoNumero rotulo="Entra" valor={item.ini} onSalvar={(v) => mudar({ ini: v })} />
                <CampoNumero rotulo="Sai" valor={item.fim} onSalvar={(v) => mudar({ fim: Math.max(item.ini + 0.2, v) })} />
            </div>
            <p className="in-dica">“Regerar legenda” no trecho volta ao texto e aos tempos do TTS.</p>
        </Secao>
    );
}

function InspetorAB({ item, mudarItem }) {
    return (
        <Secao id="ab" titulo="Cartões A / B" icone={Ico.escolha} direita={<span className="in-dica">A escolha do público</span>}>
            {['A', 'B'].map((k) => (
                <div key={k} className="in-ab">
                    <span className="in-ab-letra" aria-hidden="true">{k}</span>
                    <div className="in-ab-campos">
                        <Campo rotulo={`${k}: texto`} valor={item[k] ? item[k].texto : ''} onSalvar={(v) => mudarItem({ [k]: { ...(item[k] || {}), texto: v } })} />
                        <Campo rotulo={`${k}: detalhe`} valor={item[k] ? item[k].detalhe : ''} onSalvar={(v) => mudarItem({ [k]: { ...(item[k] || {}), detalhe: v } })} />
                    </div>
                </div>
            ))}
            <div className="in-linha2">
                <CampoNumero rotulo="Início" valor={item.inicioS} onSalvar={(v) => mudarItem({ inicioS: v })} />
                <CampoNumero rotulo="Duração" valor={item.duracaoS} onSalvar={(v) => mudarItem({ duracaoS: Math.max(1, v) })} />
            </div>
        </Secao>
    );
}

function InspetorAmbiente({ item, mudarItem }) {
    return (
        <Secao id="ambiente" titulo="Ambiente" icone={Ico.ambiente} direita={<span className="in-dica">{item.tipo === 'sintetico' ? 'Sintético' : 'Arquivo'}</span>}>
            <p className="in-dica">{item.nome || 'Cama de ambiente'}: abaixa sozinha quando alguém fala.</p>
            <div className="in-volume">
                <button
                    type="button" className={`btn mini icone ${item.mudo ? 'ligado' : ''}`} aria-pressed={Boolean(item.mudo)} onClick={() => mudarItem({ mudo: !item.mudo })}
                    title={item.mudo ? 'Ambiente mudo (clique para ligar)' : 'Deixar o ambiente mudo'} aria-label="Ambiente mudo"
                >
                    {item.mudo ? <Ico.mudo aria-hidden="true" /> : <Ico.volume aria-hidden="true" />}
                </button>
                <input type="range" min="0" max="0.5" step="0.01" value={Number(item.volume) || 0} onChange={(e) => mudarItem({ volume: Number(e.target.value) })} aria-label="Volume do ambiente" />
                <span className="num">{Math.round((Number(item.volume) || 0) * 100)}%</span>
            </div>
        </Secao>
    );
}

function InspetorEpisodio({ doc, ctx, relogio, setSelecao, montarInicial }) {
    const lim = M.limitesPlanos(doc);
    const regs = ((ctx.mesa && ctx.mesa.regeracoes) || []).filter((r) => r.status !== 'cotado');
    const falas = M.FAIXAS_AUDIO.flatMap((f) => doc.faixas[f] || []);
    const semAudio = falas.filter((f) => !f.arquivo).length;
    const duracao = M.duracaoDoc(doc);
    const alvo = M.alvoDe(doc);
    const takes = Object.values((ctx.mesa && ctx.mesa.takes) || {}).reduce((s, l) => s + (l || []).length, 0);
    return (
        <>
            <div className="in-numeros">
                <div className="in-numero">
                    <Contador valor={duracao} formatar={(v) => M.fmtS(v, 1)} className="in-numero-valor" />
                    <span className="in-numero-rotulo">de {M.fmtS(alvo, alvo < 10 ? 1 : 0)}</span>
                </div>
                <div className="in-numero">
                    <Contador valor={lim.length} className="in-numero-valor" />
                    <span className="in-numero-rotulo">{lim.length === 1 ? 'plano' : 'planos'}</span>
                </div>
                <div className="in-numero">
                    <Contador valor={falas.length} className="in-numero-valor" />
                    <span className="in-numero-rotulo">{falas.length === 1 ? 'fala' : 'falas'}</span>
                </div>
                <div className="in-numero">
                    <Contador valor={takes} className="in-numero-valor" />
                    <span className="in-numero-rotulo">{takes === 1 ? 'take' : 'takes'}</span>
                </div>
            </div>
            <p className={`in-estado-falas ${semAudio ? 'aviso' : 'ok'}`}>
                {semAudio ? <Ico.aviso aria-hidden="true" /> : <Ico.ok aria-hidden="true" />}
                {semAudio ? `${semAudio} ${semAudio === 1 ? 'fala sem áudio' : 'falas sem áudio'}` : 'Todas as falas com áudio'}
                <span className="in-revisao num" title="Revisão da edição no servidor">rev. {doc.revisao}</span>
            </p>
            <Secao id="planos" titulo="Planos" icone={Ico.decupagem} direita={<span className="in-contagem num">{lim.length}</span>}>
                <table className="in-tabela">
                    <thead><tr><th>Plano</th><th>Início</th><th>Duração</th><th>Vídeo</th></tr></thead>
                    <tbody>
                        {lim.map((p) => {
                            const segs = (doc.faixas.video || []).filter((v) => v.plano === p.n);
                            const temTake = segs.some((s) => s.origem === 'take');
                            const ir = () => { relogio.ir(p.deS); if (segs[0]) setSelecao({ faixa: 'video', id: segs[0].id }); };
                            return (
                                <tr key={p.n} onClick={ir} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') ir(); }} title={`Ir para o plano ${p.n}`}>
                                    <td><b>P{p.n}</b></td>
                                    <td className="num">{M.fmtTempo(p.deS, 1)}</td>
                                    <td className="num">{M.fmtS(p.ateS - p.deS, 1)}</td>
                                    <td>{segs.length ? (temTake ? <span className="in-origem take"><Ico.regerarTrecho aria-hidden="true" />Take</span> : <span className="in-origem">Acervo</span>) : '—'}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {(doc.avisos || []).length > 0 && <div className="in-avisos">{doc.avisos.map((a, i) => <p key={i} className="nota-aviso in-nota"><Ico.aviso aria-hidden="true" />{a}</p>)}</div>}
                <div className="in-acoes">
                    <button type="button" className="btn mini fantasma" onClick={() => montarInicial({ forcar: true, gerarFalas: false })} title="Monta de novo a partir do roteiro (dá para desfazer)">
                        <Ico.roteiro aria-hidden="true" />Refazer do roteiro
                    </button>
                </div>
            </Secao>
            {regs.length > 0 && (
                <Secao id="regeracoes" titulo="Regerações" icone={Ico.regerarTrecho} direita={<span className="in-contagem num">{regs.length}</span>}>
                    <ul className="in-regs">
                        {regs.slice(-8).reverse().map((r) => (
                            <li key={r.id}>
                                <EstadoRegeracao r={r} />
                                <span className="in-regs-txt">P{r.plano} · <span className="num">{M.fmtTempo(r.deS, 1)}–{M.fmtTempo(r.ateS, 1)}</span> · {r.instrucao || 'sem instrução'}{r.simulado ? ' · simulado' : ''}</span>
                            </li>
                        ))}
                    </ul>
                </Secao>
            )}
            <p className="in-rodape"><Ico.info aria-hidden="true" />Selecione um clipe na linha do tempo para ver e mudar os detalhes. A Mesa salva sozinha.</p>
        </>
    );
}

const TITULO_FAIXA = {
    video: ['Vídeo', Ico.video], narracao: ['Narração', Ico.narracao], falas: ['Fala', Ico.voz], efeitos: ['Rádio / efeito', Ico.efeito],
    texto: ['Texto de tela', Ico.texto], legenda: ['Legenda', Ico.legenda], ab: ['A / B', Ico.escolha], ambiente: ['Ambiente', Ico.ambiente],
};

export default function MesaInspetor({
    serie, ep, doc, ctx, relogio, selecao, setSelecao, aplicar, intencoes, salvarAgora, receberDoServidor, mostrarAviso, montarInicial, painelFala, setPainelFala,
}) {
    const item = M.acharItem(doc, selecao);
    const mudarItem = (campos, sobrescrever = false) => {
        const d = M.clonar(doc);
        const lista = d.faixas[selecao.faixa];
        const i = lista.findIndex((x) => x.id === selecao.id);
        if (i < 0) return;
        const antes = lista[i];
        const novo = { ...antes, ...campos };
        if (selecao.faixa === 'video' && sobrescrever) d.faixas.video = M.sobrescreverVideo(lista, novo);
        else lista[i] = novo;
        if (M.FAIXAS_AUDIO.includes(selecao.faixa) && (campos.inicioS !== undefined || campos.duracaoS !== undefined)) d.legenda = M.acompanharLegenda(d.legenda, novo, antes);
        aplicar(d);
    };
    const mudarPlano = (n, campos) => {
        const d = M.clonar(doc);
        d.planos = d.planos.map((p) => (p.n === n ? { ...p, ...campos } : p));
        aplicar(d);
    };
    useEffect(() => { if (painelFala && (!selecao || selecao.id !== painelFala)) setPainelFala(null); }, [selecao, painelFala, setPainelFala]);

    let corpo;
    if (!item) {
        corpo = <InspetorEpisodio doc={doc} ctx={ctx} relogio={relogio} setSelecao={setSelecao} montarInicial={montarInicial} />;
    } else if (selecao.faixa === 'video') {
        corpo = (
            <>
                <InspetorVideo item={item} mudarItem={mudarItem} />
                {item.plano !== undefined && item.plano !== null && <InspetorPlano serie={serie} doc={doc} ctx={ctx} n={item.plano} relogio={relogio} mudarPlano={mudarPlano} aplicar={aplicar} mostrarAviso={mostrarAviso} />}
            </>
        );
    } else if (M.FAIXAS_AUDIO.includes(selecao.faixa)) {
        corpo = <InspetorFala serie={serie} ep={ep} item={item} intencoes={intencoes} relogio={relogio} mudarItem={mudarItem} salvarAgora={salvarAgora} receberDoServidor={receberDoServidor} mostrarAviso={mostrarAviso} destacar={painelFala === item.id} />;
    } else if (selecao.faixa === 'texto') corpo = <InspetorTexto item={item} mudarItem={mudarItem} />;
    else if (selecao.faixa === 'legenda') corpo = <InspetorLegenda item={item} doc={doc} aplicar={aplicar} />;
    else if (selecao.faixa === 'ab') corpo = <InspetorAB item={item} mudarItem={mudarItem} />;
    else if (selecao.faixa === 'ambiente') corpo = <InspetorAmbiente item={item} mudarItem={mudarItem} />;

    const [nomeFaixa, IcoFaixa] = item ? (TITULO_FAIXA[selecao.faixa] || ['Item', Ico.info]) : ['Episódio', Ico.episodio];
    const cor = item && M.FAIXAS_AUDIO.includes(selecao.faixa) && item.quem ? M.corDe(item.quem) : null;

    return (
        <aside className="in" aria-label="Inspetor">
            <div className="in-cab">
                <span className="in-cab-titulo">
                    <IcoFaixa aria-hidden="true" style={cor ? { color: cor } : undefined} />
                    {nomeFaixa}
                    {item && item.inicioS !== undefined && <span className="in-cab-tempo num">{M.fmtTempo(item.inicioS, 2)}</span>}
                </span>
                {item && (
                    <button type="button" className="btn mini fantasma" onClick={() => setSelecao(null)} title="Voltar ao resumo do episódio (Esc)">
                        <Ico.fechar aria-hidden="true" />Fechar
                    </button>
                )}
            </div>
            <div className="in-corpo">
                <Trocar chave={item ? `${selecao.faixa}:${selecao.id}` : 'episodio'}>{corpo}</Trocar>
            </div>
        </aside>
    );
}
