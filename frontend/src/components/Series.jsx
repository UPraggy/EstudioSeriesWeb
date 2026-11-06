import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import GlobalVar from './subComponents/GlobalVar';
import Dialogo from './subComponents/Dialogo';
import { ListarSeries, LerSerie, CriarSerie, Saude, ListarLixeira } from './funcionalidades/bancoGet';
import { erroDe } from './funcionalidades/fetchFunc';
import { capaDaSerie, imagemPrincipal, indiceEtapa, urlDaFicha } from './sala/serieUtil';
import { Ico } from './subComponents/icones';
import { Lista, Item, Esqueleto, Vazio, Girador, avisar } from './subComponents/Movimento';
import { lerUltimoLugar } from './TopMenu';
import MenuAcoes from './subComponents/MenuAcoes';
import ApagarSerie from './sala/ApagarSerie';
import Lixeira from './Lixeira';
import '../assets/css/Telas.css';
import '../assets/css/Series.css';

const GENEROS = ['Suspense · mistério', 'Sobrevivência · apocalipse zumbi', 'Terror', 'Drama', 'Ficção científica', 'Comédia', 'Romance'];
const ARQUIVOS_NOVA = ['serie.json', 'biblia.json', 'jobs.json', 'custos.jsonl', 'elenco/', 'locais/', 'objetos/', 'episodios/'];

// ---------- dados derivados (sem rede) ----------
function episodiosDe(s) {
    return s.dados && s.dados.serie && Array.isArray(s.dados.serie.episodios) ? s.dados.serie.episodios : [];
}
function totalTemporada(s) {
    const t = s.dados && s.dados.biblia && Array.isArray(s.dados.biblia.temporada) ? s.dados.biblia.temporada.length : 0;
    return t || null;
}
function contagemEps(s) {
    const n = s.dados ? episodiosDe(s).length : (Number(s.episodios) || 0);
    const t = totalTemporada(s);
    if (t) return `${n} de ${t} episódios`;
    return `${n} ${n === 1 ? 'episódio' : 'episódios'}`;
}
// Tom do pôster sem imagem: um grafite levemente tingido, estável por série.
function tomDe(id) {
    let h = 0;
    for (const c of String(id || '')) h = (h * 31 + c.charCodeAt(0)) % 360;
    return `hsl(${h} 18% 17%)`;
}
function haQuanto(em) {
    const s = Math.max(0, (Date.now() - Number(em)) / 1000);
    if (!Number.isFinite(s)) return '';
    if (s < 90) return 'agora há pouco';
    const m = Math.round(s / 60);
    if (m < 60) return `há ${m} min`;
    const h = Math.round(m / 60);
    if (h < 24) return `há ${h} h`;
    const d = Math.round(h / 24);
    return d === 1 ? 'ontem' : `há ${d} dias`;
}
const recente = (a, b) => (new Date(b.criadaEm).getTime() || 0) - (new Date(a.criadaEm).getTime() || 0);

// ---------- pôster ----------
// Pôster sem imagem: tipográfico (inicial gigante condensada, marcas de registro nos cantos e o gênero).
function PosterTipografico({ s }) {
    const inicial = (String(s.titulo || '?').replace(/^(o|a|os|as|um|uma)\s+/i, '').trim()[0] || '?').toUpperCase();
    return (
        <div className="poster-tipo" style={{ '--tom': tomDe(s.id) }} aria-hidden="true">
            <svg className="poster-tipo-marcas" viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d="M6 14V6h8M86 6h8v8M94 86v8h-8M14 94H6v-8" />
            </svg>
            <span className="poster-tipo-inicial">{inicial}</span>
            {s.genero && <span className="poster-tipo-genero">{s.genero}</span>}
        </div>
    );
}

function ImagemSerie({ src, className = '', onFalhar }) {
    const [carregada, setCarregada] = useState(false);
    return (
        <img
            className={`${className}${carregada ? ' carregada' : ''}`}
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            onLoad={() => setCarregada(true)}
            onError={onFalhar}
        />
    );
}

