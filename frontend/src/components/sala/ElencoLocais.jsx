import { useEffect, useState } from 'react';
import ConfirmarCusto from '../subComponents/ConfirmarCusto';
import { Ico } from '../subComponents/icones';
import { AnimatePresence, Expandir, Girador, Item, Lista, MOV, Trocar, Vazio, Visto, avisar, motion } from '../subComponents/Movimento';
import { CotarGeracao, DefinirCanonica, GerarImagem, IntencoesFala, SalvarFicha } from '../funcionalidades/bancoGet';
import { erroDe } from '../funcionalidades/fetchFunc';
import { PASTA_DO_TIPO, caminhoDaFicha, imagemPrincipal, refsDaFicha, urlDaFicha } from './serieUtil';
import '../../assets/css/ElencoLocais.css';

const SUBS = [
    { id: 'elenco', rotulo: 'Elenco', icone: Ico.elenco },
    { id: 'locais', rotulo: 'Locais', icone: Ico.local },
    { id: 'objetos', rotulo: 'Objetos', icone: Ico.objeto },
];
const ICONE_TIPO = { personagem: Ico.personagem, local: Ico.local, objeto: Ico.objeto };

const RE_TOM = /^[+-]\d+(?:\.\d+)?(?:Hz|st)$/;
const NOME_VISTA = { frente: 'Frente', perfil: 'Perfil', corpo: 'Corpo inteiro', geral: 'Geral', suspense: 'Suspense', aponta: 'Apontando' };

// O que cada geração de referência pede (uma imagem por vista).
const VISTAS = {
    personagem: [
        { id: 'frente', nome: 'Frente (rosto e ombros)', instrucao: 'retrato de frente, rosto e ombros, olhando para a câmera' },
        { id: 'perfil', nome: 'Perfil', instrucao: 'retrato de perfil (lado esquerdo), rosto e ombros' },
        { id: 'corpo', nome: 'Corpo inteiro', instrucao: 'corpo inteiro, de pé, de frente, braços relaxados' },
    ],
    local: [{ id: 'geral', nome: 'Plano geral', instrucao: 'plano geral do lugar, câmera na altura dos olhos' }],
    objeto: [{ id: 'geral', nome: 'Referência', instrucao: 'objeto isolado, vista de três quartos' }],
};

function promptDe(ficha, vista) {
    const desc = [ficha.ancora, ficha.onde ? `fica em: ${ficha.onde}` : ''].filter(Boolean).join('. ');
    if (ficha.tipo === 'personagem') {
        return `Folha de referência de personagem — ${vista.instrucao}. ${desc}. Fundo cinza-claro liso, luz suave de estúdio, fotografia realista, sem texto, sem moldura.`;
    }
    if (ficha.tipo === 'local') return `Referência de cenário: ${ficha.nome}. ${desc}. ${vista.instrucao}. Fotografia realista, formato vertical, sem pessoas, sem texto.`;
    return `Imagem de referência do objeto "${ficha.nome}". ${desc}. ${vista.instrucao}. Fundo neutro, luz suave, fotografia realista, sem texto.`;
}

// Campos editáveis comuns (âncora; voz e tom só no elenco). Salva a ficha inteira (o servidor valida e faz backup).
function useEdicaoFicha(ficha, onSalvar) {
    const [rascunho, setRascunho] = useState({ ancora: ficha.ancora || '', voz: ficha.voz || '', tom: ficha.tom || '' });
    const [estado, setEstado] = useState({ tipo: '', texto: '' });
    const [ocupado, setOcupado] = useState(false);
    useEffect(() => { setRascunho({ ancora: ficha.ancora || '', voz: ficha.voz || '', tom: ficha.tom || '' }); }, [ficha]);
    const sujo = rascunho.ancora !== (ficha.ancora || '') || (ficha.tipo === 'personagem' && (rascunho.voz !== (ficha.voz || '') || rascunho.tom !== (ficha.tom || '')));
    const tomInvalido = ficha.tipo === 'personagem' && rascunho.tom && !RE_TOM.test(rascunho.tom.trim());
    async function salvar() {
        if (tomInvalido) { setEstado({ tipo: 'erro', texto: 'Tom inválido: use "+2Hz", "-4Hz" (Edge) ou "+1st" (Piper).' }); return false; }
        setOcupado(true);
        const nova = { ...ficha, ancora: rascunho.ancora.trim() };
        if (ficha.tipo === 'personagem') { nova.voz = rascunho.voz || null; nova.tom = rascunho.tom.trim() || null; }
        const r = await onSalvar(nova);
        setOcupado(false);
        if (erroDe(r)) {
            setEstado({ tipo: 'erro', texto: erroDe(r) });
            avisar(`Falhou: ${erroDe(r)}`, 'erro', 5000);
            return false;
        }
        setEstado({ tipo: 'ok', texto: 'Salvo' });
        avisar(`Ficha de ${ficha.nome} salva`, 'ok');
        return true;
    }
    const mudar = (campo, valor) => { setRascunho((x) => ({ ...x, [campo]: valor })); setEstado({ tipo: '', texto: '' }); };
    return { rascunho, mudar, sujo, tomInvalido, salvar, estado, ocupado };
}

