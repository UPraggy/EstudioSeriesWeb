import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GlobalVar from './subComponents/GlobalVar';
import { Registro as LerRegistro, RegistroResumo, ListarSeries, rotaIndisponivel } from './funcionalidades/bancoGet';
import { erroDe } from './funcionalidades/fetchFunc';
import { Ico } from './subComponents/icones';
import { Contador, Esqueleto, Expandir, Girador, Lista, Item, Vazio, avisar } from './subComponents/Movimento';
import '../assets/css/Telas.css';
import '../assets/css/Registro.css';

// Registro: o histórico de como o Estúdio está rodando (backend/src/log, docs/REGISTRO.md).
// Resumo dos últimos dias em números grandes, faixa por dia (clica = filtra o dia), filtros, linha do tempo com
// detalhe expandível, "Carregar mais" e atualização automática opcional (5 s) que só acrescenta o que é novo.

const POR_PAGINA = 100;
const DIAS_RESUMO = 7;
const AUTO_MS = 5000;
const CHAVE_AUTO = 'estudio:registroAuto';

const AREAS = [
    { id: 'http', rotulo: 'Requisições', icone: Ico.requisicao },
    { id: 'showrunner', rotulo: 'Showrunner', icone: Ico.showrunner },
    { id: 'openrouter', rotulo: 'OpenRouter', icone: Ico.openrouter },
    { id: 'job', rotulo: 'Jobs pagos', icone: Ico.video },
    { id: 'audio', rotulo: 'Áudio', icone: Ico.voz },
    { id: 'legenda', rotulo: 'Legendas', icone: Ico.legenda },
    { id: 'edicao', rotulo: 'Edição', icone: Ico.cortar },
    { id: 'render', rotulo: 'Montagem', icone: Ico.montar },
    { id: 'lixeira', rotulo: 'Lixeira e versões', icone: Ico.lixeira },
    { id: 'memoria', rotulo: 'Memória', icone: Ico.memoria },
    { id: 'serie', rotulo: 'Séries', icone: Ico.series },
    { id: 'sistema', rotulo: 'Sistema', icone: Ico.sistema },
];
const AREA = Object.fromEntries(AREAS.map((a) => [a.id, a]));
const NIVEIS = [
    { id: '', rotulo: 'Todos os níveis' },
    { id: 'aviso,erro', rotulo: 'Avisos e erros' },
    { id: 'erro', rotulo: 'Só erros' },
];

const hora = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const diaCurto = (dia) => { const [a, m, d] = dia.split('-'); return `${d}/${m}`; };
const nomeDia = (dia) => {
    const hoje = new Date();
    const f = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (dia === f(hoje)) return 'Hoje';
    if (dia === f(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1))) return 'Ontem';
    const [a, m, d] = dia.split('-').map(Number);
    return new Date(a, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
};
const diaLocal = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function duracao(ms) {
    if (!Number.isFinite(ms)) return null;
    if (ms < 1000) return `${ms} ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
    return `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`;
}
const chaveDe = (e) => `${e.em}|${e.area}|${e.evento}|${(e.msg || '').slice(0, 60)}`;

// Chaves únicas mesmo para eventos idênticos no mesmo instante.
function comChaves(lista) {
    const vistos = new Map();
    return lista.map((e) => {
        const base = chaveDe(e);
        const n = vistos.get(base) || 0;
        vistos.set(base, n + 1);
        return { ...e, _chave: n ? `${base}#${n}` : base };
    });
}

// ---------------------------------------------------------------- resumo
function Numero({ icone: Icone, rotulo, valor, formatar, sub, tom = '' }) {
    return (
        <div className={`reg-numero${tom ? ` ${tom}` : ''}`}>
            <span className="reg-numero-rot"><Icone aria-hidden="true" />{rotulo}</span>
            {Number.isFinite(valor)
                ? <Contador valor={valor} formatar={formatar} className="reg-numero-valor" duracao={0.8} />
                : <span className="reg-numero-valor texto">—</span>}
            {sub && <span className="reg-numero-sub">{sub}</span>}
        </div>
    );
}

