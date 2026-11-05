// ACERVO (esquerda): clipes do acervo da série, takes gerados, elenco e locais (referências), em pôsteres 9:16.
// Passar o mouse num pôster percorre os quadros do clipe (MesaMiniatura). Arrastar para a faixa de vídeo (ou
// "Usar no cursor") coloca o item na linha do tempo em modo "sobrescrever"; arrastar uma referência para o
// inspetor do plano define o quadro-chave.
import { useMemo, useState } from 'react';
import '../../assets/css/MesaAcervo.css';
import * as M from './mesaUtil';
import MesaMiniatura from './MesaMiniatura';
import { Ico } from '../subComponents/icones';
import { Abas, Lista, Item, Trocar, Vazio } from '../subComponents/Movimento';

function iniciarArraste(e, dados) {
    e.dataTransfer.setData('application/x-mesa', JSON.stringify(dados));
    e.dataTransfer.setData('text/plain', dados.arquivo);
    e.dataTransfer.effectAllowed = 'copy';
}

const semAcento = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function PosterClipe({ serie, dados, titulo, sub, naEdicao, simulado, aoUsar }) {
    return (
        <div
            className="ac-poster" draggable onDragStart={(e) => iniciarArraste(e, dados)}
            title={`${titulo}${sub ? `\n${sub}` : ''}\nPasse o mouse para ver os quadros; arraste para a faixa de vídeo.`}
        >
            <MesaMiniatura serie={serie} arquivo={dados.arquivo} duracaoS={dados.duracaoS} rotulo={titulo} mostrarDuracao>
                <div className="ac-veu">
                    {(naEdicao || simulado) && (
                        <span className="ac-marcas">
                            {naEdicao && <span className="ac-marca ok"><Ico.ok aria-hidden="true" />Na edição</span>}
                            {simulado && <span className="ac-marca"><Ico.simulado aria-hidden="true" />Simulado</span>}
                        </span>
                    )}
                    <span className="ac-titulo">{titulo}</span>
                    {sub && <span className="ac-sub">{sub}</span>}
                </div>
                <button type="button" className="btn mini ac-usar" onClick={() => aoUsar(dados)} title="Coloca o clipe no cursor da linha do tempo">
                    <Ico.novo className="ico-pular" aria-hidden="true" />Usar no cursor
                </button>
            </MesaMiniatura>
        </div>
    );
}

