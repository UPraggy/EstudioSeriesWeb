import { useCallback, useEffect, useState } from 'react';
import Dialogo from '../subComponents/Dialogo';
import GlobalVar from '../subComponents/GlobalVar';
import { Ico } from '../subComponents/icones';
import { Esqueleto, Girador, Item, Lista, Vazio, avisar } from '../subComponents/Movimento';
import { ListarVersoesRoteiro, RestaurarVersaoRoteiro, rotaIndisponivel } from '../funcionalidades/bancoGet';
import { erroDe } from '../funcionalidades/fetchFunc';
import { SEM_ROTA, mb } from './ApagarSerie';
import { plural, textoDuracao, textoMemoria } from './serieUtil';
import '../../assets/css/Lixeira.css';
import '../../assets/css/VersoesRoteiro.css';

const dois = (n) => String(n).padStart(2, '0');
const NOMES_CURTOS = { 'roteiro.json': 'roteiro', 'falas.json': 'falas', audio: 'áudio', 'edicao.json': 'edição', '.edicao': null, 'legendas.srt': 'legenda', 'legendas.ass': 'legenda', 'legendas-palavra.ass': 'legenda', saida: 'montagem' };

// "roteiro, falas, áudio e montagem" (sem repetir legenda; o histórico de desfazer não aparece).
function textoArquivos(arquivos = []) {
    const nomes = [...new Set(arquivos.map((a) => NOMES_CURTOS[a.nome]).filter(Boolean))];
    if (nomes.length <= 1) return nomes.join('');
    return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

// "2026-11-05_070923[-2]" → "05/11/2026 07:09" (o nome da pasta é a hora local em que a versão foi guardada).
function dataDaPasta(nome) {
    const m = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})/.exec(String(nome || ''));
    return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : '';
}

function origemDaVersao(v, porNome) {
    if (v.tipo === 'refazerRoteiro') return 'Guardada ao refazer o roteiro do zero';
    if (v.tipo === 'antesDeAjuste') return 'Guardada ao salvar um roteiro ajustado';
    if (v.tipo === 'antesDeRestaurar') {
        // A versão restaurada não está mais na lista (voltou para o episódio): a data sai do nome da pasta dela.
        const de = v.deVersao && porNome[v.deVersao];
        const quando = de ? GlobalVar.dataHoraBR(de.guardadoEm) : dataDaPasta(v.deVersao);
        return `Guardada ao voltar para ${quando ? `a versão de ${quando}` : 'outra versão'}`;
    }
    return 'Guardada à mão (sem motivo.json)';
}

/**
 * Versões do roteiro do episódio (episodios\epNN\_versoes\<data>\): lista com data, título, duração e o que cada uma
 * tem; "Voltar a esta versão" abre uma confirmação. Voltar NUNCA sobrescreve: o roteiro atual (e o que foi feito
 * dele, e a memória que veio dele) vai antes para uma pasta nova de _versoes. Takes e imagens pagos não mudam.
 * ep: { n, titulo } · onRestaurado(resposta) recarrega a página do episódio.
 */