function Resumo({ resumo, diaAtivo, onDia }) {
    if (!resumo) {
        return (
            <section className="reg-numeros" aria-label="Resumo carregando">
                {[0, 1, 2, 3].map((i) => <div key={i} className="reg-numero"><Esqueleto altura={14} largura="55%" /><Esqueleto altura={40} largura="70%" /></div>)}
            </section>
        );
    }
    if (erroDe(resumo)) return <p className="nota-erro" role="alert"><Ico.erro aria-hidden="true" /><span>Não consegui ler o resumo: {erroDe(resumo)}</span></p>;
    const t = resumo.totais;
    const hoje = resumo.dias[0];
    const maxEventos = Math.max(1, ...resumo.dias.map((d) => d.requisicoes + d.eventos));
    const inteiro = (n) => Math.round(n).toLocaleString('pt-BR');
    return (
        <>
            <p className="reg-periodo"><strong>Últimos {resumo.dias.length} dias</strong><span>Clique num dia para ver só os eventos dele.</span></p>
            <section className="reg-numeros" aria-label={`Resumo dos últimos ${resumo.dias.length} dias`} title={`Somando os últimos ${resumo.dias.length} dias`}>
                <Numero icone={Ico.requisicao} rotulo="Requisições" valor={t.requisicoes} formatar={inteiro} sub={`Hoje: ${inteiro(hoje.requisicoes)}. Com erro: ${inteiro(t.errosHttp)}.`} />
                <Numero icone={t.erros ? Ico.erro : Ico.ok} tom={t.erros ? 'erro' : ''} rotulo="Erros" valor={t.erros} formatar={inteiro} sub={`Hoje: ${inteiro(hoje.erros)}. Avisos: ${inteiro(t.avisos)}.`} />
                <Numero icone={Ico.custo} rotulo="Gasto real" valor={t.gastoUsd} formatar={GlobalVar.usdFino} sub={`${inteiro(t.geracoes)} ${t.geracoes === 1 ? 'geração' : 'gerações'} de imagem/vídeo e ${inteiro(t.chamadasIa)} ${t.chamadasIa === 1 ? 'chamada' : 'chamadas'} de texto.`} />
                <Numero icone={Ico.montar} rotulo="Montagem média" valor={t.renderMedioMs !== null ? t.renderMedioMs / 1000 : null} formatar={(n) => `${n.toFixed(1).replace('.', ',')} s`}
                    sub={t.renders ? `${inteiro(t.renders)} ${t.renders === 1 ? 'episódio montado' : 'episódios montados'}${t.rendersFalhos ? `, ${t.rendersFalhos} falharam` : ''}.` : 'Nenhuma montagem no período.'} />
            </section>
            <div className="reg-dias" role="group" aria-label="Escolha um dia para filtrar">
                {resumo.dias.slice().reverse().map((d) => {
                    const total = d.requisicoes + d.eventos;
                    const ativo = diaAtivo === d.dia;
                    return (
                        <button
                            key={d.dia}
                            type="button"
                            className={`reg-dia${ativo ? ' ativo' : ''}${d.eventos ? '' : ' vazio-dia'}`}
                            aria-pressed={ativo}
                            title={`${nomeDia(d.dia)}: ${d.requisicoes} requisições, ${d.eventos} eventos, ${d.erros} erros, ${d.avisos} avisos${d.gastoUsd ? `, ${GlobalVar.usdFino(d.gastoUsd)}` : ''}`}
                            onClick={() => onDia(ativo ? '' : d.dia)}
                            disabled={!d.eventos}
                        >
                            <span className="reg-dia-barra" aria-hidden="true"><span style={{ height: `${Math.max(total ? 8 : 0, Math.sqrt(total / maxEventos) * 100)}%` }} /></span>
                            <span className="reg-dia-nome">{nomeDia(d.dia)}</span>
                            <span className="reg-dia-meta num">
                                {d.erros > 0 ? <span className="reg-dia-erros"><Ico.erro aria-hidden="true" />{d.erros}</span> : <span className="suave">{d.eventos ? `${d.eventos} ev.` : 'nada'}</span>}
                            </span>
                        </button>
                    );
                })}
            </div>
        </>
    );
}