function Poster({ s, onApagar }) {
    const [falhou, setFalhou] = useState(false);
    const capa = s.dados ? capaDaSerie(s.dados) : null;
    const comImagem = Boolean(capa) && !falhou;
    return (
        <article className={`poster${comImagem ? '' : ' sem-imagem'}`}>
            <div className="poster-midia">
                {comImagem
                    ? <ImagemSerie className="poster-img" src={GlobalVar.urlMidia(s.id, capa)} onFalhar={() => setFalhou(true)} />
                    : <PosterTipografico s={s} />}
            </div>
            <div className="poster-veu" aria-hidden="true" />
            <span className="poster-etapa">{s.erro ? 'Com erro' : GlobalVar.nomeEtapa(s.etapa)}</span>
            <div className="poster-info">
                <h3 className="poster-titulo">
                    <Link to={`/serie/${s.id}`} className="poster-link">{s.titulo}</Link>
                </h3>
                <p className="poster-meta">{s.genero || 'Gênero a definir'}</p>
                <p className="poster-meta num">{contagemEps(s)}</p>
                {s.erro && <p className="poster-erro"><Ico.erro aria-hidden="true" />{s.erro}</p>}
                <span className="poster-acao" aria-hidden="true"><Ico.showrunner />Abrir Sala</span>
            </div>
            {onApagar && (
                <MenuAcoes
                    className="poster-menu"
                    classeBotao="poster-menu-btn"
                    rotulo={`Mais ações: ${s.titulo}`}
                    itens={[{ id: 'apagar', rotulo: 'Apagar série', icone: Ico.apagar, perigo: true, onSelecionar: () => onApagar(s) }]}
                />
            )}
        </article>
    );
}

// ---------- continuar de onde parou ----------
function Progresso({ etapa }) {
    const i = Math.max(0, indiceEtapa(etapa));
    const total = GlobalVar.ETAPAS.length;
    return (
        <div className="cont-progresso">
            <div className="cont-trilha" role="img" aria-label={`Etapa ${i + 1} de ${total}: ${GlobalVar.nomeEtapa(etapa)}`}>
                {GlobalVar.ETAPAS.map((e, k) => (
                    <span key={e.id} className={k < i ? 'feita' : k === i ? 'atual' : ''} title={e.nome} style={{ '--i': k }} />
                ))}
            </div>
            <span className="cont-progresso-txt">Etapa <span className="num">{i + 1}</span> de <span className="num">{total}</span>: <strong>{GlobalVar.nomeEtapa(etapa)}</strong></span>
        </div>
    );
}