export default function VersoesRoteiro({ aberto, serieId, ep, onFechar, onRestaurado }) {
    const [dados, setDados] = useState(null);
    const [erroLista, setErroLista] = useState('');
    const [escolhida, setEscolhida] = useState(null);
    const [ocupado, setOcupado] = useState(false);
    const [erro, setErro] = useState('');
    const n = ep ? ep.n : null;

    const carregar = useCallback(async () => {
        const r = await ListarVersoesRoteiro({ serie: serieId, ep: n });
        if (rotaIndisponivel(r)) { setErroLista(SEM_ROTA); setDados({ versoes: [], bloqueios: [], avisos: [] }); return; }
        if (erroDe(r)) { setErroLista(erroDe(r)); setDados({ versoes: [], bloqueios: [], avisos: [] }); return; }
        setErroLista('');
        setDados(r);
    }, [serieId, n]);

    useEffect(() => {
        if (!aberto || !n) return;
        setDados(null); setErroLista(''); setEscolhida(null); setErro(''); setOcupado(false);
        carregar();
    }, [aberto, n, carregar]);

    const versoes = dados ? dados.versoes || [] : [];
    const bloqueios = dados ? dados.bloqueios || [] : [];
    const atual = dados && dados.episodio ? dados.episodio.roteiroAtual : null;
    const memAtual = dados && dados.episodio ? textoMemoria(dados.episodio.memoriaAtual) : '';
    const porNome = Object.fromEntries(versoes.map((v) => [v.versao, v]));
    const idEp = n ? `ep${dois(n)}` : '';

    async function voltar() {
        if (!escolhida || ocupado || bloqueios.length) return;
        setOcupado(true);
        setErro('');
        const r = await RestaurarVersaoRoteiro({ serie: serieId, ep: n, versao: escolhida.versao });
        setOcupado(false);
        if (rotaIndisponivel(r)) { setErro(SEM_ROTA); return; }
        if (erroDe(r)) { setErro(erroDe(r)); avisar(`Não voltei: ${erroDe(r)}`, 'erro', 6000); return; }
        avisar(r.guardada ? 'Versão restaurada. A que estava valendo ficou guardada.' : 'Versão restaurada.', 'ok', 4500);
        (r.avisos || []).forEach((a) => avisar(a, 'info', 7000));
        setEscolhida(null);
        onRestaurado && onRestaurado(r);
    }

    const memEscolhida = escolhida ? textoMemoria(escolhida.memoria) : '';

    return (
        <>
            <Dialogo
                id="versoes-roteiro"
                aberto={aberto && !escolhida}
                titulo={`Versões do roteiro do Ep. ${n ? dois(n) : ''}`}
                icone={Ico.historico}
                descricao="Cada vez que o roteiro é refeito do zero ou trocado, o anterior fica guardado aqui, com o que foi feito a partir dele."
                onFechar={onFechar}
                largura={620}
                rodape={<button type="button" className="btn" onClick={onFechar} data-foco>Fechar</button>}
            >
                <div className="lx vr">
                    {!dados && <div aria-busy="true"><span className="sr" role="status">Lendo as versões…</span><Esqueleto linhas={3} /></div>}
                    {erroLista && <p className="dlg-erro" role="alert"><Ico.erro aria-hidden="true" />{erroLista}</p>}

                    {dados && !erroLista && (
                        <div className="vr-atual">
                            <Ico.roteiro aria-hidden="true" />
                            <span>
                                <strong>Valendo agora</strong>
                                {atual
                                    ? <span>{atual.titulo ? `"${atual.titulo}"` : 'Roteiro sem título'}, {textoDuracao(atual.duracaoAlvoS || atual.duracaoPlanosS || 0)}, {plural(atual.planos, 'plano', 'planos')}</span>
                                    : <span>Nenhum roteiro: a folha está em branco.</span>}
                            </span>
                        </div>
                    )}

                    {dados && !erroLista && versoes.length === 0 && (
                        <Vazio icone={Ico.historico} titulo="Nenhuma versão guardada" texto="Quando você refaz o roteiro do zero, o anterior aparece aqui e dá para voltar a ele." />
                    )}

                    {versoes.length > 0 && (
                        <Lista as="ul" className="lx-itens vr-itens">
                            {versoes.map((v) => {
                                const mem = textoMemoria(v.memoria);
                                const arquivos = textoArquivos(v.arquivos);
                                const nome = v.titulo ? `"${v.titulo}"` : (v.temRoteiro ? 'Roteiro sem título' : 'Sem roteiro');
                                return (
                                    <Item as="li" key={v.versao} className="lx-item vr-item">
                                        <span className="lx-item-ico" aria-hidden="true"><Ico.historico /></span>
                                        <span className="lx-item-txt">
                                            <strong title={nome}>{nome}</strong>
                                            <span>
                                                {v.duracaoAlvoS || v.duracaoPlanosS ? `${textoDuracao(v.duracaoAlvoS || v.duracaoPlanosS)}, ` : ''}
                                                {plural(v.planos, 'plano', 'planos')}
                                                {v.semEscolha === true ? ', sem votação' : ''}
                                                {v.aprovado === true ? ', aprovado' : ''}
                                            </span>
                                            <span>{origemDaVersao(v, porNome)} em {GlobalVar.dataHoraBR(v.guardadoEm) || v.versao}</span>
                                            <span className="vr-tem">
                                                {arquivos && <span className="vr-chip"><Ico.pasta aria-hidden="true" />{arquivos}</span>}
                                                {mem && <span className="vr-chip"><Ico.memoria aria-hidden="true" />Memória: {mem}</span>}
                                            </span>
                                        </span>
                                        {v.temRoteiro ? (
                                            <button
                                                type="button"
                                                className="btn mini"
                                                onClick={() => { setErro(''); setEscolhida(v); }}
                                                disabled={bloqueios.length > 0}
                                                title={bloqueios.length ? bloqueios[0] : undefined}
                                                aria-label={`Voltar à versão ${nome} de ${GlobalVar.dataHoraBR(v.guardadoEm)}`}
                                            >
                                                <Ico.restaurar aria-hidden="true" /><span>Voltar a esta versão</span>
                                            </button>
                                        ) : <span className="vr-mao">Restaure à mão</span>}
                                    </Item>
                                );
                            })}
                        </Lista>
                    )}

                    {(dados && dados.avisos || []).map((a) => <p key={a} className="dlg-aviso"><Ico.aviso aria-hidden="true" />{a}</p>)}
                    {bloqueios.length > 0 && (
                        <div className="lx-erros" role="alert">
                            {bloqueios.map((b) => <p key={b} className="dlg-erro"><Ico.bloqueado aria-hidden="true" />{b}</p>)}
                        </div>
                    )}
                    {dados && (
                        <p className="lx-texto">
                            Ficam em <code className="lx-caminho">{`episodios\\${idEp}\\_versoes\\`}</code>, uma pasta por versão. Takes e imagens pagos nunca entram nem saem daqui.
                        </p>
                    )}
                </div>
            </Dialogo>

            <Dialogo
                id="confirmar-versao"
                aberto={aberto && Boolean(escolhida)}
                titulo="Voltar a esta versão?"
                icone={Ico.restaurar}
                descricao={escolhida ? `O Ep. ${dois(n)} volta para o roteiro ${escolhida.titulo ? `"${escolhida.titulo}"` : 'sem título'}, guardado em ${GlobalVar.dataHoraBR(escolhida.guardadoEm)}.` : ''}
                onFechar={() => { if (!ocupado) { setEscolhida(null); setErro(''); } }}
                travado={ocupado}
                largura={560}
                rodape={(
                    <>
                        <button type="button" className="btn" onClick={() => { setEscolhida(null); setErro(''); }} disabled={ocupado} data-foco>Cancelar</button>
                        <button type="button" className="btn primario" onClick={voltar} disabled={ocupado || bloqueios.length > 0} aria-busy={ocupado}>
                            {ocupado && <Girador />}
                            <Ico.restaurar aria-hidden="true" /><span>Voltar a esta versão</span>
                        </button>
                    </>
                )}
            >
                {escolhida && (
                    <div className="lx vr">
                        <div className="lx-bloco fica">
                            <h3><Ico.historico aria-hidden="true" />A versão atual fica guardada</h3>
                            <ul className="lx-lista">
                                <li>
                                    <Ico.roteiro aria-hidden="true" />
                                    <span>
                                        {atual ? <><strong>{atual.titulo ? `"${atual.titulo}"` : 'O roteiro atual'}</strong> e o que foi feito dele (falas, edição, legendas, montagem)</> : 'O que foi feito depois (falas, edição, legendas, montagem), se houver'}
                                        {' '}vai para uma pasta nova de <code className="lx-caminho">{`_versoes\\`}</code>. Dá para voltar a ele por aqui.
                                    </span>
                                </li>
                                {memAtual && <li><Ico.memoria aria-hidden="true" /><span>Memória da série: <strong>{memAtual}</strong> que vieram dele saem da memória e vão junto.</span></li>}
                            </ul>
                        </div>
                        <div className="lx-bloco">
                            <h3><Ico.restaurar aria-hidden="true" />Volta para o episódio</h3>
                            <ul className="lx-lista">
                                <li><Ico.pasta aria-hidden="true" /><span>{textoArquivos(escolhida.arquivos) || 'roteiro'} desta versão, <span className="num">{mb(escolhida.tamanhoMb)}</span></span></li>
                                <li>
                                    <Ico.memoria aria-hidden="true" />
                                    <span>{memEscolhida ? <>Memória da série: <strong>{memEscolhida}</strong> desta versão voltam a valer.</> : 'Esta versão não guardou memória da série (ainda não tinha sido consolidada).'}</span>
                                </li>
                                <li><Ico.escolha aria-hidden="true" /><span>Título, duração e a escolha A/B voltam aos desta versão. Votação registrada continua valendo.</span></li>
                            </ul>
                        </div>
                        <p className="lx-proximo"><Ico.bloqueado aria-hidden="true" />Takes de vídeo e imagens (pagos) não saem do lugar. Nada é gasto.</p>
                        {bloqueios.length > 0 && (
                            <div className="lx-erros" role="alert">
                                {bloqueios.map((b) => <p key={b} className="dlg-erro"><Ico.bloqueado aria-hidden="true" />{b}</p>)}
                            </div>
                        )}
                        {erro && <p className="dlg-erro" role="alert"><Ico.erro aria-hidden="true" />{erro}</p>}
                    </div>
                )}
            </Dialogo>
        </>
    );
}
