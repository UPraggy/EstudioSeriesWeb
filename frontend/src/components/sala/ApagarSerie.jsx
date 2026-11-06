import { useEffect, useRef, useState } from 'react';
import Dialogo from '../subComponents/Dialogo';
import GlobalVar from '../subComponents/GlobalVar';
import { Ico } from '../subComponents/icones';
import { Esqueleto, Girador, avisar } from '../subComponents/Movimento';
import { ApagarSerie as pedirApagarSerie, PreverApagar, rotaIndisponivel } from '../funcionalidades/bancoGet';
import { erroDe } from '../funcionalidades/fetchFunc';
import { CHAVE_ULTIMO_LUGAR, lerUltimoLugar } from '../TopMenu';
import { plural } from './serieUtil';
import '../../assets/css/Lixeira.css';

// O frontend novo pode chegar antes do backend reiniciar (Vite recarrega sozinho; o Express não).
export const SEM_ROTA = 'Esta função ainda não está no servidor: feche o Estúdio ("Parar Estudio") e abra de novo.';

// Tira do navegador o que era da série/episódio apagado (propostas não salvas, "continuar de onde parou").
export function esquecerNoNavegador(serieId, ep = null) {
    try {
        const prefixo = ep === null ? `estudio:proposta:${serieId}:` : `estudio:proposta:${serieId}:${ep}`;
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const k = localStorage.key(i);
            if (k && (ep === null ? k.startsWith(prefixo) : k === prefixo)) localStorage.removeItem(k);
        }
        const lugar = lerUltimoLugar();
        if (lugar && lugar.serie === serieId && (ep === null || Number(lugar.ep) === Number(ep))) localStorage.removeItem(CHAVE_ULTIMO_LUGAR);
    } catch { /* sem armazenamento */ }
}

export const mb = (v) => {
    const x = Math.round((Number(v) || 0) * 10) / 10;
    return x < 0.1 ? 'menos de 0,1 MB' : `${String(x).replace('.', ',')} MB`;
};

/**
 * Apagar série (zona de perigo), na Sala ("Mais ações") e no pôster em Séries.
 * Nada é destruído: a pasta vai inteira para <dados>\_lixeira\<data>-<id>\ e dá para restaurar.
 * serie: { id, titulo } · pastaDados (opcional, para mostrar o caminho) · onApagada(resposta).
 */