function Imagem({ serieId, ficha, caminho, alt, vazio }) {
    if (!caminho) {
        const Icone = ICONE_TIPO[ficha.tipo] || Ico.imagem;
        return (
            <div className="sem-foto">
                <Icone className="sem-foto-ico" aria-hidden="true" />
                <span>Sem imagem</span>
                {vazio && <small>{vazio}</small>}
            </div>
        );
    }
    return <img className="foto" src={urlDaFicha(serieId, ficha, caminho)} alt={alt || ''} loading="lazy" />;
}

// Estado da ficha: ícone + texto, nunca só a cor.
function EstadoFicha({ principal, candidatas }) {
    if (principal) return <span className="ficha-selo ok"><Ico.ok aria-hidden="true" />Com referência</span>;
    if (candidatas) return <span className="ficha-selo aviso"><Ico.rosto aria-hidden="true" />Escolher rosto</span>;
    return <span className="ficha-selo falta"><Ico.pendente aria-hidden="true" />Sem referência</span>;
}

function BotaoSalvar({ ed, rotulo = 'Salvar ficha' }) {
    return (
        <>
            {ed.estado.tipo === 'ok' && !ed.sujo && <span className="ficha-salvo" role="status"><Visto tamanho={14} />Salvo</span>}
            <button type="button" className="btn" disabled={!ed.sujo || ed.ocupado} onClick={ed.salvar} aria-busy={ed.ocupado}>
                {ed.ocupado && <Girador />}
                <Ico.salvar aria-hidden="true" /><span>{rotulo}</span>
            </button>
        </>
    );
}

