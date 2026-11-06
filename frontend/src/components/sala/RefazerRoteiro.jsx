import { useEffect, useState } from 'react';
import Dialogo from '../subComponents/Dialogo';
import GlobalVar from '../subComponents/GlobalVar';
import { Ico } from '../subComponents/icones';
import { Esqueleto, Girador, MOV, avisar, motion } from '../subComponents/Movimento';
import { PreverApagar, RefazerRoteiro as pedirRefazer, rotaIndisponivel } from '../funcionalidades/bancoGet';
import { erroDe } from '../funcionalidades/fetchFunc';
import { SEM_ROTA } from './ApagarSerie';
import { DURACAO_MAX_S, DURACAO_MIN_S, LIMITE_SEM_ESCOLHA_S, TETO_ETAPA_USD, faixaPlanos, plural, textoDuracao, textoMemoria } from './serieUtil';
import '../../assets/css/NovoEpisodio.css';
import '../../assets/css/Lixeira.css';

const ATALHOS = [5, 15, 30, 60];
const lerNumero = (v) => Number(String(v).trim().replace(',', '.'));
const dois = (n) => String(n).padStart(2, '0');

/**
 * Refazer o roteiro do zero. O roteiro atual (e, marcado, o que foi feito a partir dele: falas, áudio, edição,
 * legendas e montagem) vai para episodios\epNN\_versoes\<data>\ — recuperável. Takes e imagens pagos NUNCA saem.
 * Duração e "sem votação" vêm preenchidos com os do episódio; as observações do roteiro (notas.json) vêm
 * preenchidas e o que ficar no campo passa a ser as observações do episódio.
 * Não chama a IA: onFeito({ duracaoAlvoS, semEscolha, instrucoes }) e quem chamou abre a confirmação de custo.
 * ep: { n, titulo, duracaoAlvoS, semEscolha }.
 */
