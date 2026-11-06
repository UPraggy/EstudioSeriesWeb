// Etapas de texto do showrunner com uma IA de fora (ChatGPT, Claude, Gemini...):
//  - aba "Ver prompt": o prompt EXATO da etapa (sistema + usuário), modelo, limite e o formato esperado, sem gastar;
//  - aba "Colar resposta de fora": cola o JSON (ou o texto com JSON dentro); o servidor confere como se tivesse
//    vindo da IA (mesma validação e consertos) e devolve uma proposta normal, com custo 0.
// props: aberto, modo ('ver' | 'colar'), titulo, etapa, serieId, obterContexto (async () => contexto),
//        onFechar, onResultado(r) (a proposta aceita, com r.origem = 'externo')
import { useEffect, useState } from 'react';
import Dialogo from './Dialogo';
import { Ico } from './icones';
import { Abas, Esqueleto, Girador, Trocar } from './Movimento';
import { BlocoPedido, copiar } from './PedidoExterno';
import { ProporResultadoExterno, VerPromptEtapa } from '../funcionalidades/bancoGet';
import { erroDe } from '../funcionalidades/fetchFunc';
import '../../assets/css/PromptEtapa.css';

const NOME_ETAPA = { ideias: 'ideias', biblia: 'bíblia', roteiro: 'roteiro', decupagem: 'decupagem', atualizarMundo: 'atualizar o mundo' };

