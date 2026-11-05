import { useEffect, useState } from 'react';
import Dialogo from '../subComponents/Dialogo';
import { CriarEpisodio, rotaIndisponivel } from '../funcionalidades/bancoGet';
import { erroDe } from '../funcionalidades/fetchFunc';
import { Ico } from '../subComponents/icones';
import { AnimatePresence, Girador, MOV, avisar, motion } from '../subComponents/Movimento';
import { DURACAO_MAX_S, DURACAO_MIN_S, LIMITE_SEM_ESCOLHA_S, estimarPlanos, faixaPlanos, textoDuracao } from './serieUtil';
import '../../assets/css/NovoEpisodio.css';

const ATALHOS = [5, 15, 30, 60];
const MAX_BLOCOS = 24; // a fita mostra no máximo isso; o texto diz o número real

const lerNumero = (v) => Number(String(v).trim().replace(',', '.'));

/**
 * Criar episódio com DURAÇÃO LIVRE (pedido do Rafael: "quanto tempo eu quiser").
 * inicial: { n?, titulo? } — vindo do mapa da temporada; sem n, o servidor usa o próximo número.
 * onCriado(episodio) recebe { n, titulo, duracaoAlvoS, semEscolha, status }.
 */
export default function NovoEpisodio({ aberto, serieId, dados, inicial, onFechar, onCriado }) {
    const { serie, biblia } = dados;
    const padrao = Number(serie.duracaoAlvoS) || 60;
    const usados = (serie.episodios || []).map((e) => e.n);
    const mapa = Array.isArray(biblia.temporada) ? biblia.temporada : [];
    // Número: o pedido; senão o próximo do mapa da temporada que ainda não tem pasta; senão o maior + 1.
    const proximoDoMapa = mapa.map((t) => t.n).filter((x) => !usados.includes(x)).sort((a, b) => a - b)[0];
    const n = (inicial && inicial.n) || proximoDoMapa || (usados.length ? Math.max(...usados) + 1 : 1);
    const doMapa = mapa.find((t) => t.n === n);

    const [titulo, setTitulo] = useState('');
    const [duracao, setDuracao] = useState(String(padrao));
    const [semManual, setSemManual] = useState(null); // null = segue a regra dos 20 s
    const [ocupado, setOcupado] = useState(false);
    const [erro, setErro] = useState('');

    useEffect(() => {
        if (!aberto) return;
        setTitulo((inicial && inicial.titulo) || (doMapa && doMapa.titulo) || '');
        setDuracao(String(padrao));
        setSemManual(null);
        setErro('');
        setOcupado(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aberto]);

    const d = lerNumero(duracao);
    const valida = Number.isFinite(d) && d >= DURACAO_MIN_S && d <= DURACAO_MAX_S;
    const semAuto = valida && d < LIMITE_SEM_ESCOLHA_S;
    const semEscolha = semManual ?? semAuto;
    const planos = valida ? estimarPlanos(d) : 0;
    const blocos = Math.min(planos, MAX_BLOCOS);

    function escolherAtalho(v) {
        setDuracao(String(v));
        setErro('');
    }

    async function criar(e) {
        e.preventDefault();
        if (!valida) { setErro(`Duração inválida: use de ${DURACAO_MIN_S} a ${DURACAO_MAX_S} segundos.`); return; }
        setOcupado(true);
        setErro('');
        const dur = Math.round(d * 10) / 10;
        const r = await CriarEpisodio({
            serie: serieId,
            n,
            titulo: titulo.trim(),
            duracaoAlvoS: dur,
            semEscolha,
        });
        setOcupado(false);
        if (rotaIndisponivel(r)) {
            setErro('O servidor ainda não tem a rota de criar episódio (/CriarEpisodio). Reinicie o backend quando ela entrar.');
            avisar('Não consegui criar o episódio', 'erro');
            return;
        }
        if (erroDe(r)) {
            setErro(erroDe(r));
            avisar(`Falhou: ${erroDe(r)}`, 'erro', 5000);
            return;
        }
        const ep = (r && r.episodio) || { n, titulo: titulo.trim(), duracaoAlvoS: dur, semEscolha };
        const semVoto = ep.semEscolha ?? semEscolha;
        avisar(`Ep. ${ep.n} criado: ${textoDuracao(ep.duracaoAlvoS ?? dur)}${semVoto ? ', sem votação' : ', com escolha A/B'}`, 'ok');
        onCriado(ep);
    }

    const rodape = (
        <>
            <button type="button" className="btn" onClick={onFechar} disabled={ocupado}>Cancelar</button>
            <button type="submit" form="form-novo-ep" className="btn primario" disabled={ocupado || !valida} aria-busy={ocupado}>
                {ocupado && <Girador />}
                <Ico.novo className="ico-pular" aria-hidden="true" />
                <span>Criar episódio</span>
            </button>
        </>
    );

    return (
        <Dialogo
            id="novo-episodio"
            aberto={aberto}
            titulo={`Novo episódio: Ep. ${String(n).padStart(2, '0')}`}
            descricao="Escolha quanto tempo ele dura. O roteiro é escrito depois, já nessa duração."
            onFechar={onFechar}
            travado={ocupado}
            rodape={rodape}
            largura={580}
        >
            <form id="form-novo-ep" className="novo-ep" onSubmit={criar} noValidate>
                <label className="dlg-campo">
                    <span>Título</span>
                    <input type="text" value={titulo} maxLength={120} placeholder={`Episódio ${n}`} onChange={(e) => setTitulo(e.target.value)} />
                    <small>{doMapa ? `Do mapa da temporada: ${doMapa.fase || doMapa.titulo}.` : 'Opcional. O roteiro pode trocar depois.'}</small>
                </label>

                <fieldset className="nv-duracao">
                    <legend>Duração</legend>
                    <div className="nv-duracao-linha">
                        <label className="nv-numero">
                            <span className="sr">Duração em segundos</span>
                            <input
                                type="number"
                                inputMode="decimal"
                                min={DURACAO_MIN_S}
                                max={DURACAO_MAX_S}
                                step="any"
                                value={duracao}
                                onChange={(e) => { setDuracao(e.target.value); setErro(''); }}
                                aria-invalid={!valida || undefined}
                                aria-describedby="nv-duracao-ajuda"
                                data-foco
                            />
                            <span className="nv-unidade" aria-hidden="true">s</span>
                        </label>
                        <div className="nv-atalhos" role="group" aria-label="Atalhos de duração">
                            {ATALHOS.map((v) => {
                                const ativo = valida && d === v;
                                return (
                                    <button key={v} type="button" className={`nv-atalho${ativo ? ' ativo' : ''}`} aria-pressed={ativo} onClick={() => escolherAtalho(v)}>
                                        {ativo && <motion.span layoutId="nv-atalho-marca" className="nv-atalho-marca" transition={MOV.mola} />}
                                        <span className="num">{v} s</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <small id="nv-duracao-ajuda" className={valida ? '' : 'nv-erro-txt'}>
                        {valida
                            ? `Qualquer valor de ${DURACAO_MIN_S} a ${DURACAO_MAX_S} s. A série usa ${textoDuracao(padrao)} por padrão.`
                            : `Use um número de ${DURACAO_MIN_S} a ${DURACAO_MAX_S} segundos.`}
                    </small>

                    {/* Fita: prévia de quantos planos cabem e onde fica a escolha A/B */}
                    <div className="nv-fita" aria-hidden="true">
                        <div className="nv-fita-blocos">
                            <AnimatePresence initial={false}>
                                {Array.from({ length: blocos }, (_, i) => (
                                    <motion.span
                                        key={i}
                                        className="nv-bloco"
                                        layout
                                        initial={{ opacity: 0, scaleY: 0.4 }}
                                        animate={{ opacity: 1, scaleY: 1, transition: { duration: MOV.rapido, ease: MOV.enfatico } }}
                                        exit={{ opacity: 0, transition: { duration: 0.08 } }}
                                    />
                                ))}
                            </AnimatePresence>
                        </div>
                        <AnimatePresence initial={false}>
                            {valida && !semEscolha && (
                                <motion.span
                                    className="nv-fita-ab"
                                    initial={{ opacity: 0, scaleX: 0.6 }}
                                    animate={{ opacity: 1, scaleX: 1, transition: { duration: MOV.base, ease: MOV.enfatico } }}
                                    exit={{ opacity: 0, transition: { duration: MOV.rapido } }}
                                >
                                    A/B
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </div>
                    <p className="nv-resumo" aria-live="polite">
                        {valida ? (
                            <>
                                <strong className="num">{textoDuracao(d)}</strong>
                                {` cabem ${faixaPlanos(d)} de 2 a 10 s. `}
                                {semEscolha ? 'Termina numa imagem ou frase forte, sem votação.' : 'Termina na escolha A/B e no convite para comentar.'}
                            </>
                        ) : 'Informe a duração para ver a prévia.'}
                    </p>
                </fieldset>

                <label className="nv-check">
                    <input type="checkbox" checked={semEscolha} onChange={(e) => setSemManual(e.target.checked)} />
                    <span>
                        <strong>Sem votação A/B</strong>
                        <small>
                            {semManual === null && semAuto
                                ? `Marcada sozinha: com menos de ${LIMITE_SEM_ESCOLHA_S} s não cabe a votação.`
                                : valida && d < LIMITE_SEM_ESCOLHA_S && !semEscolha
                                    ? `Com menos de ${LIMITE_SEM_ESCOLHA_S} s a votação fica apertada.`
                                    : 'O episódio termina sem as opções A e B na tela.'}
                        </small>
                    </span>
                </label>

                {erro && <p className="nota-erro" role="alert"><Ico.erro aria-hidden="true" />{erro}</p>}
            </form>
        </Dialogo>
    );
}