export default function MesaAcervo({ serie, ctx, doc, relogio, aplicar }) {
    const [aba, setAba] = useState('clipes');
    const [busca, setBusca] = useState('');
    const acervo = ctx.acervo || {};
    const usadosNaEdicao = useMemo(() => new Set((doc.faixas.video || []).map((v) => v.arquivo)), [doc]);
    const filtro = (txt) => !busca || semAcento(txt).includes(semAcento(busca));

    const usarNoCursor = (dados) => {
        const t = M.noQuadro(relogio.agora(), doc.fps || 24);
        const imagem = M.ehImagem(dados.arquivo);
        const dur = imagem ? 3 : Math.min(Number(dados.duracaoS) || 4, 4);
        const item = {
            id: M.novoId('v'), plano: M.planoNoTempo(doc, t + 0.01), arquivo: dados.arquivo, inicioS: M.arred(t), duracaoS: M.arred(M.noQuadro(dur, doc.fps || 24)),
            entradaS: 0, duracaoArquivoS: imagem ? null : Number(dados.duracaoS) || null, origem: imagem ? 'quadro' : (dados.origem || 'acervo'),
            mudo: Boolean(dados.mudo), volume: 0.6, descricao: dados.descricao || M.nomeArquivo(dados.arquivo), ...(dados.take ? { take: dados.take } : {}),
        };
        const d = M.clonar(doc);
        d.faixas.video = M.sobrescreverVideo(d.faixas.video, item);
        aplicar(d);
    };

    const takes = Object.entries((ctx.mesa && ctx.mesa.takes) || {})
        .flatMap(([plano, lista]) => (lista || []).map((t) => ({ ...t, plano: Number(plano) })))
        .sort((a, b) => a.plano - b.plano || String(a.id).localeCompare(String(b.id)));

    const abas = [
        { id: 'clipes', rotulo: 'Clipes', contador: (acervo.clipes || []).length },
        { id: 'takes', rotulo: 'Takes', contador: takes.length },
        { id: 'elenco', rotulo: 'Elenco', contador: (acervo.elenco || []).length },
        { id: 'locais', rotulo: 'Locais', contador: (acervo.locais || []).length },
    ];

    let conteudo = null;
    if (aba === 'clipes') {
        const lista = (acervo.clipes || []).filter((c) => filtro(`${c.descricao} ${c.local} ${(c.elenco || []).join(' ')} ${c.arquivo}`));
        conteudo = lista.length ? (
            <Lista className="ac-grade">
                {lista.map((c) => (
                    <Item key={c.arquivo}>
                        <PosterClipe
                            serie={serie} aoUsar={usarNoCursor}
                            dados={{ arquivo: c.arquivo, duracaoS: c.duracaoS, descricao: c.descricao, origem: 'acervo', mudo: /mudo/i.test(c.obs || '') || (c.elenco || []).includes('narrador') }}
                            titulo={c.descricao || M.nomeArquivo(c.arquivo)}
                            sub={[c.local, ...(c.elenco || [])].filter(Boolean).join(' · ')}
                            naEdicao={usadosNaEdicao.has(c.arquivo)}
                        />
                    </Item>
                ))}
            </Lista>
        ) : (
            <Vazio icone={busca ? Ico.buscar : Ico.video} titulo={busca ? 'Nenhum clipe com esse filtro' : 'Nenhum clipe no acervo'}
                texto={busca ? 'Tente outra palavra.' : 'Os clipes da série aparecem aqui para arrastar até a linha do tempo.'} />
        );
    } else if (aba === 'takes') {
        const lista = takes.filter((t) => filtro(`${t.id} ${t.instrucao || ''} plano ${t.plano}`));
        conteudo = lista.length ? (
            <Lista className="ac-grade">
                {lista.map((t) => (
                    <Item key={`${t.plano}-${t.id}`}>
                        <PosterClipe
                            serie={serie} aoUsar={usarNoCursor}
                            dados={{ arquivo: t.arquivo, duracaoS: t.duracaoS, descricao: t.instrucao || `Take ${t.id}`, origem: 'take', take: t.id, mudo: true }}
                            titulo={`Plano ${t.plano} · ${String(t.id).replace('_', ' ')}`}
                            sub={t.instrucao || 'Regeração de trecho'}
                            naEdicao={usadosNaEdicao.has(t.arquivo)}
                            simulado={t.simulado}
                        />
                    </Item>
                ))}
            </Lista>
        ) : (
            <Vazio icone={Ico.regerarTrecho} titulo={busca ? 'Nenhum take com esse filtro' : 'Nenhum take gerado ainda'}
                texto={busca ? 'Tente outra palavra.' : 'Arraste na régua para marcar um trecho e use "Regerar vídeo deste trecho".'} />
        );
    } else {
        const fichas = (acervo[aba] || []).filter((f) => filtro(`${f.nome} ${f.papel} ${f.ancora}`));
        conteudo = fichas.length ? (
            <Lista className="ac-fichas">
                {fichas.map((f) => (
                    <Item key={f.id} className="ac-ficha">
                        <div className="ac-ficha-cab">
                            {aba === 'elenco' ? <Ico.personagem aria-hidden="true" /> : <Ico.local aria-hidden="true" />}
                            <span className="ac-ficha-nome">{f.nome}</span>
                            {f.papel && <span className="ac-ficha-papel">{f.papel}</span>}
                        </div>
                        {f.ancora && <p className="ac-ancora" title={f.ancora}>{f.ancora}</p>}
                        {(f.refs || []).length ? (
                            <div className="ac-refs">
                                {f.refs.map((r) => (
                                    <div
                                        key={r.arquivo} className="ac-ref" draggable tabIndex={0} role="button"
                                        aria-label={`${f.nome}, ${r.rotulo}: usar no cursor`}
                                        title={`${r.rotulo}\nArraste para a faixa de vídeo ou para o quadro-chave do plano. Duplo clique: usar no cursor.`}
                                        onDragStart={(e) => iniciarArraste(e, { arquivo: r.arquivo, descricao: `${f.nome} (${r.rotulo})`, origem: 'quadro' })}
                                        onDoubleClick={() => usarNoCursor({ arquivo: r.arquivo, descricao: `${f.nome} (${r.rotulo})` })}
                                        onKeyDown={(e) => { if (e.key === 'Enter') usarNoCursor({ arquivo: r.arquivo, descricao: `${f.nome} (${r.rotulo})` }); }}
                                    >
                                        <MesaMiniatura serie={serie} arquivo={r.arquivo} rotulo={`${f.nome}, ${r.rotulo}`} />
                                    </div>
                                ))}
                            </div>
                        ) : <p className="ac-sem-ref"><Ico.imagem aria-hidden="true" />Sem referência ainda.</p>}
                    </Item>
                ))}
            </Lista>
        ) : (
            <Vazio icone={aba === 'elenco' ? Ico.elenco : Ico.local} titulo={busca ? 'Nada com esse filtro' : (aba === 'elenco' ? 'Sem elenco' : 'Sem locais')}
                texto={busca ? 'Tente outra palavra.' : 'Crie as fichas na Sala do showrunner.'} />
        );
    }

    return (
        <aside className="ac" aria-label="Acervo">
            <Abas abas={abas} ativa={aba} onTrocar={setAba} rotuloAria="Acervo" className="ac-abas" />
            <div className="ac-busca">
                <Ico.buscar aria-hidden="true" />
                <input type="search" placeholder="Filtrar o acervo" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Filtrar o acervo" />
            </div>
            <div className="ac-lista">
                <Trocar chave={aba}>{conteudo}</Trocar>
            </div>
        </aside>
    );
}