function FichaPersonagem({ serieId, ficha, vozes, onSalvar, onCanonica, onGerar, preparando, destaque }) {
    const ed = useEdicaoFicha(ficha, onSalvar);
    const [escolhendo, setEscolhendo] = useState('');
    const [otimista, setOtimista] = useState(null); // rosto escolhido antes da resposta do servidor
    const [erroCanonica, setErroCanonica] = useState('');
    useEffect(() => { setOtimista(null); }, [ficha.canonica]);
    const canonicaAtual = otimista || ficha.canonica;
    const principal = imagemPrincipal(ficha);
    const refs = refsDaFicha(ficha).filter((r) => r.caminho !== principal);
    const candidatas = Array.isArray(ficha.candidatas) ? ficha.candidatas : [];
    const voz = vozes.find((v) => v.id === ed.rascunho.voz);
    const piper = String(ed.rascunho.voz || '').startsWith('piper:');
    const estadoAtual = (ficha.estados || []).find((e) => e.id === ficha.estadoAtual);

    async function escolher(c) {
        setEscolhendo(c.caminho);
        setOtimista(c.caminho);
        setErroCanonica('');
        const r = await onCanonica(ficha, c.caminho);
        setEscolhendo('');
        if (erroDe(r)) {
            setOtimista(null);
            setErroCanonica(erroDe(r));
            avisar(`Falhou: ${erroDe(r)}`, 'erro', 5000);
        }
    }

    return (
        <article className={`ficha${destaque ? ' destaque' : ''}`} id={`ficha-${ficha.id}`} aria-labelledby={`fn-${ficha.id}`}>
            <div className="ficha-midia">
                <div className={`retrato${principal ? '' : ' sem'}`}>
                    <Imagem serieId={serieId} ficha={ficha} caminho={principal} alt={`${ficha.nome}: imagem canônica`} vazio={candidatas.length && !principal ? 'Escolha o rosto entre as candidatas.' : null} />
                    <span className="retrato-veu" aria-hidden="true" />
                    <span className="retrato-topo"><EstadoFicha principal={principal} candidatas={candidatas.length > 0} /></span>
                    <div className="retrato-txt">
                        <h3 id={`fn-${ficha.id}`}>{ficha.nome}</h3>
                        {ficha.papel && <p>{ficha.papel}</p>}
                    </div>
                </div>
                {refs.length > 0 && (
                    <ul className="ficha-refs" aria-label="Outras referências">
                        {refs.map((r) => (
                            <li key={r.vista}>
                                <div className="ficha-ref-img"><Imagem serieId={serieId} ficha={ficha} caminho={r.caminho} alt={`${ficha.nome}: ${NOME_VISTA[r.vista] || r.vista}`} /></div>
                                <span>{NOME_VISTA[r.vista] || r.vista}</span>
                            </li>
                        ))}
                    </ul>
                )}
                {refsDaFicha(ficha).length === 0 && (candidatas.length === 0 || ficha.canonica) && (
                    <div className="ficha-gerar">
                        <button type="button" className="btn primario" onClick={() => onGerar(ficha)} disabled={Boolean(preparando)} aria-busy={preparando === ficha.id}>
                            {preparando === ficha.id && <Girador />}
                            <Ico.gerarImagem aria-hidden="true" />
                            <span>{ficha.canonica ? 'Gerar folha deste rosto' : 'Gerar folha de personagem'}</span>
                        </button>
                        <small>3 imagens: frente, perfil e corpo inteiro{ficha.canonica ? ', com o rosto canônico como referência' : ''}. O custo aparece antes.</small>
                    </div>
                )}
            </div>

            <div className="ficha-corpo">
                {ficha.obs && (
                    <p className={/aten[cç][aã]o|ainda n[aã]o/i.test(ficha.obs) ? 'nota-aviso' : 'ficha-obs'}>
                        {/aten[cç][aã]o|ainda n[aã]o/i.test(ficha.obs) ? <Ico.aviso aria-hidden="true" /> : <Ico.info aria-hidden="true" />}
                        <span>{ficha.obs}</span>
                    </p>
                )}

                {candidatas.length > 0 && (
                    <fieldset className="candidatas">
                        <legend>
                            <Ico.rosto aria-hidden="true" />Rosto canônico
                            <span className="suave">{canonicaAtual ? 'As outras ficam fora.' : `${candidatas.length} candidatas. Escolha uma.`}</span>
                        </legend>
                        <ul>
                            {candidatas.map((c) => {
                                const canonica = canonicaAtual === c.caminho;
                                const fora = Boolean(canonicaAtual) && !canonica;
                                const salvando = escolhendo === c.caminho;
                                return (
                                    <li key={c.caminho} className={`${canonica ? 'canonica' : ''}${fora ? ' fora' : ''}`}>
                                        <button
                                            type="button"
                                            className="candidata"
                                            aria-pressed={canonica}
                                            disabled={Boolean(escolhendo)}
                                            onClick={() => !canonica && escolher(c)}
                                            title={canonica ? 'Rosto canônico atual' : 'Usar este rosto como canônico'}
                                        >
                                            <img className="foto" src={urlDaFicha(serieId, ficha, c.caminho)} alt={`Candidata: ${c.original || c.caminho}`} loading="lazy" />
                                            {canonica && <motion.span layoutId={`anel-${ficha.id}`} className="candidata-anel" transition={MOV.mola} aria-hidden="true" />}
                                            <AnimatePresence>
                                                {canonica && !salvando && (
                                                    <motion.span
                                                        className="candidata-marca"
                                                        initial={{ scale: 0, opacity: 0 }}
                                                        animate={{ scale: 1, opacity: 1, transition: MOV.mola }}
                                                        exit={{ scale: 0.6, opacity: 0, transition: { duration: MOV.rapido } }}
                                                        aria-hidden="true"
                                                    >
                                                        <Ico.ok />
                                                    </motion.span>
                                                )}
                                            </AnimatePresence>
                                            {salvando && <span className="candidata-girando" aria-hidden="true"><Girador /></span>}
                                        </button>
                                        <span className="candidata-rot">
                                            {canonica
                                                ? <span className="estado ok">{salvando ? 'Salvando…' : 'Canônica'}</span>
                                                : <span className="estado neutro">{fora ? 'Fora' : 'Usar este'}</span>}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                        {erroCanonica && <p className="nota-erro" role="alert"><Ico.erro aria-hidden="true" />{erroCanonica}</p>}
                    </fieldset>
                )}

                <label className="campo" htmlFor={`${ficha.id}-ancora`}>
                    <span>Prompt âncora</span>
                    <textarea id={`${ficha.id}-ancora`} className="entrada" rows={3} value={ed.rascunho.ancora} onChange={(e) => ed.mudar('ancora', e.target.value)} />
                    <small>Entra em todo plano em que {ficha.nome} aparece, para manter o mesmo rosto e roupa.</small>
                </label>

                <div className="ficha-voz">
                    <label className="campo" htmlFor={`${ficha.id}-voz`}>
                        <span>Voz</span>
                        <select id={`${ficha.id}-voz`} className="entrada" value={ed.rascunho.voz} onChange={(e) => ed.mudar('voz', e.target.value)}>
                            {!ed.rascunho.voz && <option value="">Escolha uma voz</option>}
                            {vozes.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
                            {ed.rascunho.voz && !voz && vozes.length > 0 && <option value={ed.rascunho.voz} disabled>{ed.rascunho.voz} (fora da lista)</option>}
                        </select>
                        <small>{voz ? `${voz.motor}, ${voz.uso}` : 'Só as vozes recomendadas (vozes.json), todas falando português.'}</small>
                    </label>
                    <label className="campo campo-tom" htmlFor={`${ficha.id}-tom`}>
                        <span>Tom</span>
                        <input id={`${ficha.id}-tom`} className="entrada num" type="text" value={ed.rascunho.tom} placeholder={piper ? '+0st' : '+0Hz'} onChange={(e) => ed.mudar('tom', e.target.value)} aria-invalid={ed.tomInvalido || undefined} />
                        <small className={ed.tomInvalido ? 'campo-erro' : ''}>{piper ? 'Piper: de −2st a +2st' : 'Edge: de −10Hz a +10Hz'}</small>
                    </label>
                </div>

                {estadoAtual && (
                    <p className="ficha-estado"><Ico.historico aria-hidden="true" /><span><strong>Estado atual:</strong> {estadoAtual.id}{estadoAtual.descricao ? `, ${estadoAtual.descricao}` : ''}{estadoAtual.desde ? ` (desde ${estadoAtual.desde})` : ''}</span></p>
                )}

                <div className="ficha-rodape">
                    {ed.estado.tipo === 'erro' && <span className="estado perigo" role="alert">{ed.estado.texto}</span>}
                    <BotaoSalvar ed={ed} />
                </div>
            </div>
        </article>
    );
}

function FichaCartao({ serieId, ficha, onSalvar, onGerar, preparando, destaque }) {
    const ed = useEdicaoFicha(ficha, onSalvar);
    const [editando, setEditando] = useState(false);
    const principal = imagemPrincipal(ficha);
    const rotGerar = ficha.tipo === 'local' ? 'Gerar plano de referência' : 'Gerar referência';
    return (
        <article className={`cartao-ficha${destaque ? ' destaque' : ''}${principal ? '' : ' sem-imagem'}`} id={`ficha-${ficha.id}`} aria-labelledby={`fn-${ficha.id}`}>
            <div className="cartao-ficha-img">
                <Imagem serieId={serieId} ficha={ficha} caminho={principal} alt={ficha.nome} />
                <span className="retrato-veu" aria-hidden="true" />
                <div className="retrato-txt">
                    <h3 id={`fn-${ficha.id}`}>{ficha.nome}</h3>
                </div>
            </div>
            <div className="cartao-ficha-corpo">
                {ficha.onde && <p className="cartao-ficha-onde"><Ico.local aria-hidden="true" />Fica em: {ficha.onde}</p>}
                {!editando && <p className={`cartao-ficha-ancora${ficha.ancora ? '' : ' suave'}`}>{ficha.ancora || 'Sem prompt âncora ainda.'}</p>}
                <Expandir aberto={editando}>
                    <div className="cartao-ficha-edicao">
                        <label className="campo" htmlFor={`${ficha.id}-ancora`}>
                            <span>Prompt âncora</span>
                            <textarea id={`${ficha.id}-ancora`} className="entrada" rows={4} value={ed.rascunho.ancora} onChange={(e) => ed.mudar('ancora', e.target.value)} />
                        </label>
                        <div className="acoes">
                            <button type="button" className="btn mini" onClick={() => { ed.mudar('ancora', ficha.ancora || ''); setEditando(false); }}>Cancelar</button>
                            <button
                                type="button"
                                className="btn mini primario"
                                disabled={!ed.sujo || ed.ocupado}
                                aria-busy={ed.ocupado}
                                onClick={async () => { if (await ed.salvar()) setEditando(false); }}
                            >
                                {ed.ocupado && <Girador />}
                                <Ico.salvar aria-hidden="true" /><span>Salvar</span>
                            </button>
                        </div>
                    </div>
                </Expandir>
                {ed.estado.tipo === 'erro' && <span className="estado perigo" role="alert">{ed.estado.texto}</span>}
                <div className="cartao-ficha-acoes">
                    {!editando && (
                        <button type="button" className="btn mini" onClick={() => setEditando(true)}>
                            <Ico.editar aria-hidden="true" />Editar âncora
                        </button>
                    )}
                    {!principal && (
                        <button type="button" className="btn mini" onClick={() => onGerar(ficha)} disabled={Boolean(preparando)} aria-busy={preparando === ficha.id}>
                            {preparando === ficha.id && <Girador />}
                            <Ico.gerarImagem aria-hidden="true" /><span>{rotGerar}</span>
                        </button>
                    )}
                </div>
            </div>
        </article>
    );
}

export default function ElencoLocais({ serieId, dados, recarregar, params, irPara }) {
    const sub = SUBS.some((s) => s.id === params.get('sub')) ? params.get('sub') : 'elenco';
    const fichaAlvo = params.get('ficha');
    const [vozes, setVozes] = useState([]);
    const [erroVozes, setErroVozes] = useState('');
    const [preparando, setPreparando] = useState(null);
    const [geracao, setGeracao] = useState(null);
    const [gerando, setGerando] = useState(false);
    const [progresso, setProgresso] = useState('');
    const [erroGer, setErroGer] = useState('');

    useEffect(() => {
        IntencoesFala().then((r) => {
            if (erroDe(r)) { setErroVozes(erroDe(r)); return; }
            setVozes(r.vozes || []);
        });
    }, []);

    useEffect(() => {
        if (!fichaAlvo) return;
        const el = document.getElementById(`ficha-${fichaAlvo}`);
        if (el) el.scrollIntoView({ block: 'start' });
    }, [fichaAlvo, sub]);

    const listas = { elenco: dados.elenco, locais: dados.locais, objetos: dados.objetos };
    const lista = (listas[sub] || []).filter((f) => !f.erro);
    const comErro = (listas[sub] || []).filter((f) => f.erro);
    const contagem = Object.fromEntries(SUBS.map((s) => [s.id, (listas[s.id] || []).length]));

    const salvarFicha = async (ficha) => {
        const r = await SalvarFicha({ serie: serieId, tipo: PASTA_DO_TIPO[ficha.tipo], ficha });
        if (!erroDe(r)) recarregar();
        return r;
    };

    const definirCanonica = async (ficha, caminho) => {
        const r = await DefinirCanonica({ serie: serieId, tipo: PASTA_DO_TIPO[ficha.tipo], id: ficha.id, caminho });
        if (!erroDe(r)) {
            avisar(`Rosto canônico de ${ficha.nome} definido`, 'ok');
            recarregar();
        }
        return r;
    };

    // Passo 1: cota cada imagem (grátis) e abre a confirmação com o total.
    async function prepararGeracao(ficha) {
        const vistas = VISTAS[ficha.tipo] || VISTAS.objeto;
        const pasta = PASTA_DO_TIPO[ficha.tipo];
        const estado = ficha.estadoAtual || 'padrao';
        const modelo = (dados.serie.modelos && dados.serie.modelos.imagem) || 'google/gemini-3.1-flash-image';
        // Personagem com rosto canônico: a folha usa esse rosto como referência (mesma pessoa nas 3 vistas).
        const referencias = ficha.tipo === 'personagem' && ficha.canonica ? [caminhoDaFicha(ficha, ficha.canonica)] : [];
        setPreparando(ficha.id);
        setErroGer('');
        const itens = [];
        for (const v of vistas) {
            const pedido = {
                modelo,
                prompt: referencias.length ? `${promptDe(ficha, v)} Mesmo rosto, cabelo e roupa da imagem de referência.` : promptDe(ficha, v),
                proporcao: '9:16',
                destino: `${pasta}/${ficha.id}/ref/${estado}-${v.id}.png`,
                etapa: 'elenco',
                ref: `${ficha.id}/${v.id}`,
            };
            if (referencias.length) pedido.referencias = referencias;
            const r = await CotarGeracao({ tipo: 'imagem', serie: serieId, pedido });
            if (erroDe(r)) {
                setPreparando(null);
                const msg = `Não consegui cotar ${v.nome.toLowerCase()}: ${erroDe(r)}`;
                setErroGer(msg);
                avisar(msg, 'erro', 5000);
                return;
            }
            itens.push({ vista: v, pedido, cot: r });
        }
        setPreparando(null);
        setGeracao({ ficha, pasta, itens });
    }

    // Passo 2 (só depois do clique em "Gerar por US$ X"): gera com o token de cada cotação e registra na ficha.
    async function confirmarGeracao() {
        if (!geracao) return;
        const { ficha, pasta, itens } = geracao;
        setGerando(true);
        setErroGer('');
        const refs = {};
        const prefixo = `${pasta}/${ficha.id}/`;
        for (const [i, it] of itens.entries()) {
            setProgresso(`Gerando ${i + 1} de ${itens.length}: ${it.vista.nome.toLowerCase()}…`);
            const r = await GerarImagem({ serie: serieId, pedido: it.pedido, token: it.cot.token });
            if (erroDe(r)) { setErroGer(`${it.vista.nome}: ${erroDe(r)}`); break; }
            const arquivo = (r.arquivos && r.arquivos[0]) || (r.job && r.job.arquivos && r.job.arquivos[0]);
            if (arquivo) refs[it.vista.id] = arquivo.startsWith(prefixo) ? arquivo.slice(prefixo.length) : arquivo;
        }
        window.dispatchEvent(new Event('estudio:gasto'));
        if (Object.keys(refs).length) {
            setProgresso('Registrando na ficha…');
            const nova = structuredClone(ficha);
            nova.estados = Array.isArray(nova.estados) && nova.estados.length ? nova.estados : [{ id: 'padrao', desde: null, descricao: '', refs: {} }];
            const est = nova.estados.find((e) => e.id === nova.estadoAtual) || nova.estados[0];
            est.refs = { ...(est.refs || {}), ...refs };
            if (!nova.canonica) nova.canonica = refs.frente || refs.geral || Object.values(refs)[0];
            const r = await SalvarFicha({ serie: serieId, tipo: pasta, ficha: nova });
            if (erroDe(r)) setErroGer(`As imagens foram geradas, mas não consegui registrar na ficha: ${erroDe(r)}`);
        }
        setGerando(false);
        setProgresso('');
        if (Object.keys(refs).length === itens.length) {
            setGeracao(null);
            avisar(`${ficha.nome}: ${itens.length} ${itens.length === 1 ? 'imagem gerada' : 'imagens geradas'}`, 'ok', 4000);
        }
        recarregar();
    }

    const totalGer = geracao ? geracao.itens.reduce((s, it) => s + (Number(it.cot.custoPrevistoUsd) || 0), 0) : 0;
    const orc = geracao && geracao.itens[0] ? geracao.itens[0].cot.orcamento || {} : {};
    const avisosGer = geracao ? [...new Set(geracao.itens.flatMap((it) => it.cot.avisos || []))] : [];
    const subAtual = SUBS.find((s) => s.id === sub);

    return (
        <div className="elenco">
            <div className="elenco-sub" role="group" aria-label="Tipo de ficha">
                {SUBS.map((s) => {
                    const Icone = s.icone;
                    const ativo = sub === s.id;
                    return (
                        <button key={s.id} type="button" className={ativo ? 'ativo' : ''} aria-pressed={ativo} onClick={() => irPara('elenco', { sub: s.id === 'elenco' ? undefined : s.id })}>
                            {ativo && <motion.span layoutId="elenco-sub-marca" className="elenco-sub-marca" transition={MOV.mola} />}
                            <Icone aria-hidden="true" />
                            <span>{s.rotulo}</span>
                            <span className="num elenco-sub-n">{contagem[s.id]}</span>
                        </button>
                    );
                })}
            </div>

            {erroGer && !geracao && <p className="nota-erro" role="alert"><Ico.erro aria-hidden="true" />{erroGer}</p>}
            {erroVozes && sub === 'elenco' && <p className="nota-aviso"><Ico.aviso aria-hidden="true" />Não consegui ler as vozes recomendadas: {erroVozes}</p>}
            {comErro.map((f) => <p key={f.id} className="nota-erro"><Ico.erro aria-hidden="true" />Ficha {f.id} com problema: {f.erro}</p>)}

            <Trocar chave={sub}>
                {lista.length === 0 && (
                    <Vazio icone={subAtual.icone} titulo={`Nenhuma ficha em ${subAtual.rotulo.toLowerCase()}`} texto="As fichas nascem da bíblia (etapa 2) ou de uma pasta importada." />
                )}

                {sub === 'elenco' && lista.length > 0 && (
                    <div className="fichas">
                        {lista.map((f) => (
                            <FichaPersonagem
                                key={f.id}
                                serieId={serieId}
                                ficha={f}
                                vozes={vozes}
                                onSalvar={salvarFicha}
                                onCanonica={definirCanonica}
                                onGerar={prepararGeracao}
                                preparando={preparando}
                                destaque={fichaAlvo === f.id}
                            />
                        ))}
                    </div>
                )}
                {sub !== 'elenco' && lista.length > 0 && (
                    <Lista as="ul" className="grade-fichas">
                        {lista.map((f) => (
                            <Item as="li" key={f.id}>
                                <FichaCartao serieId={serieId} ficha={f} onSalvar={salvarFicha} onGerar={prepararGeracao} preparando={preparando} destaque={fichaAlvo === f.id} />
                            </Item>
                        ))}
                    </Lista>
                )}
            </Trocar>

            <ConfirmarCusto
                aberto={Boolean(geracao)}
                titulo={geracao ? (geracao.ficha.tipo === 'personagem' ? `Folha de personagem — ${geracao.ficha.nome}` : `Referência — ${geracao.ficha.nome}`) : ''}
                descricao={geracao ? `${geracao.itens.length} ${geracao.itens.length === 1 ? 'imagem' : 'imagens'} com ${geracao.itens[0].cot.nomeModelo || geracao.itens[0].cot.modelo}.` : ''}
                itens={geracao ? geracao.itens.map((it) => ({
                    descricao: `${it.vista.nome} · ${(it.cot.parametros && it.cot.parametros.resolucao) || ''} ${(it.cot.parametros && it.cot.parametros.proporcao) || ''}`.trim(),
                    usd: it.cot.custoPrevistoUsd,
                    estimativa: it.cot.estimativa,
                })) : []}
                totalUsd={totalGer}
                teto={orc.tetos ? { rotulo: 'Teto da série', tetoUsd: orc.tetos.serie, gastoUsd: orc.gastoSerieUsd || 0 } : undefined}
                avisos={avisosGer}
                simulado={geracao ? geracao.itens.some((it) => it.cot.simulado) : false}
                arquivos={geracao ? geracao.itens.map((it) => it.pedido.destino) : []}
                ocupado={gerando}
                progresso={progresso}
                erro={erroGer}
                onCancelar={() => { setGeracao(null); setErroGer(''); }}
                onConfirmar={confirmarGeracao}
            />
        </div>
    );
}