export default function PromptEtapa({ aberto, modo = 'ver', titulo, etapa, serieId, obterContexto, onFechar, onResultado }) {
    const [aba, setAba] = useState(modo);
    const [info, setInfo] = useState(null);
    const [carregando, setCarregando] = useState(false);
    const [erro, setErro] = useState('');
    const [texto, setTexto] = useState('');
    const [conferindo, setConferindo] = useState(false);
    const [problemas, setProblemas] = useState(null);

    useEffect(() => {
        if (!aberto) return undefined;
        setAba(modo);
        setErro('');
        setProblemas(null);
        let vivo = true;
        (async () => {
            setCarregando(true);
            setInfo(null);
            const contexto = obterContexto ? await obterContexto() : {};
            const r = await VerPromptEtapa({ etapa, serieId, contexto });
            if (!vivo) return;
            setCarregando(false);
            if (erroDe(r)) { setErro(erroDe(r)); return; }
            setInfo({ ...r, contexto });
        })();
        return () => { vivo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aberto, etapa, serieId, modo]);

    async function conferir() {
        setConferindo(true);
        setErro('');
        setProblemas(null);
        const contexto = info && info.contexto ? info.contexto : (obterContexto ? await obterContexto() : {});
        const r = await ProporResultadoExterno({ etapa, serieId, contexto, texto });
        setConferindo(false);
        if (erroDe(r)) { setErro(erroDe(r)); return; }
        if (!r.resultado) { setProblemas(r.erros && r.erros.length ? r.erros : ['A resposta não trouxe o JSON da etapa.']); return; }
        setTexto('');
        onResultado(r);
    }

    const nome = NOME_ETAPA[etapa] || etapa;
    const rodape = aba === 'colar'
        ? (
            <>
                <span className="dlg-rodape-esq"><Ico.custo aria-hidden="true" />Sem custo: nada vai para a IA do Estúdio.</span>
                <button type="button" className="btn" onClick={onFechar} data-foco>Cancelar</button>
                <button type="button" className="btn primario" onClick={conferir} disabled={!texto.trim() || conferindo} aria-busy={conferindo}>
                    {conferindo && <Girador />}<Ico.confirmar aria-hidden="true" />Conferir e usar
                </button>
            </>
        )
        : (
            <>
                <span className="dlg-rodape-esq"><Ico.custo aria-hidden="true" />Ver o prompt não gasta nada.</span>
                <button type="button" className="btn" onClick={onFechar} data-foco>Fechar</button>
                <button type="button" className="btn primario" onClick={() => setAba('colar')}>
                    <Ico.colar aria-hidden="true" />Colar resposta de fora
                </button>
            </>
        );

    return (
        <Dialogo
            aberto={aberto}
            id="prompt-etapa"
            icone={aba === 'colar' ? Ico.colar : Ico.verPrompt}
            titulo={titulo || `Etapa: ${nome}`}
            descricao="Leve o prompt para outra IA (ChatGPT, Claude, Gemini...) e cole a resposta aqui. Ela passa pelas mesmas conferências de uma resposta do Estúdio."
            onFechar={onFechar}
            largura={820}
            travado={conferindo}
            rodape={rodape}
        >
            <Abas
                abas={[{ id: 'ver', rotulo: 'Ver prompt', icone: Ico.verPrompt }, { id: 'colar', rotulo: 'Colar resposta de fora', icone: Ico.colar }]}
                ativa={aba}
                onTrocar={setAba}
                rotuloAria="Prompt da etapa"
                className="pe-abas"
            />
            {erro && <p className="dlg-erro" role="alert"><Ico.erro aria-hidden="true" />{erro}</p>}
            <Trocar chave={aba}>
                {aba === 'ver' && (
                    <div className="pe-corpo">
                        {carregando && <Esqueleto linhas={6} />}
                        {info && info.ok === false && (
                            <div className="dlg-aviso"><Ico.aviso aria-hidden="true" /><span>Ainda não dá para montar o prompt: {(info.erros || []).join(' ')}</span></div>
                        )}
                        {info && info.ok !== false && (
                            <>
                                <BlocoPedido
                                    rotuloPrompt="Prompt completo (instruções + pedido)"
                                    prompt={info.promptCompleto}
                                    dados={[
                                        ['Modelo do Estúdio', info.modelo],
                                        ['Limite de resposta', info.maxTokens ? `${info.maxTokens} tokens` : null],
                                        ['Tamanho do prompt', info.tamanhoPrompt ? `${info.tamanhoPrompt.toLocaleString('pt-BR')} caracteres` : null],
                                    ]}
                                    json={{ etapa: info.etapa, modelo: info.modelo, maxTokens: info.maxTokens, mensagens: info.mensagens, contexto: info.contexto }}
                                    extra={(
                                        <>
                                            <button type="button" className="btn mini" onClick={() => copiar(info.formato, 'Formato copiado')} disabled={!info.formato}>
                                                <Ico.json aria-hidden="true" />Copiar formato (JSON)
                                            </button>
                                            <button type="button" className="btn mini fantasma" onClick={() => copiar(info.sistema, 'Instruções copiadas')}>
                                                <Ico.copiar aria-hidden="true" />Só as instruções
                                            </button>
                                            <button type="button" className="btn mini fantasma" onClick={() => copiar(info.usuario, 'Pedido copiado')}>
                                                <Ico.copiar aria-hidden="true" />Só o pedido
                                            </button>
                                        </>
                                    )}
                                />
                                {info.formato && (
                                    <details className="pe-formato">
                                        <summary>Formato esperado da resposta</summary>
                                        <pre>{info.formato}</pre>
                                    </details>
                                )}
                                {(info.avisos || []).length > 0 && (
                                    <ul className="pe-avisos">{info.avisos.map((a, i) => <li key={i}><Ico.info aria-hidden="true" />{a}</li>)}</ul>
                                )}
                            </>
                        )}
                    </div>
                )}
                {aba === 'colar' && (
                    <div className="pe-corpo">
                        <label className="dlg-campo" htmlFor="pe-texto">
                            <span>Resposta da outra IA</span>
                            <textarea
                                id="pe-texto"
                                rows={12}
                                value={texto}
                                onChange={(e) => { setTexto(e.target.value); setProblemas(null); }}
                                placeholder={'Cole aqui o JSON, ou a resposta inteira com o JSON dentro.\nEx.: {"versao":1,"n":1,"titulo":"...","planos":[...]}'}
                                spellCheck={false}
                            />
                            <small>{texto.length ? `${texto.length.toLocaleString('pt-BR')} caracteres.` : 'Texto em volta, cercas ```json e vírgula sobrando são consertados sozinhos.'}</small>
                        </label>
                        {problemas && (
                            <div className="dlg-erro" role="alert">
                                <Ico.erro aria-hidden="true" />
                                <div>
                                    <strong>A resposta não serviu:</strong>
                                    <ul className="pe-problemas">{problemas.map((p, i) => <li key={i}>{p}</li>)}</ul>
                                </div>
                            </div>
                        )}
                        <p className="dlg-nota">Com problemas menores ela entra como "proposta com problemas", igual a uma resposta do Estúdio. Nada é salvo até você aprovar.</p>
                    </div>
                )}
            </Trocar>
        </Dialogo>
    );
}