export default function RefazerRoteiro({ aberto, serieId, ep, observacoes = '', onFechar, onFeito }) {
    const [previa, setPrevia] = useState(null);
    const [erroPrevia, setErroPrevia] = useState('');
    const [derivados, setDerivados] = useState(true);
    const [duracao, setDuracao] = useState('60');
    const [semManual, setSemManual] = useState(null); // null = segue a regra dos 20 s
    const [instrucoes, setInstrucoes] = useState('');
    const [ocupado, setOcupado] = useState(false);
    const [erro, setErro] = useState('');
    const n = ep ? ep.n : null;

    useEffect(() => {
        if (!aberto || !n) return undefined;
        let vivo = true;
        const d0 = Number(ep.duracaoAlvoS) || 60;
        const sem0 = Boolean(ep.semEscolha);
        setDuracao(String(d0));
        // Se o episódio segue a regra dos 20 s, a caixa continua automática; senão, fica a escolha dele.
        setSemManual(sem0 === d0 < LIMITE_SEM_ESCOLHA_S ? null : sem0);
        setDerivados(true); setInstrucoes(observacoes || ''); setErro(''); setOcupado(false); setPrevia(null); setErroPrevia('');
        PreverApagar({ serie: serieId, ep: n, acao: 'roteiro' }).then((r) => {
            if (!vivo) return;
            if (rotaIndisponivel(r)) setErroPrevia(SEM_ROTA);
            else if (erroDe(r)) setErroPrevia(erroDe(r));
            else setPrevia(r);
        });
        return () => { vivo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aberto, serieId, n]);

    const d = lerNumero(duracao);
    const valida = Number.isFinite(d) && d >= DURACAO_MIN_S && d <= DURACAO_MAX_S;
    const semAuto = valida && d < LIMITE_SEM_ESCOLHA_S;
    const semEscolha = semManual ?? semAuto;
    const bloqueios = previa ? previa.bloqueios || [] : [];
    const vai = previa ? (previa.vaiParaVersoes || []).filter((i) => derivados || i.nome === 'roteiro.json') : [];
    const fica = previa ? previa.preservados || [] : [];
    const pode = Boolean(previa) && !bloqueios.length && valida && !ocupado;
    const idEp = n ? `ep${dois(n)}` : '';
    const memoria = previa ? textoMemoria(previa.memoria) : '';

    async function refazer(e) {
        e.preventDefault();
        if (!valida) { setErro(`Duração inválida: use de ${DURACAO_MIN_S} a ${DURACAO_MAX_S} segundos.`); return; }
        if (!pode) return;
        setOcupado(true);
        setErro('');
        const dur = Math.round(d * 10) / 10;
        const r = await pedirRefazer({ serie: serieId, ep: n, duracaoAlvoS: dur, semEscolha, apagarDerivados: derivados });
        setOcupado(false);
        if (rotaIndisponivel(r)) { setErro(SEM_ROTA); return; }
        if (erroDe(r)) { setErro(erroDe(r)); avisar(`Não refiz: ${erroDe(r)}`, 'erro', 6000); return; }
        avisar(r.versao ? 'Roteiro antigo guardado em _versoes. Folha em branco.' : 'Episódio pronto para o roteiro novo.', 'ok', 4500);
        (r.avisos || []).forEach((a) => avisar(a, 'info', 6000));
        const episodio = r.episodio || {};
        onFeito && onFeito({
            duracaoAlvoS: episodio.duracaoAlvoS ?? dur,
            semEscolha: episodio.semEscolha ?? semEscolha,
            instrucoes: instrucoes.trim(),
            resposta: r,
        });
    }

    return (
        <Dialogo
            id="refazer-roteiro"
            aberto={aberto}
            titulo={`Refazer o roteiro do Ep. ${n ? dois(n) : ''} do zero`}
            icone={Ico.refazerRoteiro}
            descricao="O roteiro atual sai do episódio e fica guardado numa versão. Você recomeça pela folha em branco, com a duração e as instruções que quiser."
            onFechar={onFechar}
            travado={ocupado}
            largura={620}
            rodape={(
                <>
                    <span className="dlg-rodape-esq"><Ico.custo aria-hidden="true" />Depois: o showrunner escreve, até {GlobalVar.usdFino(TETO_ETAPA_USD)}</span>
                    <button type="button" className="btn" onClick={onFechar} disabled={ocupado}>Cancelar</button>
                    <button type="submit" form="form-refazer-roteiro" className="btn perigo" disabled={!pode} aria-busy={ocupado}>
                        {ocupado && <Girador />}
                        <Ico.refazerRoteiro aria-hidden="true" /><span>Refazer do zero</span>
                    </button>
                </>
            )}
        >
            <form id="form-refazer-roteiro" className="lx novo-ep" onSubmit={refazer} noValidate>
                {!previa && !erroPrevia && (
                    <div aria-busy="true"><span className="sr" role="status">Conferindo o episódio…</span><Esqueleto linhas={4} /></div>
                )}
                {erroPrevia && <p className="dlg-erro" role="alert"><Ico.erro aria-hidden="true" />{erroPrevia}</p>}

                {previa && (
                    <>
                        <div className="lx-bloco">
                            <h3><Ico.lixeira aria-hidden="true" />Vai para a versão guardada</h3>
                            {vai.length ? (
                                <motion.ul className="lx-lista" layout transition={{ duration: MOV.rapido }}>
                                    {vai.map((i) => <li key={i.nome}><Ico.historico aria-hidden="true" /><span>{i.o}</span></li>)}
                                </motion.ul>
                            ) : <p className="lx-texto">Ainda não há roteiro salvo: nada para guardar.</p>}
                            {memoria && (
                                <ul className="lx-lista">
                                    <li><Ico.memoria aria-hidden="true" /><span>Memória da série: <strong>{memoria}</strong> que vieram deste roteiro saem da memória e ficam guardados junto (voltam se você voltar a esta versão).</span></li>
                                </ul>
                            )}
                            <p className="lx-texto">Em <code className="lx-caminho">{`episodios\\${idEp}\\_versoes\\<data>\\`}</code>. Para voltar, use <strong>Versões do roteiro</strong> no menu de ações do episódio: a versão que estiver valendo fica guardada.</p>
                        </div>
                        <div className="lx-bloco fica">
                            <h3><Ico.bloqueado aria-hidden="true" />Fica onde está</h3>
                            {fica.length ? (
                                <ul className="lx-lista">
                                    {fica.map((i) => <li key={i.nome}><Ico.ok aria-hidden="true" /><span>{i.o}</span></li>)}
                                </ul>
                            ) : <p className="lx-texto">Este episódio ainda não tem takes nem imagens.</p>}
                            {(previa.takes > 0 || previa.imagens > 0) && (
                                <p className="lx-texto">
                                    <strong className="num">{plural(previa.takes, 'take de vídeo', 'takes de vídeo')}</strong>
                                    {previa.takesPagos > 0 ? ` (${previa.takesPagos} ${previa.takesPagos === 1 ? 'pago' : 'pagos'})` : ''} e{' '}
                                    <strong className="num">{plural(previa.imagens, 'imagem', 'imagens')}</strong> não saem do lugar: takes pagos nunca são apagados.
                                </p>
                            )}
                        </div>

                        <label className="nv-check">
                            <input type="checkbox" checked={derivados} onChange={(e) => setDerivados(e.target.checked)} disabled={ocupado} />
                            <span>
                                <strong>Guardar também falas, edição, legendas e montagem</strong>
                                <small>{derivados ? 'Recomendado: foram feitos a partir do roteiro antigo. Falas e legenda se refazem de graça.' : 'Só o roteiro sai. A edição da Mesa continua apontando para o roteiro antigo.'}</small>
                            </span>
                        </label>

                        <fieldset className="nv-duracao">
                            <legend>Duração do roteiro novo</legend>
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
                                        disabled={ocupado}
                                        onChange={(e) => { setDuracao(e.target.value); setErro(''); }}
                                        aria-invalid={!valida || undefined}
                                        aria-describedby="rf-duracao-ajuda"
                                    />
                                    <span className="nv-unidade" aria-hidden="true">s</span>
                                </label>
                                <div className="nv-atalhos" role="group" aria-label="Atalhos de duração">
                                    {ATALHOS.map((v) => {
                                        const ativo = valida && d === v;
                                        return (
                                            <button key={v} type="button" className={`nv-atalho${ativo ? ' ativo' : ''}`} aria-pressed={ativo} disabled={ocupado} onClick={() => { setDuracao(String(v)); setErro(''); }}>
                                                {ativo && <motion.span layoutId="rf-atalho-marca" className="nv-atalho-marca" transition={MOV.mola} />}
                                                <span className="num">{v} s</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <small id="rf-duracao-ajuda" className={valida ? '' : 'nv-erro-txt'}>
                                {valida
                                    ? `${textoDuracao(d)}: ${faixaPlanos(d)}. Hoje o episódio tem ${textoDuracao(ep.duracaoAlvoS || 60)}.`
                                    : `Use um número de ${DURACAO_MIN_S} a ${DURACAO_MAX_S} segundos.`}
                            </small>
                        </fieldset>

                        <label className="nv-check">
                            <input type="checkbox" checked={semEscolha} onChange={(e) => setSemManual(e.target.checked)} disabled={ocupado} />
                            <span>
                                <strong>Sem votação A/B</strong>
                                <small>
                                    {semManual === null && semAuto
                                        ? `Marcada sozinha: com menos de ${LIMITE_SEM_ESCOLHA_S} s não cabe a votação.`
                                        : 'O episódio termina sem as opções A e B na tela.'}
                                </small>
                            </span>
                        </label>

                        <label className="dlg-campo">
                            <span>Observações para o roteiro</span>
                            <textarea
                                rows={3}
                                maxLength={4000}
                                value={instrucoes}
                                disabled={ocupado}
                                placeholder="Ex.: comece pelo rádio chiando, menos narração e a Mara só fala no fim."
                                onChange={(e) => setInstrucoes(e.target.value)}
                            />
                            <small>Opcional. São as observações do episódio: ficam guardadas e entram no pedido do roteiro novo, junto com a memória da série.</small>
                        </label>

                        {(previa.avisos || []).map((a) => <p key={a} className="dlg-aviso"><Ico.aviso aria-hidden="true" />{a}</p>)}
                        {bloqueios.length > 0 && (
                            <div className="lx-erros" role="alert">
                                {bloqueios.map((b) => <p key={b} className="dlg-erro"><Ico.bloqueado aria-hidden="true" />{b}</p>)}
                            </div>
                        )}
                        <p className="lx-proximo"><Ico.info aria-hidden="true" />Depois de refazer, você confirma o custo e o showrunner escreve o roteiro novo. Nada é gasto antes disso.</p>
                    </>
                )}
                {erro && <p className="dlg-erro" role="alert"><Ico.erro aria-hidden="true" />{erro}</p>}
            </form>
        </Dialogo>
    );
}
