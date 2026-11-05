import { useCallback, useEffect, useState } from 'react';
import GlobalVar from './subComponents/GlobalVar';
import { Ico } from './subComponents/icones';
import { Expandir, Girador, Lista, Item, avisar } from './subComponents/Movimento';
import { NO_PAGES, estadoMotor, ouvirMotor, motorPreferido, trocarMotor, enderecoAjudante } from './funcionalidades/motor';
import { SaldoOpenRouter, RetomarJobs } from './funcionalidades/bancoGet';
import { erroDe } from './funcionalidades/fetchFunc';
import { saldoDisponivel } from './subComponents/ConfirmarCusto';
import '../assets/css/Configuracoes.css';

// Configurações do site: onde o Estúdio roda (navegador ou PC), onde ficam as séries, a chave do OpenRouter,
// gerações pendentes e o que ainda precisa do PC. Ver docs/MOTOR-NAVEGADOR.md.

// O que ainda depende de ffmpeg/Python (rotas em motorNavegador/entrada.js → ROTAS_SO_NO_PC).
const SO_NO_PC = [
    { icone: Ico.voz, texto: 'Vozes: gerar, ouvir e regerar as falas e a narração' },
    { icone: Ico.ouvir, texto: 'Teste de pronúncia (Whisper)' },
    { icone: Ico.efeito, texto: 'Mixagem e tratamento do áudio' },
    { icone: Ico.grade, texto: 'Miniaturas, forma de onda e quadro dos clipes na Mesa' },
    { icone: Ico.montar, texto: 'Montagem final do episódio (render)' },
];

function useMotorEstado() {
    const [m, setM] = useState(estadoMotor());
    useEffect(() => ouvirMotor(setM), []);
    return m;
}

