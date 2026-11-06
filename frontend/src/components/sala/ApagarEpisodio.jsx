import { useEffect, useState } from 'react';
import Dialogo from '../subComponents/Dialogo';
import GlobalVar from '../subComponents/GlobalVar';
import { Ico } from '../subComponents/icones';
import { Esqueleto, Girador, avisar } from '../subComponents/Movimento';
import { ApagarEpisodio as pedirApagarEpisodio, PreverApagar, rotaIndisponivel } from '../funcionalidades/bancoGet';
import { erroDe } from '../funcionalidades/fetchFunc';
import { SEM_ROTA, esquecerNoNavegador, mb } from './ApagarSerie';
import { plural, textoMemoria } from './serieUtil';
import '../../assets/css/Lixeira.css';

const dois = (n) => String(n).padStart(2, '0');

/**
 * Apagar episódio: a pasta episodios\epNN vai inteira para a lixeira (dá para restaurar), a entrada sai da série
 * e a escolha A/B sem votos sai da bíblia. Avisa quando há takes pagos indo junto e oferece "Refazer o roteiro"
 * no lugar (ele não mexe nos takes). Com votação registrada, o servidor recusa e a tela explica.
 * ep: { n, titulo } · onApagado(resposta) · onRefazer() (opcional: troca para o diálogo de refazer o roteiro).
 */
export default function ApagarEpisodio({ aberto, serieId, ep, onFechar, onApagado, onRefazer }) {
    const [previa, setPrevia] = useState(null);
    const [erroPrevia, setErroPrevia] = useState('');
    const [ocupado, setOcupado] = useState(false);
    const [erro, setErro] = useState('');
    const n = ep ? ep.n : null;

    useEffect(() => {
        if (!aberto || !n) return undefined;
        let vivo = true;
        setPrevia(null); setErroPrevia(''); setErro(''); setOcupado(false);
        PreverApagar({ serie: serieId, ep: n, acao: 'episodio' }).then((r) => {
            if (!vivo) return;
            if (rotaIndisponivel(r)) setErroPrevia(SEM_ROTA);
            else if (erroDe(r)) setErroPrevia(erroDe(r));
            else setPrevia(r);
        });
        return () => { vivo = false; };
    }, [aberto, serieId, n]);

    const bloqueios = previa ? previa.bloqueios || [] : [];
    const pode = Boolean(previa) && !bloqueios.length && !ocupado;
    const temMidia = previa && (previa.takes > 0 || previa.imagens > 0);
    const memoria = previa ? textoMemoria(previa.memoria) : '';

    async function apagar() {
        if (!pode) return;
        setOcupado(true);
        setErro('');
        const r = await pedirApagarEpisodio({ serie: serieId, ep: n });
        setOcupado(false);
        if (rotaIndisponivel(r)) { setErro(SEM_ROTA); return; }
        if (erroDe(r)) { setErro(erroDe(r)); avisar(`Não apaguei: ${erroDe(r)}`, 'erro', 6000); return; }
        esquecerNoNavegador(serieId, n);
        avisar(`Ep. ${n} foi para a lixeira`, 'ok', 4500);
        onApagado && onApagado(r);
    }

    return (
        <Dialogo
            id="apagar-episodio"
            aberto={aberto}
            titulo={`Apagar o Ep. ${n ? dois(n) : ''}`}
            icone={Ico.apagar}
            descricao={ep && ep.titulo ? `"${ep.titulo}" sai da série e a pasta do episódio vai inteira para a lixeira do Estúdio. Dá para restaurar.` : 'O episódio sai da série e a pasta dele vai inteira para a lixeira do Estúdio. Dá para restaurar.'}
            onFechar={onFechar}
            travado={ocupado}
            largura={540}
            rodape={(
                <>
                    <button type="button" className="btn" onClick={onFechar} disabled={ocupado} data-foco>Cancelar</button>
                    <button type="button" className="btn perigo" onClick={apagar} disabled={!pode} aria-busy={ocupado}>
                        {ocupado && <Girador />}
                        <Ico.apagar aria-hidden="true" /><span>Apagar episódio</span>
                    </button>
                </>
            )}
        >
            <div className="lx lx-perigo">
                {!previa && !erroPrevia && (
                    <div aria-busy="true"><span className="sr" role="status">Conferindo o que vai junto…</span><Esqueleto linhas={3} /></div>
                )}
                {erroPrevia && <p className="dlg-erro" role="alert"><Ico.erro aria-hidden="true" />{erroPrevia}</p>}

                {previa && (
                    <>
                        <div className="lx-bloco">
                            <h3><Ico.lixeira aria-hidden="true" />Vai para a lixeira</h3>
                            <ul className="lx-lista">
                                <li><Ico.roteiro aria-hidden="true" /><span>Tudo o que está na pasta do episódio: roteiro, falas, edição da Mesa, legendas, montagem e versões guardadas</span></li>
                                <li><Ico.pasta aria-hidden="true" /><span><span className="num">{plural(previa.arquivos, 'arquivo', 'arquivos')}, {mb(previa.tamanhoMb)}</span> de <code className="lx-caminho">{(previa.origem || '').replace(/\//g, '\\')}</code></span></li>
                                <li><Ico.escolha aria-hidden="true" /><span>Ele sai da lista de episódios (e a escolha A/B, se houver, sai da bíblia). O mapa da temporada fica.</span></li>
                                {memoria && <li><Ico.memoria aria-hidden="true" /><span>Memória da série: <strong>{memoria}</strong> que vieram deste episódio saem da memória e vão junto (voltam se você restaurar). Os outros episódios não mudam.</span></li>}
                                <li><Ico.custo aria-hidden="true" /><span>O gasto continua registrado em Custos{previa.gastoUsd > 0 ? <>: <strong className="num">{GlobalVar.usdFino(previa.gastoUsd)}</strong></> : ''}.</span></li>
                            </ul>
                        </div>
                        {temMidia && !bloqueios.length && (
                            <div className="dlg-aviso">
                                <Ico.aviso aria-hidden="true" />
                                <span>
                                    {previa.takes > 0 && <><strong className="num">{plural(previa.takes, 'take de vídeo', 'takes de vídeo')}</strong>{previa.takesPagos > 0 ? ` (${previa.takesPagos} ${previa.takesPagos === 1 ? 'pago' : 'pagos'})` : ''}</>}
                                    {previa.takes > 0 && previa.imagens > 0 && ' e '}
                                    {previa.imagens > 0 && <strong className="num">{plural(previa.imagens, 'imagem', 'imagens')}</strong>}
                                    {' vão junto para a lixeira: continuam no disco, mas saem da Mesa. Se você só quer outro roteiro, refaça o roteiro: ele não mexe nos takes.'}
                                </span>
                            </div>
                        )}
                        {temMidia && !bloqueios.length && onRefazer && (
                            <button type="button" className="btn fantasma mini lx-trocar" onClick={onRefazer} disabled={ocupado}>
                                <Ico.refazerRoteiro aria-hidden="true" />Refazer só o roteiro
                            </button>
                        )}
                        {(previa.avisos || []).map((a) => <p key={a} className="dlg-aviso"><Ico.aviso aria-hidden="true" />{a}</p>)}
                        {bloqueios.length > 0 && (
                            <div className="lx-erros" role="alert">
                                {bloqueios.map((b) => <p key={b} className="dlg-erro"><Ico.bloqueado aria-hidden="true" />{b}</p>)}
                            </div>
                        )}
                    </>
                )}
                {erro && <p className="dlg-erro" role="alert"><Ico.erro aria-hidden="true" />{erro}</p>}
            </div>
        </Dialogo>
    );
}
