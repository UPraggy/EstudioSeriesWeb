import { useEffect, useMemo, useState } from 'react';
import { SalvarBiblia, rotaIndisponivel } from '../funcionalidades/bancoGet';
import { erroDe } from '../funcionalidades/fetchFunc';
import { Ico } from '../subComponents/icones';
import { AnimatePresence, Girador, MOV, Visto, avisar, motion } from '../subComponents/Movimento';
import '../../assets/css/Biblia.css';

// Botão "remover" só com ícone (aparece no hover da linha; sempre visível no foco e no celular).
function Remover({ rotulo, onClick }) {
    return (
        <button type="button" className="btn mini icone tira" aria-label={rotulo} title={rotulo} onClick={onClick}>
            <Ico.apagar aria-hidden="true" />
        </button>
    );
}

const CAMPOS = ['premissa', 'regras', 'recursos', 'objetos', 'misterios', 'segredos'];
const NOMES_RECURSO = { agua: 'Água', comida: 'Comida', energia: 'Energia', comunicacao: 'Comunicação' };

function copiar(biblia) {
    const c = {};
    for (const k of CAMPOS) c[k] = structuredClone(biblia[k] ?? (k === 'premissa' ? '' : k === 'recursos' ? {} : k === 'segredos' ? { personagens: [], publico: [] } : []));
    c.segredos = { personagens: [], publico: [], ...c.segredos };
    return c;
}

const linhas = (texto, largura = 90) => Math.max(1, Math.ceil(String(texto || '').length / largura));

// Lista de frases editável (regras, mistérios, segredos).
function ListaEditavel({ id, itens, onChange, singular, vazio }) {
    return (
        <div className="lista-ed">
            {itens.length === 0 && <p className="suave lista-vazia">{vazio}</p>}
            <ol>
                <AnimatePresence initial={false}>
                    {itens.map((t, i) => (
                        <motion.li
                            key={i}
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0, transition: { duration: MOV.rapido, ease: MOV.enfatico } }}
                            exit={{ opacity: 0, transition: { duration: 0.08 } }}
                        >
                            <span className="lista-n num" aria-hidden="true">{i + 1}</span>
                            <textarea
                                className="entrada"
                                rows={linhas(t)}
                                value={t}
                                aria-label={`${singular} ${i + 1}`}
                                onChange={(e) => onChange(itens.map((x, k) => (k === i ? e.target.value : x)))}
                            />
                            <Remover rotulo={`Remover ${singular.toLowerCase()} ${i + 1}`} onClick={() => onChange(itens.filter((_, k) => k !== i))} />
                        </motion.li>
                    ))}
                </AnimatePresence>
            </ol>
            <button type="button" className="btn mini fantasma" id={id} onClick={() => onChange([...itens, ''])}>
                <Ico.novo className="ico-pular" aria-hidden="true" />Adicionar {singular.toLowerCase()}
            </button>
        </div>
    );
}