function mb(bytes) {
    if (!Number.isFinite(bytes)) return '—';
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1).replace('.', ',')} GB`;
    return `${Math.max(0.1, bytes / 1024 ** 2).toFixed(1).replace('.', ',')} MB`;
}

// ---------------- onde o Estúdio roda ----------------
function SecaoMotor({ motor }) {
    if (!NO_PAGES) {
        return (
            <section className="secao" aria-labelledby="cfg-motor">
                <div className="secao-cab"><h2 id="cfg-motor"><Ico.computador aria-hidden="true" />Onde o Estúdio roda</h2></div>
                <div className="cfg-cartao">
                    <p><strong>No Estúdio deste PC</strong> (aberto pelo <code>Abrir Estudio.vbs</code> ou <code>npm run dev</code>). Tudo funciona, inclusive vozes e montagem.</p>
                </div>
            </section>
        );
    }
    const atual = motorPreferido();
    const opcoes = [
        {
            id: 'navegador', icone: Ico.series, titulo: 'Neste navegador',
            texto: 'Sem instalar nada, no PC e no celular. Séries guardadas no navegador ou numa pasta do computador; IA com a sua chave.',
        },
        {
            id: 'ajudante', icone: Ico.computador, titulo: 'Estúdio do PC',
            texto: `Usa o Estúdio aberto neste computador (${enderecoAjudante()}). Tudo funciona, inclusive vozes e montagem. Só no PC.`,
        },
    ];
    return (
        <section className="secao" aria-labelledby="cfg-motor">
            <div className="secao-cab">
                <h2 id="cfg-motor"><Ico.computador aria-hidden="true" />Onde o Estúdio roda</h2>
                <p>Trocar recarrega a página.</p>
            </div>
            <div className="cfg-opcoes" role="radiogroup" aria-labelledby="cfg-motor">
                {opcoes.map((o) => {
                    const Icone = o.icone;
                    const ativo = atual === o.id;
                    return (
                        <button
                            key={o.id}
                            type="button"
                            role="radio"
                            aria-checked={ativo}
                            className={`cfg-opcao${ativo ? ' ativo' : ''}`}
                            onClick={() => { if (!ativo) trocarMotor(o.id); }}
                        >
                            <span className="cfg-opcao-ico" aria-hidden="true"><Icone /></span>
                            <span className="cfg-opcao-txt">
                                <strong>{o.titulo}{ativo && <span className="cfg-selo">em uso</span>}</strong>
                                <span>{o.texto}</span>
                            </span>
                        </button>
                    );
                })}
            </div>
            {motor.modo === 'ajudante' && <p className="cfg-nota"><Ico.conectado aria-hidden="true" />Conectado ao Estúdio do PC.</p>}
        </section>
    );
}

// ---------------- onde ficam as séries ----------------
function SecaoArmazem() {
    const [s, setS] = useState(null);
    const [cap, setCap] = useState({});
    const [ocupado, setOcupado] = useState(false);
    const carregar = useCallback(async () => {
        const cli = await import('../motorNavegador/cliente.js');
        setCap(cli.capacidades());
        setS({ ...(await cli.situacaoNavegador()), preferencia: cli.preferenciaArmazem() });
    }, []);
    useEffect(() => { carregar(); }, [carregar]);

    async function usarPasta() {
        setOcupado(true);
        try {
            const arm = await import('../motorNavegador/armazens.js');
            const cli = await import('../motorNavegador/cliente.js');
            await arm.escolherPasta();
            cli.definirPreferenciaArmazem('pasta');
            window.location.reload();
        } catch (e) {
            setOcupado(false);
            if (e && e.name === 'AbortError') return;
            avisar(`Não consegui usar a pasta: ${e.message}`, 'erro');
        }
    }

    async function voltarInterno() {
        const cli = await import('../motorNavegador/cliente.js');
        cli.definirPreferenciaArmazem('interno');
        window.location.reload();
    }

    async function pedirPersistencia() {
        const cli = await import('../motorNavegador/cliente.js');
        const ok = await cli.pedirPersistencia();
        avisar(ok ? 'O navegador não vai apagar as séries para liberar espaço' : 'O navegador não aceitou agora (instalar o site como app ajuda)', ok ? 'ok' : 'aviso');
        carregar();
    }

    if (!s) return <div className="cfg-cartao"><Girador /> Lendo o armazenamento…</div>;
    const arm = (s.info && s.info.armazem) || {};
    const ehPasta = arm.tipo === 'pasta';
    return (
        <section className="secao" aria-labelledby="cfg-armazem">
            <div className="secao-cab">
                <h2 id="cfg-armazem"><Ico.pasta aria-hidden="true" />Onde ficam as séries</h2>
                <p>Trocar não copia as séries de um lugar para o outro.</p>
            </div>
            <div className="cfg-cartao">
                <dl className="cfg-dados">
                    <div><dt>Agora</dt><dd><strong>{arm.nome || '—'}</strong></dd></div>
                    <div><dt>Arquivos</dt><dd className="num">{s.vfs ? s.vfs.arquivos : '—'}</dd></div>
                    {!ehPasta && s.uso && <div><dt>Espaço usado pelo site</dt><dd className="num">{mb(s.uso.usage)} de {mb(s.uso.quota)}</dd></div>}
                    {!ehPasta && (
                        <div>
                            <dt>Proteção contra limpeza</dt>
                            <dd>{s.persistente ? <span className="cfg-ok"><Ico.ok aria-hidden="true" />o navegador não apaga</span> : <span className="cfg-aviso"><Ico.aviso aria-hidden="true" />pode apagar se faltar espaço</span>}</dd>
                        </div>
                    )}
                </dl>
                {!ehPasta && (
                    <p className="cfg-texto">
                        As séries ficam dentro do navegador (não aparecem como pasta no computador). Para ter os arquivos à mão e
                        o mesmo acervo do Estúdio do PC, use uma pasta do computador, por exemplo <code>E:\EstudioSeriesDados</code>.
                    </p>
                )}
                {ehPasta && (
                    <p className="cfg-texto">
                        As séries ficam na pasta escolhida, no mesmo formato do Estúdio do PC. Não deixe o site e o
                        <code> Abrir Estudio.vbs</code> mexendo na mesma pasta ao mesmo tempo.
                    </p>
                )}
                <div className="cfg-acoes">
                    {!ehPasta && cap.pastaReal && (
                        <button type="button" className="btn" onClick={usarPasta} disabled={ocupado} aria-busy={ocupado}>
                            {ocupado ? <Girador /> : <Ico.pasta aria-hidden="true" />}
                            Usar uma pasta do computador
                        </button>
                    )}
                    {ehPasta && (
                        <button type="button" className="btn" onClick={voltarInterno}>
                            <Ico.series aria-hidden="true" />
                            Usar o armazenamento do navegador
                        </button>
                    )}
                    {!ehPasta && !s.persistente && (
                        <button type="button" className="btn fantasma" onClick={pedirPersistencia}>
                            <Ico.bloqueado aria-hidden="true" />
                            Pedir para não apagar
                        </button>
                    )}
                </div>
                {!cap.pastaReal && !ehPasta && (
                    <p className="cfg-nota"><Ico.info aria-hidden="true" />Este navegador não deixa escolher uma pasta (no celular e no Safari é assim): as séries ficam no navegador.</p>
                )}
            </div>
        </section>
    );
}

// ---------------- chave do OpenRouter ----------------
function SecaoChave() {
    const [mod, setMod] = useState(null);
    const [info, setInfo] = useState(null);
    const [saldo, setSaldo] = useState(null);
    const [colando, setColando] = useState(false);
    const [texto, setTexto] = useState('');
    const [lembrar, setLembrar] = useState(true);
    const [erro, setErro] = useState('');
    const [ver, setVer] = useState(false);

    useEffect(() => {
        let parar = () => {};
        import('../motorNavegador/chave.js').then((m) => {
            setMod(m);
            setInfo(m.infoChave());
            parar = m.ouvirChave(setInfo);
        });
        return () => parar();
    }, []);

    useEffect(() => {
        if (!info) return;
        setSaldo(null);
        SaldoOpenRouter().then(setSaldo);
    }, [info]);

    if (!mod || !info) return null;

    function usarChave(e) {
        e.preventDefault();
        const problema = mod.validarFormato(texto);
        if (problema) { setErro(problema); return; }
        try {
            mod.guardarChave(texto, { lembrar, origem: 'colada' });
            setTexto(''); setErro(''); setColando(false);
            avisar('Chave do OpenRouter ativa');
            window.dispatchEvent(new Event('estudio:gasto'));
        } catch (er) {
            setErro(er.message);
        }
    }

    function esquecer() {
        mod.esquecerChave();
        avisar('Chave esquecida: modo simulado');
        window.dispatchEvent(new Event('estudio:gasto'));
    }

    const saldoTxt = (() => {
        if (!saldo) return 'consultando…';
        if (erroDe(saldo)) return erroDe(saldo);
        if (saldo.simulado) return 'modo simulado (nada é cobrado)';
        const resta = saldoDisponivel(saldo);
        if (resta !== null) return `${GlobalVar.usd(resta)} disponíveis`;
        return 'sem limite definido na chave';
    })();

    return (
        <section className="secao" aria-labelledby="cfg-chave">
            <div className="secao-cab">
                <h2 id="cfg-chave"><Ico.saldo aria-hidden="true" />Chave do OpenRouter</h2>
                <p><Ico.bloqueado aria-hidden="true" />Fica só neste navegador. Nunca vai para o site nem para os arquivos das séries.</p>
            </div>
            <div className="cfg-cartao">
                {info.temChave ? (
                    <dl className="cfg-dados">
                        <div><dt>Chave</dt><dd><code>sk-or-…{info.final}</code> {info.origem === 'login' ? '(criada pelo login)' : '(colada)'}</dd></div>
                        <div><dt>Guardada</dt><dd>{info.lembrada ? 'neste navegador' : 'só nesta aba (some ao fechar)'}</dd></div>
                        <div><dt>Saldo</dt><dd className="num">{saldoTxt}</dd></div>
                    </dl>
                ) : (
                    <p className="cfg-texto">
                        <Ico.simulado aria-hidden="true" /> <strong>Sem chave: modo simulado.</strong> Você explora tudo e nada é cobrado;
                        imagens e vídeos são de exemplo. Para gerar de verdade, entre com a sua conta do OpenRouter ou cole uma chave.
                    </p>
                )}

                <label className="cfg-check">
                    <input type="checkbox" checked={info.simuladoForcado} onChange={(e) => { mod.definirSimuladoForcado(e.target.checked); window.dispatchEvent(new Event('estudio:gasto')); }} />
                    <span>Modo simulado mesmo com chave (para testar sem gastar)</span>
                </label>

                <div className="cfg-acoes">
                    {!info.temChave && (
                        <button type="button" className="btn primario" onClick={() => mod.entrarComOpenRouter()}>
                            <Ico.abrir aria-hidden="true" />
                            Entrar com OpenRouter
                        </button>
                    )}
                    <button type="button" className="btn" aria-expanded={colando} onClick={() => setColando((v) => !v)}>
                        <Ico.editar aria-hidden="true" />
                        {info.temChave ? 'Trocar a chave' : 'Colar uma chave'}
                    </button>
                    {info.temChave && (
                        <button type="button" className="btn perigo" onClick={esquecer}>
                            <Ico.apagar aria-hidden="true" />
                            Esquecer a chave
                        </button>
                    )}
                </div>

                <Expandir aberto={colando}>
                    <form className="cfg-form" onSubmit={usarChave}>
                        <label className="campo">
                            <span>Chave (começa com sk-or-)</span>
                            <span className="cfg-entrada-chave">
                                <input
                                    className="entrada"
                                    type={ver ? 'text' : 'password'}
                                    value={texto}
                                    onChange={(e) => setTexto(e.target.value)}
                                    autoComplete="off"
                                    spellCheck={false}
                                    placeholder="sk-or-v1-…"
                                />
                                <button type="button" className="btn icone fantasma" onClick={() => setVer((v) => !v)} aria-label={ver ? 'Esconder a chave' : 'Mostrar a chave'} title={ver ? 'Esconder' : 'Mostrar'}>
                                    {ver ? <Ico.ocultar aria-hidden="true" /> : <Ico.ver aria-hidden="true" />}
                                </button>
                            </span>
                            <small>Crie uma chave só para este site, com <strong>limite de crédito</strong> (ex.: US$ 5), em openrouter.ai → Settings → Keys. O limite é o único teto que nenhum código da página consegue furar.</small>
                        </label>
                        <label className="cfg-check">
                            <input type="checkbox" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} />
                            <span>Lembrar neste navegador (sem marcar, a chave some ao fechar a aba)</span>
                        </label>
                        {erro && <p className="msg erro" role="alert">{erro}</p>}
                        <div className="cfg-acoes">
                            <button type="submit" className="btn primario"><Ico.confirmar aria-hidden="true" />Usar esta chave</button>
                        </div>
                    </form>
                </Expandir>
            </div>
        </section>
    );
}

// ---------------- gerações pendentes ----------------
function SecaoPendentes() {
    const [r, setR] = useState(null);
    const [ocupado, setOcupado] = useState(false);
    async function conferir() {
        setOcupado(true);
        const res = await RetomarJobs({});
        setOcupado(false);
        setR(res);
        if (!erroDe(res)) window.dispatchEvent(new Event('estudio:gasto'));
    }
    return (
        <section className="secao" aria-labelledby="cfg-pendentes">
            <div className="secao-cab">
                <h2 id="cfg-pendentes"><Ico.historico aria-hidden="true" />Gerações em andamento</h2>
                <p>Vídeo continua sendo gerado no OpenRouter mesmo com a aba fechada. Ao abrir, o Estúdio confere sozinho.</p>
            </div>
            <div className="cfg-cartao">
                <div className="cfg-acoes">
                    <button type="button" className="btn" onClick={conferir} disabled={ocupado} aria-busy={ocupado}>
                        {ocupado ? <Girador /> : <Ico.regerar className="ico-girar" aria-hidden="true" />}
                        Conferir agora (grátis)
                    </button>
                </div>
                {r && erroDe(r) && <p className="msg erro" role="alert">{erroDe(r)}</p>}
                {r && !erroDe(r) && (
                    <Lista as="ul" className="cfg-lista">
                        {(r.consultados || []).map((j) => (
                            <Item as="li" key={j.jobId}><Ico.video aria-hidden="true" /><span><code>{j.jobId}</code> — {j.status}{j.erroDownload ? ` (download: ${j.erroDownload})` : ''}</span></Item>
                        ))}
                        {(r.incertos || []).map((j) => (
                            <Item as="li" key={j.pedidoHash || j.jobId} className="cfg-aviso"><Ico.aviso aria-hidden="true" /><span>Envio incerto ({j.modelo || 'vídeo'}): confira no painel do OpenRouter antes de repetir.</span></Item>
                        ))}
                        {(r.erros || []).map((j) => (
                            <Item as="li" key={j.jobId} className="cfg-aviso"><Ico.erro aria-hidden="true" /><span><code>{j.jobId}</code>: {j.erro}</span></Item>
                        ))}
                        {!(r.consultados || []).length && !(r.incertos || []).length && !(r.erros || []).length && (
                            <Item as="li"><Ico.ok aria-hidden="true" /><span>Nenhuma geração pendente.</span></Item>
                        )}
                    </Lista>
                )}
            </div>
        </section>
    );
}

export default function Configuracoes({ ativaResp }) {
    const motor = useMotorEstado();
    const navegador = motor.modo === 'navegador';
    return (
        <main className={`tela configuracoes${ativaResp ? ' resp' : ''}`}>
            <div className="tela-cab">
                <div>
                    <h1>Configurações</h1>
                    <p>Onde o Estúdio roda, onde ficam as séries e a chave do OpenRouter.</p>
                </div>
            </div>

            <SecaoMotor motor={motor} />
            {navegador && <SecaoArmazem />}
            {navegador ? <SecaoChave /> : (
                <section className="secao" aria-labelledby="cfg-chave-pc">
                    <div className="secao-cab"><h2 id="cfg-chave-pc"><Ico.saldo aria-hidden="true" />Chave do OpenRouter</h2></div>
                    <div className="cfg-cartao"><p className="cfg-texto">Com o Estúdio do PC, a chave fica no ambiente do computador (<code>ASE_OPENROUTER_KEY</code>), nunca no navegador.</p></div>
                </section>
            )}
            <SecaoPendentes />
            {navegador && (
                <section className="secao" aria-labelledby="cfg-limites">
                    <div className="secao-cab">
                        <h2 id="cfg-limites"><Ico.info aria-hidden="true" />Ainda precisa do Estúdio do PC</h2>
                        <p>Essas partes usam ffmpeg e Python. No navegador elas avisam e não fazem nada.</p>
                    </div>
                    <ul className="cfg-cartao cfg-lista">
                        {SO_NO_PC.map((x) => {
                            const Icone = x.icone;
                            return <li key={x.texto}><Icone aria-hidden="true" /><span>{x.texto}</span></li>;
                        })}
                    </ul>
                </section>
            )}
        </main>
    );
}