export default function ApagarSerie({ aberto, serie, pastaDados, onFechar, onApagada }) {
    const [previa, setPrevia] = useState(null);
    const [erroPrevia, setErroPrevia] = useState('');
    const [nome, setNome] = useState('');
    const [ocupado, setOcupado] = useState(false);
    const [erro, setErro] = useState('');
    const campo = useRef(null);
    const id = serie ? serie.id : '';

    useEffect(() => {
        if (!aberto || !id) return undefined;
        let vivo = true;
        setPrevia(null); setErroPrevia(''); setNome(''); setErro(''); setOcupado(false);
        PreverApagar({ serie: id }).then((r) => {
            if (!vivo) return;
            if (rotaIndisponivel(r)) setErroPrevia(SEM_ROTA);
            else if (erroDe(r)) setErroPrevia(erroDe(r));
            else setPrevia(r);
        });
        return () => { vivo = false; };
    }, [aberto, id]);

    const bloqueios = previa ? previa.bloqueios || [] : [];
    // O campo só aparece depois da prévia: o foco vai para ele quando chega (o Dialogo foca na abertura).
    useEffect(() => {
        if (aberto && previa && !bloqueios.length && campo.current) campo.current.focus();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aberto, previa]);

    const titulo = (previa && previa.serie && previa.serie.titulo) || (serie && serie.titulo) || '';
    const confere = nome.trim() === titulo && titulo !== '';
    const pode = Boolean(previa) && !bloqueios.length && confere && !ocupado;
    const raiz = pastaDados || 'E:\\EstudioSeriesDados';

    async function apagar(e) {
        e.preventDefault();
        if (!pode) return;
        setOcupado(true);
        setErro('');
        const r = await pedirApagarSerie({ serie: id, confirmacao: nome.trim() });
        setOcupado(false);
        if (rotaIndisponivel(r)) { setErro(SEM_ROTA); return; }
        if (erroDe(r)) { setErro(erroDe(r)); avisar(`Não apaguei: ${erroDe(r)}`, 'erro', 6000); return; }
        esquecerNoNavegador(id);
        avisar(`"${titulo}" foi para a lixeira`, 'ok', 4500);
        onApagada && onApagada(r);
    }

    return (
        <Dialogo
            id="apagar-serie"
            aberto={aberto}
            titulo="Apagar série"
            icone={Ico.apagar}
            descricao="A série sai da lista e a pasta inteira vai para a lixeira do Estúdio. Nada é apagado do disco: dá para restaurar."
            onFechar={onFechar}
            travado={ocupado}
            largura={560}
            rodape={(
                <>
                    <button type="button" className="btn" onClick={onFechar} disabled={ocupado}>Cancelar</button>
                    <button type="submit" form="form-apagar-serie" className="btn perigo" disabled={!pode} aria-busy={ocupado}>
                        {ocupado && <Girador />}
                        <Ico.apagar aria-hidden="true" /><span>Apagar série</span>
                    </button>
                </>
            )}
        >
            <form id="form-apagar-serie" className="lx lx-perigo" onSubmit={apagar} noValidate>
                {!previa && !erroPrevia && (
                    <div aria-busy="true"><span className="sr" role="status">Conferindo o que vai junto…</span><Esqueleto linhas={4} /></div>
                )}
                {erroPrevia && <p className="dlg-erro" role="alert"><Ico.erro aria-hidden="true" />{erroPrevia}</p>}

                {previa && (
                    <>
                        <div className="lx-bloco">
                            <h3><Ico.lixeira aria-hidden="true" />Vai para a lixeira</h3>
                            <ul className="lx-lista">
                                <li><Ico.episodio aria-hidden="true" /><span><strong className="num">{plural(previa.episodios, 'episódio', 'episódios')}</strong>, com roteiros, falas, edições e montagens</span></li>
                                <li>
                                    <Ico.video aria-hidden="true" />
                                    <span>
                                        <strong className="num">{plural(previa.takes, 'take de vídeo', 'takes de vídeo')}</strong>
                                        {previa.takesPagos > 0 && <> ({previa.takesPagos} {previa.takesPagos === 1 ? 'pago' : 'pagos'})</>}
                                        {' e '}<span className="num">{plural(previa.imagens, 'imagem', 'imagens')}</span>, mais elenco, locais e acervo
                                    </span>
                                </li>
                                <li><Ico.custo aria-hidden="true" /><span>Gasto registrado: <strong className="num">{GlobalVar.usdFino(previa.gastoUsd)}</strong>. O histórico de custos vai junto, dentro da pasta.</span></li>
                                <li><Ico.pasta aria-hidden="true" /><span><span className="num">{plural(previa.arquivos, 'arquivo', 'arquivos')}, {mb(previa.tamanhoMb)}</span> para <code className="lx-caminho">{`${raiz}\\_lixeira\\<data>-${id}\\`}</code></span></li>
                            </ul>
                        </div>
                        <p className="lx-texto">
                            Para desfazer, abra a <strong>Lixeira</strong> na tela de Séries e clique em Restaurar (ou mova a pasta de volta para <code className="lx-caminho">{`${raiz}\\series\\`}</code>).
                        </p>
                        {(previa.avisos || []).map((a) => <p key={a} className="dlg-aviso"><Ico.aviso aria-hidden="true" />{a}</p>)}
                        {bloqueios.length > 0 ? (
                            <div className="lx-erros" role="alert">
                                {bloqueios.map((b) => <p key={b} className="dlg-erro"><Ico.bloqueado aria-hidden="true" />{b}</p>)}
                            </div>
                        ) : (
                            <label className="dlg-campo lx-confirmar">
                                <span>Para confirmar, digite o nome da série: <strong>{titulo}</strong></span>
                                <input
                                    ref={campo}
                                    type="text"
                                    value={nome}
                                    autoComplete="off"
                                    spellCheck={false}
                                    disabled={ocupado}
                                    aria-invalid={nome !== '' && !confere ? true : undefined}
                                    aria-describedby="apagar-serie-confere"
                                    onChange={(ev) => { setNome(ev.target.value); setErro(''); }}
                                />
                                <small id="apagar-serie-confere" className={`lx-confere${confere ? ' ok' : ''}`} aria-live="polite">
                                    {confere
                                        ? <><Ico.ok aria-hidden="true" />O nome confere.</>
                                        : 'Igual ao título, com acentos e maiúsculas.'}
                                </small>
                            </label>
                        )}
                    </>
                )}
                {erro && <p className="dlg-erro" role="alert"><Ico.erro aria-hidden="true" />{erro}</p>}
            </form>
        </Dialogo>
    );
}