export default function Biblia({ serieId, dados, recarregar }) {
    const original = useMemo(() => copiar(dados.biblia), [dados.biblia]);
    const [b, setB] = useState(original);
    const [estado, setEstado] = useState({ tipo: '', texto: '' });
    const [ocupado, setOcupado] = useState(false);
    const [novoRecurso, setNovoRecurso] = useState('');

    useEffect(() => { setB(original); }, [original]);

    const sujo = JSON.stringify(b) !== JSON.stringify(original);
    const mudar = (campo, valor) => { setB((x) => ({ ...x, [campo]: valor })); setEstado({ tipo: '', texto: '' }); };

    // Avisa antes de sair da página com alterações não salvas.
    useEffect(() => {
        if (!sujo) return undefined;
        const aviso = (e) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', aviso);
        return () => window.removeEventListener('beforeunload', aviso);
    }, [sujo]);

    async function salvar() {
        setOcupado(true);
        const campos = {
            ...b,
            regras: b.regras.map((t) => t.trim()).filter(Boolean),
            misterios: b.misterios.map((t) => t.trim()).filter(Boolean),
            segredos: { ...b.segredos, personagens: b.segredos.personagens.map((t) => t.trim()).filter(Boolean), publico: b.segredos.publico.map((t) => t.trim()).filter(Boolean) },
            objetos: b.objetos.filter((o) => String(o.id || '').trim()).map((o) => ({ ...o, id: String(o.id).trim(), onde: String(o.onde || '').trim() })),
        };
        const r = await SalvarBiblia({ serie: serieId, campos });
        setOcupado(false);
        if (rotaIndisponivel(r)) {
            setEstado({ tipo: 'aviso', texto: 'Salvar está indisponível: a rota SalvarBiblia ainda não foi registrada no servidor. Suas alterações continuam nesta tela.' });
            avisar('Salvar a bíblia ainda não está no servidor', 'aviso');
            return;
        }
        if (erroDe(r)) {
            setEstado({ tipo: 'erro', texto: erroDe(r) });
            avisar(`Falhou: ${erroDe(r)}`, 'erro', 5000);
            return;
        }
        setEstado({ tipo: 'ok', texto: 'Salva em biblia.json (o anterior ficou no backup).' });
        avisar('Bíblia salva', 'ok');
        recarregar();
    }

    const escolhas = Array.isArray(dados.biblia.escolhas) ? dados.biblia.escolhas : [];
    const cronologia = Array.isArray(dados.biblia.cronologia) ? dados.biblia.cronologia : [];

    return (
        <div className="biblia">
            <div className="biblia-barra" role="region" aria-label="Salvar a bíblia">
                <span aria-live="polite" className="biblia-situacao">
                    {sujo
                        ? <span className="estado aviso">Alterações não salvas</span>
                        : estado.tipo === 'ok'
                            ? <span className="biblia-salva"><Visto tamanho={16} />{estado.texto}</span>
                            : <span className="estado neutro">Sem alterações</span>}
                </span>
                <div className="acoes">
                    <button type="button" className="btn" disabled={!sujo || ocupado} onClick={() => { setB(original); setEstado({ tipo: '', texto: '' }); }}>
                        <Ico.desfazer aria-hidden="true" />Desfazer
                    </button>
                    <button type="button" className="btn primario" disabled={!sujo || ocupado} onClick={salvar} aria-busy={ocupado}>
                        {ocupado && <Girador />}
                        <Ico.salvar aria-hidden="true" /><span>Salvar bíblia</span>
                    </button>
                </div>
            </div>
            {estado.texto && estado.tipo !== 'ok' && (
                <p className={estado.tipo === 'erro' ? 'nota-erro' : 'nota-aviso'} role={estado.tipo === 'erro' ? 'alert' : 'status'}>
                    {estado.tipo === 'erro' ? <Ico.erro aria-hidden="true" /> : <Ico.aviso aria-hidden="true" />}{estado.texto}
                </p>
            )}

            <div className="biblia-grade">
                <div className="biblia-col">
                    <section className="secao biblia-bloco" aria-labelledby="h-premissa-b">
                        <div className="secao-cab"><h2 id="h-premissa-b"><Ico.showrunner aria-hidden="true" />Premissa</h2></div>
                        {!b.premissa && !(dados.biblia && dados.biblia.premissa) && (
                            <p className="nota-aviso">
                                <Ico.info aria-hidden="true" />
                                <span>
                                    A bíblia desta série ainda está vazia. Gere em <strong>Visão geral → Gerar bíblia e mapa</strong> e clique em
                                    {' '}<strong>Aprovar e salvar bíblia</strong>, ou escreva a premissa aqui. Ideia da série: {String((dados.serie && dados.serie.ideia) || '').slice(0, 240)}{String((dados.serie && dados.serie.ideia) || '').length > 240 ? '…' : ''}
                                </span>
                            </p>
                        )}
                        <textarea className="entrada biblia-premissa" rows={Math.max(3, linhas(b.premissa, 80))} value={b.premissa} onChange={(e) => mudar('premissa', e.target.value)} aria-labelledby="h-premissa-b" />
                    </section>
                    <section className="secao biblia-bloco" aria-labelledby="h-regras">
                        <div className="secao-cab"><h2 id="h-regras"><Ico.bloqueado aria-hidden="true" />Regras do mundo</h2><p>O que nunca pode ser contrariado.</p></div>
                        <ListaEditavel id="add-regra" itens={b.regras} onChange={(v) => mudar('regras', v)} singular="Regra" vazio="Nenhuma regra ainda." />
                    </section>
                    <section className="secao biblia-bloco" aria-labelledby="h-misterios">
                        <div className="secao-cab"><h2 id="h-misterios"><Ico.buscar aria-hidden="true" />Mistérios</h2><p>Perguntas em aberto para o público.</p></div>
                        <ListaEditavel id="add-misterio" itens={b.misterios} onChange={(v) => mudar('misterios', v)} singular="Mistério" vazio="Nenhum mistério ainda." />
                    </section>
                    <section className="secao biblia-bloco" aria-labelledby="h-segredos">
                        <div className="secao-cab"><h2 id="h-segredos"><Ico.ocultar aria-hidden="true" />Segredos</h2></div>
                        <h3 className="biblia-sub">Que o público sabe e os personagens não</h3>
                        <ListaEditavel id="add-seg-pub" itens={b.segredos.publico} onChange={(v) => mudar('segredos', { ...b.segredos, publico: v })} singular="Segredo" vazio="Nenhum." />
                        <h3 className="biblia-sub">Que os personagens guardam</h3>
                        <ListaEditavel id="add-seg-per" itens={b.segredos.personagens} onChange={(v) => mudar('segredos', { ...b.segredos, personagens: v })} singular="Segredo" vazio="Nenhum." />
                    </section>
                </div>

                <div className="biblia-col">
                    <section className="secao biblia-bloco" aria-labelledby="h-recursos">
                        <div className="secao-cab"><h2 id="h-recursos"><Ico.velocidade aria-hidden="true" />Recursos</h2><p>O que os personagens ainda têm.</p></div>
                        <div className="painel recursos">
                            {Object.entries(b.recursos).map(([k, v]) => (
                                <label key={k} className="campo recurso">
                                    <span>{NOMES_RECURSO[k] || k}</span>
                                    <div className="recurso-linha">
                                        <input className="entrada" type="text" value={v} onChange={(e) => mudar('recursos', { ...b.recursos, [k]: e.target.value })} />
                                        <Remover rotulo={`Remover recurso ${NOMES_RECURSO[k] || k}`} onClick={() => { const r = { ...b.recursos }; delete r[k]; mudar('recursos', r); }} />
                                    </div>
                                </label>
                            ))}
                            <form
                                className="recurso-novo"
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    const k = novoRecurso.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
                                    if (!k || b.recursos[k] !== undefined) return;
                                    mudar('recursos', { ...b.recursos, [k]: '' });
                                    setNovoRecurso('');
                                }}
                            >
                                <input className="entrada" type="text" placeholder="Novo recurso (ex.: remédios)" value={novoRecurso} onChange={(e) => setNovoRecurso(e.target.value)} aria-label="Nome do novo recurso" />
                                <button type="submit" className="btn mini" disabled={!novoRecurso.trim()}><Ico.novo className="ico-pular" aria-hidden="true" />Adicionar</button>
                            </form>
                        </div>
                    </section>

                    <section className="secao biblia-bloco" aria-labelledby="h-objetos-b">
                        <div className="secao-cab"><h2 id="h-objetos-b"><Ico.objeto aria-hidden="true" />Objetos e onde estão</h2></div>
                        <div className="tabela-wrap">
                            <table className="tabela objetos-tab">
                                <thead><tr><th scope="col">Objeto (id)</th><th scope="col">Onde está</th><th scope="col"><span className="sr">Ações</span></th></tr></thead>
                                <tbody>
                                    {b.objetos.map((o, i) => (
                                        <tr key={i}>
                                            <td><input className="entrada" type="text" value={o.id || ''} aria-label={`Objeto ${i + 1}`} onChange={(e) => mudar('objetos', b.objetos.map((x, k) => (k === i ? { ...x, id: e.target.value } : x)))} /></td>
                                            <td><input className="entrada" type="text" value={o.onde || ''} aria-label={`Onde está o objeto ${i + 1}`} onChange={(e) => mudar('objetos', b.objetos.map((x, k) => (k === i ? { ...x, onde: e.target.value } : x)))} /></td>
                                            <td><Remover rotulo={`Remover objeto ${o.id || i + 1}`} onClick={() => mudar('objetos', b.objetos.filter((_, k) => k !== i))} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <button type="button" className="btn mini fantasma biblia-add" onClick={() => mudar('objetos', [...b.objetos, { id: '', onde: '' }])}>
                            <Ico.novo className="ico-pular" aria-hidden="true" />Adicionar objeto
                        </button>
                    </section>

                    <section className="secao biblia-bloco" aria-labelledby="h-escolhas">
                        <div className="secao-cab"><h2 id="h-escolhas"><Ico.escolha aria-hidden="true" />Escolhas votadas</h2><p>Entram sozinhas ao registrar a votação.</p></div>
                        {escolhas.length === 0 ? <p className="suave lista-vazia">Nenhuma escolha ainda.</p> : (
                            <ul className="escolhas painel">
                                {escolhas.map((e) => (
                                    <li key={e.ep}>
                                        <span className="num escolha-ep">Ep. {String(e.ep).padStart(2, '0')}</span>
                                        <span className="escolha-txt"><strong>A</strong> {e.A} <span className="suave">·</span> <strong>B</strong> {e.B}</span>
                                        <span className={`estado ${e.vencedora ? 'ok' : 'neutro'}`}>{e.vencedora ? (e.vencedora === 'empate' ? 'Empate' : `${e.vencedora} venceu`) : 'Sem votação'}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    {cronologia.length > 0 && (
                        <section className="secao biblia-bloco" aria-labelledby="h-crono">
                            <div className="secao-cab"><h2 id="h-crono"><Ico.historico aria-hidden="true" />Cronologia</h2></div>
                            <ol className="escolhas painel">
                                {cronologia.map((c, i) => <li key={i}><span className="num escolha-ep">Ep. {String(c.ep).padStart(2, '0')}</span><span className="escolha-txt">{c.evento}</span></li>)}
                            </ol>
                        </section>
                    )}
                </div>
            </div>
        </div>
    );
}