function Continuar({ s, lugar }) {
    const [falhou, setFalhou] = useState(false);
    const d = s.dados || null;
    const capa = d ? capaDaSerie(d) : null;
    const url = capa && !falhou ? GlobalVar.urlMidia(s.id, capa) : '';
    const eps = episodiosDe(s);
    const temporada = d && d.biblia && Array.isArray(d.biblia.temporada) ? d.biblia.temporada : [];
    const doLugar = lugar && lugar.serie === s.id ? lugar : null;
    // Sem histórico: o primeiro episódio ainda não publicado (é o que está em produção); todos publicados = o último.
    const emAberto = [...eps].sort((a, b) => a.n - b.n).find((e) => e.status !== 'publicado');
    const epN = doLugar && doLugar.ep ? doLugar.ep : (emAberto ? emAberto.n : (eps.length ? Math.max(...eps.map((e) => e.n)) : null));
    const ep = epN ? (eps.find((e) => e.n === epN) || temporada.find((t) => t.n === epN) || { n: epN }) : null;
    const naMesa = Boolean(doLugar && doLugar.ep);
    const premissa = d ? ((d.biblia && d.biblia.premissa) || (d.serie && d.serie.ideia) || '') : '';
    const escolha = d && d.biblia && Array.isArray(d.biblia.escolhas) ? d.biblia.escolhas.find((x) => x.ep === epN) : null;
    const elenco = d && Array.isArray(d.elenco) ? d.elenco.filter((f) => !f.erro && imagemPrincipal(f)).slice(0, 5) : [];

    const irSala = (
        <Link key="sala" to={`/serie/${s.id}`} className={`btn ${naMesa ? '' : 'primario'} cont-btn`}>
            <Ico.showrunner className="ico-pular" aria-hidden="true" />Abrir Sala
        </Link>
    );
    const irMesa = epN ? (
        <Link key="mesa" to={`/serie/${s.id}/ep/${epN}`} className={`btn ${naMesa ? 'primario' : ''} cont-btn`}>
            <Ico.episodio className="ico-pular" aria-hidden="true" /><span>Abrir Mesa do Ep. {epN}</span>
        </Link>
    ) : null;

    return (
        <section className={`continuar${url ? '' : ' sem-imagem'}`} aria-labelledby="h-continuar">
            <div className="cont-fundo" aria-hidden="true">
                {url ? <ImagemSerie className="cont-fundo-img" src={url} onFalhar={() => setFalhou(true)} /> : <span className="cont-fundo-tom" style={{ '--tom': tomDe(s.id) }} />}
            </div>
            <div className="cont-veu" aria-hidden="true" />

            <Link to={`/serie/${s.id}`} className="cont-poster" tabIndex={-1} aria-hidden="true">
                {url ? <ImagemSerie className="cont-poster-img" src={url} onFalhar={() => setFalhou(true)} /> : <PosterTipografico s={s} />}
            </Link>

            <div className="cont-info">
                <p className="cont-sobre"><Ico.historico aria-hidden="true" />Continuar de onde parou</p>
                <h2 id="h-continuar" className="cont-titulo">{s.titulo}</h2>
                <p className="cont-meta">
                    <span>{s.genero || 'Gênero a definir'}</span>
                    <span className="cont-meta-sep" aria-hidden="true" />
                    <span className="num">{contagemEps(s)}</span>
                </p>
                {premissa && <p className="cont-premissa">{premissa}</p>}
                {!d && !s.erro && <Esqueleto linhas={2} className="cont-esq" />}

                <Progresso etapa={s.etapa} />

                {ep && (
                    <div className="cont-ep">
                        <span className="cont-ep-n num">Ep. {ep.n}</span>
                        <span className="cont-ep-titulo">{ep.titulo || `Episódio ${ep.n}`}</span>
                        {escolha && escolha.A && escolha.B && (
                            <span className="cont-escolha" title="Escolha A/B do fim do episódio">
                                <Ico.escolha aria-hidden="true" />
                                <span className="cont-escolha-op">{escolha.A}</span>
                                <span className="cont-escolha-x" aria-hidden="true">×</span><span className="sr"> ou </span>
                                <span className="cont-escolha-op">{escolha.B}</span>
                            </span>
                        )}
                    </div>
                )}

                <div className="cont-acoes">
                    {naMesa ? [irMesa, irSala] : [irSala, irMesa]}
                </div>

                <div className="cont-rodape">
                    <p className="cont-parou">
                        <Ico.relogio aria-hidden="true" />
                        <span>
                            {doLugar
                                ? `Você parou ${naMesa ? `na Mesa do Ep. ${doLugar.ep}` : 'na Sala do showrunner'}, ${haQuanto(doLugar.em)}.`
                                : `Criada em ${GlobalVar.dataBR(s.criadaEm) || '—'}.`}
                        </span>
                    </p>
                    {elenco.length > 0 && (
                        <ul className="cont-elenco" aria-label="Elenco com imagem">
                            {elenco.map((f, k) => (
                                <li key={f.id} title={f.nome || f.id} style={{ '--i': k }}>
                                    <img src={urlDaFicha(s.id, f, imagemPrincipal(f))} alt={f.nome || f.id} loading="lazy" />
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </section>
    );
}

function EsqueletoSeries() {
    return (
        <div className="series-esqueleto" aria-busy="true" aria-label="Carregando séries">
            <Esqueleto altura={360} className="esq-continuar" />
            <div className="grade-posteres">
                {[0, 1, 2, 3].map((i) => <Esqueleto key={i} altura="auto" className="esq-poster" />)}
            </div>
        </div>
    );
}

// ---------- nova série (diálogo) ----------
function NovaSerie({ aberto, pastaDados, ondeNavegador, onFechar, onCriada }) {
    const navegar = useNavigate();
    const [titulo, setTitulo] = useState('');
    const [genero, setGenero] = useState('');
    const [ideia, setIdeia] = useState('');
    const [erro, setErro] = useState('');
    const [ocupado, setOcupado] = useState(false);
    const [criada, setCriada] = useState(null);

    useEffect(() => {
        if (aberto) {
            setTitulo(''); setGenero(''); setIdeia(''); setErro(''); setCriada(null); setOcupado(false);
        }
    }, [aberto]);

    const id = GlobalVar.slug(titulo);
    const sep = ondeNavegador ? '/' : '\\';
    const raiz = ondeNavegador ? 'series/' : `${pastaDados || 'E:\\EstudioSeriesDados'}\\series\\`;

    async function criar(e) {
        e.preventDefault();
        if (!titulo.trim()) { setErro('Informe o título da série.'); return; }
        if (!id) { setErro('O título precisa ter letras ou números.'); return; }
        setOcupado(true);
        setErro('');
        const r = await CriarSerie({ titulo: titulo.trim(), genero: genero.trim(), ideia: ideia.trim() });
        setOcupado(false);
        if (erroDe(r)) { setErro(erroDe(r)); avisar(`Não consegui criar a série: ${erroDe(r)}`, 'erro'); return; }
        setCriada(r.serie);
        avisar('Série criada');
        onCriada && onCriada(r.serie);
    }

    if (criada) {
        return (
            <Dialogo
                key="criada"
                id="nova-serie"
                aberto={aberto}
                titulo="Série criada"
                icone={Ico.ok}
                onFechar={onFechar}
                rodape={(
                    <>
                        <button type="button" className="btn" onClick={onFechar}>Fechar</button>
                        <button type="button" className="btn primario" data-foco onClick={() => navegar(`/serie/${criada.id}`)}>
                            <Ico.showrunner className="ico-pular" aria-hidden="true" /><span>Abrir a sala</span>
                        </button>
                    </>
                )}
            >
                <p className="dlg-nota" style={{ fontSize: 'var(--t-sm)', color: 'var(--texto)' }}>
                    <strong>{criada.titulo}</strong> está pronta para a etapa 1 (ideia). Pasta criada:
                </p>
                <pre className="dlg-arvore">{`${raiz}${criada.id}${sep}\n${ARQUIVOS_NOVA.map((a) => `  ${a}`).join('\n')}`}</pre>
            </Dialogo>
        );
    }

    return (
        <Dialogo
            key="form"
            id="nova-serie"
            aberto={aberto}
            titulo="Nova série"
            icone={Ico.series}
            descricao="Cria a pasta da série. Criar não custa nada; as etapas com IA pedem confirmação de custo."
            onFechar={onFechar}
            travado={ocupado}
            rodape={(
                <>
                    <button type="button" className="btn" onClick={onFechar} disabled={ocupado}>Cancelar</button>
                    <button type="submit" form="form-nova-serie" className="btn primario" disabled={ocupado} aria-busy={ocupado}>
                        {ocupado && <Girador />}
                        <Ico.novo className="ico-pular" aria-hidden="true" />
                        <span>{ocupado ? 'Criando…' : 'Criar série'}</span>
                    </button>
                </>
            )}
        >
            <form id="form-nova-serie" onSubmit={criar} className="nova-form" noValidate>
                <label className="dlg-campo">
                    <span>Título</span>
                    <input type="text" value={titulo} maxLength={80} autoComplete="off" data-foco placeholder="Ex.: Sinal Fraco" onChange={(e) => setTitulo(e.target.value)} />
                </label>
                <label className="dlg-campo">
                    <span>Gênero</span>
                    <input type="text" value={genero} maxLength={80} list="generos-serie" placeholder="Ex.: Suspense · mistério" onChange={(e) => setGenero(e.target.value)} />
                    <datalist id="generos-serie">{GENEROS.map((g) => <option key={g} value={g} />)}</datalist>
                </label>
                <label className="dlg-campo">
                    <span>Ideia em uma frase</span>
                    <textarea rows={3} value={ideia} maxLength={20000} placeholder="Ex.: Uma radioamadora capta pedidos de socorro de uma cidade que sumiu do mapa." onChange={(e) => setIdeia(e.target.value)} />
                    <small>Opcional. O showrunner desenvolve a partir dela na etapa 1.</small>
                </label>
                <div className="dlg-campo">
                    <span>Pasta que será criada</span>
                    <pre className="dlg-arvore" aria-live="polite">{`${raiz}${id || '<título>'}${sep}\n${ARQUIVOS_NOVA.map((a) => `  ${a}`).join('\n')}`}</pre>
                </div>
                {erro && <p className="dlg-erro" role="alert"><Ico.erro aria-hidden="true" />{erro}</p>}
            </form>
        </Dialogo>
    );
}

// ---------- página ----------
export default function Series({ ativaResp }) {
    const [series, setSeries] = useState(null);
    const [erro, setErro] = useState('');
    const [pastaDados, setPastaDados] = useState('');
    const [ondeNavegador, setOndeNavegador] = useState(''); // site sem backend: nome do armazém do navegador
    const [novaAberta, setNovaAberta] = useState(false);
    const [recarregar, setRecarregar] = useState(0);
    const [lugar] = useState(() => lerUltimoLugar());
    const [apagando, setApagando] = useState(null); // { id, titulo } da série no diálogo de apagar
    const [params, setParams] = useSearchParams();
    const lixeiraAberta = params.get('lixeira') === '1';
    const [naLixeira, setNaLixeira] = useState(0);

    // Quantos itens há na lixeira (o botão só aparece quando há algo para restaurar).
    useEffect(() => {
        let vivo = true;
        ListarLixeira().then((r) => { if (vivo) setNaLixeira(erroDe(r) ? 0 : (r.itens || []).length); });
        return () => { vivo = false; };
    }, [recarregar, lixeiraAberta]);
    const abrirLixeira = (sim) => setParams(sim ? { lixeira: '1' } : {});

    useEffect(() => {
        let vivo = true;
        Saude().then((r) => {
            if (!vivo || erroDe(r)) return;
            if (r.motor === 'navegador') setOndeNavegador(r.dados || '');
            else setPastaDados(r.dados || '');
        });
        ListarSeries().then(async (r) => {
            if (!vivo) return;
            if (erroDe(r)) { setErro(erroDe(r)); setSeries([]); return; }
            const lista = r.series || [];
            setSeries(lista);
            // Capa e gasto vêm da leitura completa de cada série (poucas séries: em paralelo).
            const completas = await Promise.all(lista.map(async (s) => {
                if (s.erro) return s;
                const d = await LerSerie({ id: s.id });
                return erroDe(d) ? { ...s, erro: erroDe(d) } : { ...s, dados: d };
            }));
            if (vivo) setSeries(completas);
        });
        return () => { vivo = false; };
    }, [recarregar]);

    const total = series ? series.length : 0;
    const ordenadas = useMemo(() => [...(series || [])].sort(recente), [series]);
    // Em destaque: onde o Rafael parou; sem isso, a série mais nova.
    const destaque = useMemo(() => {
        if (!ordenadas.length) return null;
        return (lugar && ordenadas.find((s) => s.id === lugar.serie)) || ordenadas[0];
    }, [ordenadas, lugar]);
    const abrirNova = () => setNovaAberta(true);

    return (
        <main className={`tela series${ativaResp ? ' resp' : ''}`}>
            <div className="tela-cab series-cab">
                <div>
                    <h1>Séries</h1>
                    <p>Minisséries verticais, episódio a episódio, do tamanho que a história pedir, com o público escolhendo o caminho.</p>
                </div>
                <div className="series-cab-acoes">
                    {naLixeira > 0 && (
                        <button type="button" className="btn fantasma" onClick={() => abrirLixeira(true)}>
                            <Ico.lixeira aria-hidden="true" />Lixeira<span className="series-lixeira-n num">{naLixeira}</span>
                        </button>
                    )}
                    {total > 0 && (
                        <button type="button" className="btn" onClick={abrirNova}>
                            <Ico.novo className="ico-pular" aria-hidden="true" />Nova série
                        </button>
                    )}
                </div>
            </div>

            {erro && <p className="nota-erro series-erro" role="alert"><Ico.erro aria-hidden="true" />Não consegui listar as séries: {erro}</p>}
            {series === null && <EsqueletoSeries />}

            {series !== null && total === 0 && !erro && (
                <div className="series-vazio">
                    <Vazio icone={Ico.series} titulo="Nenhuma série ainda" texto="Comece por um título e uma ideia em uma frase. Criar a série não custa nada.">
                        <button type="button" className="btn primario" onClick={abrirNova}>
                            <Ico.novo className="ico-pular" aria-hidden="true" />Criar a primeira série
                        </button>
                    </Vazio>
                </div>
            )}

            {destaque && <Continuar key={destaque.id} s={destaque} lugar={lugar} />}

            {total > 0 && (
                <section className="series-todas" aria-labelledby="h-todas">
                    <div className="secao-cab">
                        <h2 id="h-todas">Todas as séries</h2>
                        <p className="num">{total} {total === 1 ? 'série' : 'séries'}</p>
                    </div>
                    <Lista as="ul" className="grade-posteres">
                        {ordenadas.map((s) => (
                            <Item as="li" key={s.id}><Poster s={s} onApagar={(x) => setApagando({ id: x.id, titulo: x.titulo })} /></Item>
                        ))}
                        <Item as="li" key="__nova">
                            <button type="button" className="poster-nova" onClick={abrirNova}>
                                <span className="poster-nova-ico"><Ico.novo aria-hidden="true" /></span>
                                <span className="poster-nova-titulo">Nova série</span>
                                <span className="poster-nova-texto">Título, gênero e uma ideia. A pasta já nasce com bíblia, elenco, locais e episódios.</span>
                            </button>
                        </Item>
                    </Lista>
                    <p className="series-pasta">
                        <Ico.pasta aria-hidden="true" />
                        {ondeNavegador
                            ? <>As séries ficam em <code>{ondeNavegador}</code>. Para trocar, abra <Link to="/configuracoes">Configurações</Link>.</>
                            : <>Cada série é uma pasta em <code>{pastaDados ? `${pastaDados}\\series` : 'series/'}</code></>}
                    </p>
                </section>
            )}

            <NovaSerie
                aberto={novaAberta}
                pastaDados={pastaDados}
                ondeNavegador={ondeNavegador}
                onFechar={() => setNovaAberta(false)}
                onCriada={() => setRecarregar((v) => v + 1)}
            />
            <ApagarSerie
                aberto={Boolean(apagando)}
                serie={apagando}
                pastaDados={pastaDados}
                onFechar={() => setApagando(null)}
                onApagada={() => { setApagando(null); setRecarregar((v) => v + 1); }}
            />
            <Lixeira
                aberto={lixeiraAberta}
                pastaDados={pastaDados}
                onFechar={() => abrirLixeira(false)}
                onRestaurado={() => setRecarregar((v) => v + 1)}
            />
        </main>
    );
}