// ---------------------------------------------------------------- linha do tempo
function Detalhe({ e }) {
    const campos = [
        ['Quando', `${new Date(e.em).toLocaleString('pt-BR')} (${e.em})`],
        ['Área', `${AREA[e.area]?.rotulo || e.area} (${e.area})`],
        ['Evento', e.evento],
        e.serie ? ['Série', e.serie] : null,
        e.ep !== undefined ? ['Episódio', String(e.ep)] : null,
        Number.isFinite(e.ms) ? ['Tempo', duracao(e.ms)] : null,
        Number.isFinite(e.custoUsd) ? ['Gasto real', GlobalVar.usdFino(e.custoUsd)] : null,
    ].filter(Boolean);
    return (
        <div className="reg-detalhe">
            <dl>
                {campos.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
            </dl>
            {e.dados && (
                <div className="reg-dados">
                    <div className="reg-dados-cab">
                        <span>Dados</span>
                        <button type="button" className="btn fantasma mini" onClick={() => {
                            navigator.clipboard?.writeText(JSON.stringify(e, (k, v) => (k === '_chave' ? undefined : v), 2))
                                .then(() => avisar('Evento copiado'), () => avisar('Não consegui copiar', 'erro'));
                        }}>
                            <Ico.copiar aria-hidden="true" />Copiar evento
                        </button>
                    </div>
                    <pre>{JSON.stringify(e.dados, null, 2)}</pre>
                </div>
            )}
        </div>
    );
}

function Evento({ e, aberto, onAlternar }) {
    const area = AREA[e.area] || { rotulo: e.area, icone: Ico.info };
    const Icone = e.nivel === 'erro' ? Ico.erro : e.nivel === 'aviso' ? Ico.aviso : area.icone;
    const idDet = `reg-det-${e._chave.replace(/[^a-z0-9]/gi, '')}`;
    return (
        <Item as="li" className={`reg-evento nivel-${e.nivel}${aberto ? ' aberto' : ''}`}>
            <button type="button" className="reg-evento-linha" aria-expanded={aberto} aria-controls={idDet} onClick={onAlternar}>
                <time className="reg-hora num" dateTime={e.em}>{hora(e.em)}</time>
                <span className="reg-ico" title={area.rotulo}><Icone aria-hidden="true" /></span>
                <span className="reg-texto">
                    <span className="reg-evento-nome">
                        {e.nivel !== 'info' && <span className="sr">{e.nivel === 'erro' ? 'Erro: ' : 'Aviso: '}</span>}
                        <span className="reg-area">{area.rotulo}</span>
                        <span className="reg-ev">{e.evento}</span>
                        {e.serie && <span className="reg-chip">{e.serie}{e.ep !== undefined ? ` · ep ${e.ep}` : ''}</span>}
                    </span>
                    <span className="reg-msg">{e.msg || '—'}</span>
                </span>
                <span className="reg-meta num">
                    {Number.isFinite(e.custoUsd) && e.custoUsd > 0 && <span className="reg-custo">{GlobalVar.usdFino(e.custoUsd)}</span>}
                    {Number.isFinite(e.ms) && <span>{duracao(e.ms)}</span>}
                </span>
                <Ico.expandir className="reg-seta" aria-hidden="true" />
            </button>
            <div id={idDet}>
                <Expandir aberto={aberto}><Detalhe e={e} /></Expandir>
            </div>
        </Item>
    );
}

// Agrupa por dia local (cabeçalho "Hoje", "Ontem", "qua., 04/11").
function porDia(eventos) {
    const grupos = [];
    for (const e of eventos) {
        const d = diaLocal(e.em);
        const g = grupos[grupos.length - 1];
        if (g && g.dia === d) g.eventos.push(e); else grupos.push({ dia: d, eventos: [e] });
    }
    return grupos;
}

// ---------------------------------------------------------------- tela
export default function Registro({ ativaResp }) {
    const [resumo, setResumo] = useState(null);
    const [pagina, setPagina] = useState(null); // { eventos, temMais, proximoAntesDe, dias } | { 'ERROR SERVER' }
    const [carregandoMais, setCarregandoMais] = useState(false);
    const [atualizando, setAtualizando] = useState(false);
    const [abertos, setAbertos] = useState(() => new Set());
    const [series, setSeries] = useState([]);
    const [auto, setAuto] = useState(() => GlobalVar.getLocalStorage(CHAVE_AUTO, false) === true);
    const [filtros, setFiltros] = useState({ dia: '', nivel: '', area: '', serie: '', busca: '' });
    const [buscaDigitada, setBuscaDigitada] = useState('');
    const pedido = useRef(0);

    const consulta = useMemo(() => ({ ...filtros, limite: POR_PAGINA }), [filtros]);

    const carregarResumo = useCallback(() => RegistroResumo({ dias: DIAS_RESUMO }).then(setResumo), []);

    // Primeira página (troca de filtro, botão Atualizar).
    const carregar = useCallback(async () => {
        const n = ++pedido.current;
        const r = await LerRegistro(consulta);
        if (n !== pedido.current) return r;
        setPagina(erroDe(r) ? r : { ...r, eventos: comChaves(r.eventos || []) });
        return r;
    }, [consulta]);

    useEffect(() => { setPagina(null); carregar(); }, [carregar]);
    useEffect(() => { carregarResumo(); }, [carregarResumo]);
    useEffect(() => {
        ListarSeries().then((r) => { if (!erroDe(r)) setSeries((r.series || []).map((s) => ({ id: s.id, titulo: s.titulo }))); });
    }, []);

    // Busca com pausa de 300 ms (não consulta a cada letra).
    useEffect(() => {
        const t = setTimeout(() => setFiltros((f) => (f.busca === buscaDigitada ? f : { ...f, busca: buscaDigitada })), 300);
        return () => clearTimeout(t);
    }, [buscaDigitada]);

    // Atualização automática: só acrescenta no topo o que chegou depois do evento mais novo da lista.
    useEffect(() => {
        GlobalVar.setLocalStorage(CHAVE_AUTO, auto);
        if (!auto) return undefined;
        const id = setInterval(async () => {
            if (document.hidden) return;
            const n = pedido.current;
            const r = await LerRegistro(consulta);
            if (n !== pedido.current || erroDe(r)) return;
            setPagina((p) => {
                if (!p || erroDe(p) || !p.eventos.length) return { ...r, eventos: comChaves(r.eventos || []) };
                const maisNovo = p.eventos[0].em;
                const conhecidos = new Set(p.eventos.filter((e) => e.em === maisNovo).map(chaveDe));
                const novos = (r.eventos || []).filter((e) => e.em > maisNovo || (e.em === maisNovo && !conhecidos.has(chaveDe(e))));
                if (!novos.length) return { ...p, dias: r.dias };
                return { ...p, dias: r.dias, eventos: comChaves([...novos, ...p.eventos.map(({ _chave, ...e }) => e)]) };
            });
            carregarResumo();
        }, AUTO_MS);
        return () => clearInterval(id);
    }, [auto, consulta, carregarResumo]);

    async function atualizar() {
        setAtualizando(true);
        const [r] = await Promise.all([carregar(), carregarResumo()]);
        setAtualizando(false);
        if (erroDe(r)) avisar(`Não consegui ler o registro: ${erroDe(r)}`, 'erro');
    }

    async function carregarMais() {
        if (!pagina || !pagina.proximoAntesDe) return;
        setCarregandoMais(true);
        const n = pedido.current;
        const r = await LerRegistro({ ...consulta, antesDe: pagina.proximoAntesDe });
        setCarregandoMais(false);
        if (n !== pedido.current) return;
        if (erroDe(r)) { avisar(`Não consegui carregar mais: ${erroDe(r)}`, 'erro'); return; }
        setPagina((p) => ({ ...r, eventos: comChaves([...p.eventos.map(({ _chave, ...e }) => e), ...(r.eventos || [])]) }));
    }

    const mudar = (campo) => (ev) => setFiltros((f) => ({ ...f, [campo]: ev.target.value }));
    const alternar = (k) => setAbertos((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
    const temFiltro = Boolean(filtros.dia || filtros.nivel || filtros.area || filtros.serie || filtros.busca);
    const limparFiltros = () => { setBuscaDigitada(''); setFiltros({ dia: '', nivel: '', area: '', serie: '', busca: '' }); };

    const diasOpcoes = pagina && !erroDe(pagina) ? pagina.dias || [] : (resumo && !erroDe(resumo) ? resumo.diasComRegistro || [] : []);
    const seriesOpcoes = useMemo(() => {
        const m = new Map(series.map((s) => [s.id, s.titulo]));
        if (filtros.serie && !m.has(filtros.serie)) m.set(filtros.serie, filtros.serie);
        return [...m.entries()];
    }, [series, filtros.serie]);

    const semRota = rotaIndisponivel(pagina) || rotaIndisponivel(resumo);

    return (
        <main className={`tela registro${ativaResp ? ' resp' : ''}`}>
            <div className="tela-cab reg-cab">
                <div>
                    <h1>Registro</h1>
                    <p>Histórico de como o Estúdio está rodando: requisições, etapas da IA, gerações pagas, falas, montagens e erros. Fica em <code>logs\registro-AAAA-MM-DD.jsonl</code> por 30 dias, sem chave nem conteúdo de mídia.</p>
                </div>
                <div className="reg-acoes">
                    <label className="reg-auto" title="Busca eventos novos a cada 5 segundos enquanto esta aba estiver visível">
                        <input type="checkbox" role="switch" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
                        <span>Atualizar sozinho</span>
                        {auto && <span className="reg-auto-ponto" aria-hidden="true" />}
                    </label>
                    <button type="button" className="btn" onClick={atualizar} disabled={atualizando} aria-busy={atualizando} title="Ler o registro de novo">
                        {atualizando && <Girador />}
                        <Ico.regerar className="ico-girar" aria-hidden="true" />
                        Atualizar
                    </button>
                </div>
            </div>

            {semRota
                ? <p className="nota-aviso"><Ico.aviso aria-hidden="true" /><span>O servidor que está aberto ainda não tem o registro. Feche e abra o Estúdio de novo para carregar a versão nova.</span></p>
                : <Resumo resumo={resumo} diaAtivo={filtros.dia} onDia={(dia) => setFiltros((f) => ({ ...f, dia }))} />}

            <section className="secao" aria-labelledby="h-linha">
                <div className="secao-cab">
                    <h2 id="h-linha"><Ico.historico aria-hidden="true" />Linha do tempo</h2>
                    <p>Mais recentes primeiro. Clique num evento para ver o detalhe.</p>
                </div>

                <div className="reg-filtros" role="search" aria-label="Filtrar o registro">
                    <label className="campo">
                        <span>Dia</span>
                        <select value={filtros.dia} onChange={mudar('dia')}>
                            <option value="">Todos os dias</option>
                            {diasOpcoes.map((d) => <option key={d} value={d}>{nomeDia(d)} ({diaCurto(d)})</option>)}
                        </select>
                    </label>
                    <label className="campo">
                        <span>Nível</span>
                        <select value={filtros.nivel} onChange={mudar('nivel')}>
                            {NIVEIS.map((n) => <option key={n.id} value={n.id}>{n.rotulo}</option>)}
                        </select>
                    </label>
                    <label className="campo">
                        <span>Área</span>
                        <select value={filtros.area} onChange={mudar('area')}>
                            <option value="">Todas as áreas</option>
                            {AREAS.map((a) => <option key={a.id} value={a.id}>{a.rotulo}</option>)}
                        </select>
                    </label>
                    <label className="campo">
                        <span>Série</span>
                        <select value={filtros.serie} onChange={mudar('serie')}>
                            <option value="">Todas as séries</option>
                            {seriesOpcoes.map(([id, titulo]) => <option key={id} value={id}>{titulo}</option>)}
                        </select>
                    </label>
                    <label className="campo reg-busca">
                        <span>Buscar</span>
                        <span className="reg-busca-campo">
                            <Ico.buscar aria-hidden="true" />
                            <input type="search" value={buscaDigitada} onChange={(e) => setBuscaDigitada(e.target.value)} placeholder="ffmpeg, 429, SalvarEdicao…" />
                        </span>
                    </label>
                    {temFiltro && (
                        <button type="button" className="btn fantasma reg-limpar" onClick={limparFiltros}>
                            <Ico.fechar aria-hidden="true" />Limpar filtros
                        </button>
                    )}
                </div>

                {pagina === null && (
                    <div className="reg-esqueleto" aria-label="Carregando o registro">
                        {Array.from({ length: 6 }, (_, i) => <Esqueleto key={i} altura={52} />)}
                    </div>
                )}
                {pagina && erroDe(pagina) && !semRota && (
                    <p className="nota-erro" role="alert"><Ico.erro aria-hidden="true" /><span>Não consegui ler o registro: {erroDe(pagina)}</span></p>
                )}
                {pagina && !erroDe(pagina) && pagina.eventos.length === 0 && (
                    <Vazio
                        icone={Ico.registro}
                        titulo={temFiltro ? 'Nada com esses filtros' : 'Nenhum evento ainda'}
                        texto={temFiltro ? 'Tente outro dia, nível ou área.' : 'Use o Estúdio e os eventos aparecem aqui: cada requisição, geração e montagem.'}
                    >
                        {temFiltro && <button type="button" className="btn" onClick={limparFiltros}><Ico.fechar aria-hidden="true" />Limpar filtros</button>}
                    </Vazio>
                )}
                {pagina && !erroDe(pagina) && pagina.eventos.length > 0 && (
                    <>
                        {porDia(pagina.eventos).map((g) => (
                            <div key={g.dia} className="reg-grupo">
                                <h3 className="reg-grupo-dia">{nomeDia(g.dia)} <span className="num">{diaCurto(g.dia)}</span></h3>
                                <Lista as="ol" className="reg-linha">
                                    {g.eventos.map((e) => (
                                        <Evento key={e._chave} e={e} aberto={abertos.has(e._chave)} onAlternar={() => alternar(e._chave)} />
                                    ))}
                                </Lista>
                            </div>
                        ))}
                        <div className="reg-rodape">
                            <span className="num">{pagina.eventos.length} {pagina.eventos.length === 1 ? 'evento' : 'eventos'}</span>
                            {pagina.temMais
                                ? (
                                    <button type="button" className="btn" onClick={carregarMais} disabled={carregandoMais} aria-busy={carregandoMais}>
                                        {carregandoMais && <Girador />}
                                        <Ico.expandir aria-hidden="true" />
                                        Carregar mais
                                    </button>
                                )
                                : <span className="suave">Isso é tudo{filtros.dia ? ' deste dia' : ''}.</span>}
                        </div>
                    </>
                )}
            </section>
        </main>
    );
}
