import { textoDuracao } from './serieUtil';
import '../../assets/css/FolhaRoteiro.css';

// Página de roteiro no formato de cinema (Courier Prime): cabeçalho de cada plano, rubrica, nome de quem fala
// em caixa alta centralizado (convenção de roteiro) e a fala embaixo. É a ÚNICA ousadia tipográfica do app.

const EXTENSAO = { narracao: 'OFF', radio: 'NO RÁDIO', telefone: 'AO TELEFONE' };
const TIPO = { video_ia: 'vídeo novo', apresentador: 'apresentador na tela', grafico: 'gráfico', reaproveitar: 'clipe do acervo' };
const COR = { narrador: 'var(--cor-narrador)', mara: 'var(--cor-mara)', davi: 'var(--cor-davi)', alerta: 'var(--cor-radio)' };

// "0:05" · "0:04,8"
function tc(s) {
    const v = Math.max(0, Math.round((Number(s) || 0) * 10) / 10);
    const m = Math.floor(v / 60);
    const r = Math.round((v - m * 60) * 10) / 10;
    const [int, dec] = String(r).split('.');
    return `${m}:${int.padStart(2, '0')}${dec ? `,${dec}` : ''}`;
}

/**
 * roteiro: o roteiro.json (ou a proposta do showrunner).
 * nomes: { id → nome } de quem fala · locais: { id → nome do local } · rascunho: proposta ainda não salva.
 * compacta: folha mais estreita (comparar lado a lado) · mudados: Set com os n dos planos que mudaram (comparação).
 */
export default function FolhaRoteiro({ roteiro, nomes = {}, locais = {}, rascunho = false, compacta = false, mudados = null }) {
    const planos = Array.isArray(roteiro.planos) ? roteiro.planos : [];
    const escolhas = roteiro.escolhas && (roteiro.escolhas.A || roteiro.escolhas.B) ? roteiro.escolhas : null;
    const nomeDe = (quem) => {
        if (quem === 'narrador') return 'Narrador';
        if (quem === 'alerta') return 'Alerta';
        return nomes[quem] || quem || '—';
    };

    return (
        <article className={`folha${rascunho ? ' rascunho' : ''}${compacta ? ' compacta' : ''}`} aria-label={`Roteiro do episódio ${roteiro.n || ''}: ${roteiro.titulo || ''}`}>
            <header className="folha-cab">
                <h3 className="folha-titulo">{roteiro.titulo || `Episódio ${roteiro.n}`}</h3>
                <p className="folha-credito">Episódio {roteiro.n}, {textoDuracao(roteiro.duracaoAlvoS || 60)}{escolhas ? ', com escolha A/B' : ''}</p>
                {roteiro.gancho && <p className="folha-gancho">{roteiro.gancho}</p>}
            </header>

            {planos.map((p) => {
                const local = locais[p.local] || p.local;
                const mudou = Boolean(mudados && mudados.has(p.n));
                return (
                    <section key={p.n} className={`cena${mudou ? ' mudou' : ''}`} aria-label={`Plano ${p.n}${mudou ? ', mudou' : ''}`}>
                        <h4 className="cena-cab">
                            <span>{p.n}. {local || 'Sem local'}{mudou && <span className="cena-mudou">mudou</span>}</span>
                            <span className="cena-tc">{tc(p.deS)}–{tc(p.ateS)}</span>
                        </h4>
                        {p.visual && <p className="rubrica">{p.visual}{TIPO[p.tipo] ? <span className="rubrica-tipo"> ({TIPO[p.tipo]})</span> : null}</p>}
                        {p.tela && <p className="rubrica na-tela">Na tela: {p.tela}</p>}
                        {(Array.isArray(p.falas) ? p.falas : []).map((f, i) => (
                            <div key={i} className="fala">
                                <p className="fala-quem">
                                    <span className="fala-cor" style={{ background: COR[f.quem] || 'var(--texto-3)' }} aria-hidden="true" />
                                    {nomeDe(f.quem)}{EXTENSAO[f.via] ? ` (${EXTENSAO[f.via]})` : ''}
                                </p>
                                <p className="fala-texto">{f.texto}</p>
                            </div>
                        ))}
                    </section>
                );
            })}

            {escolhas && (
                <section className="folha-escolha" aria-label="Escolha do público">
                    <p className="folha-escolha-tit">Escolha do público</p>
                    {['A', 'B'].map((l) => escolhas[l] && (
                        <div key={l} className="opcao-folha">
                            <span className="opcao-folha-letra">{l}.</span>
                            <div>
                                <p className="opcao-folha-texto">{escolhas[l].texto}</p>
                                {escolhas[l].detalhe && <p className="opcao-folha-detalhe">{escolhas[l].detalhe}</p>}
                            </div>
                        </div>
                    ))}
                </section>
            )}
            <p className="transicao">Fim.</p>
        </article>
    );
}
