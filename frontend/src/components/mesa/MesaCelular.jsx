// Mesa no celular: só a prévia (que toca) e a lista de planos; editar é no computador (≥ 1200 px).
import { Link } from 'react-router-dom';
import * as M from './mesaUtil';
import { useTempo } from './mesaRelogio';
import MesaPrevia from './MesaPrevia';
import MesaMiniatura from './MesaMiniatura';
import { Ico } from '../subComponents/icones';
import { Lista, Item } from '../subComponents/Movimento';

export default function MesaCelular({ serie, ep, doc, relogio, titulo, tituloEp }) {
    const { t } = useTempo(relogio);
    const lim = M.limitesPlanos(doc);
    const falas = M.FAIXAS_AUDIO.flatMap((f) => doc.faixas[f] || []);
    return (
        <div className="mesa mesa-celular">
            <header className="mesa-barra">
                <div className="mesa-cab">
                    <Link className="btn mini icone fantasma" to={`/serie/${serie}`} aria-label="Voltar para a série" title="Voltar para a série">
                        <Ico.voltar aria-hidden="true" />
                    </Link>
                    <div className="mesa-titulo">
                        <span className="mesa-titulo-serie">{titulo}</span>
                        <h1>Ep. {ep}{tituloEp ? <span className="mesa-titulo-ep"> · {tituloEp}</span> : null}</h1>
                    </div>
                </div>
            </header>
            <div className="cel-previa"><MesaPrevia serie={serie} doc={doc} relogio={relogio} compacta /></div>
            <p className="cel-nota"><Ico.info aria-hidden="true" />Para editar, abra a Mesa num computador (tela de 1200 px ou mais).</p>
            <Lista as="ol" className="cel-planos">
                {lim.map((p) => {
                    const plano = (doc.planos || []).find((x) => x.n === p.n) || {};
                    const v = (doc.faixas.video || []).find((x) => x.plano === p.n);
                    const ativo = t >= p.deS && t < p.ateS;
                    return (
                        <Item as="li" key={p.n}>
                            <button type="button" className={ativo ? 'ativo' : ''} aria-current={ativo ? 'true' : undefined} onClick={() => relogio.ir(p.deS)}>
                                <span className="cel-mini">
                                    {v && v.arquivo ? <MesaMiniatura serie={serie} arquivo={v.arquivo} rotulo={`Plano ${p.n}`} esfregar={false} /> : <span className="mm"><Ico.video aria-hidden="true" /></span>}
                                </span>
                                <span className="cel-texto">
                                    <span className="cel-cab"><b>Plano {p.n}</b><span className="num">{M.fmtTempo(p.deS, 1)} · {M.fmtS(p.ateS - p.deS, 1)}</span></span>
                                    {plano.tela && <span className="cel-tela">{plano.tela}</span>}
                                    {falas.filter((f) => f.plano === p.n).map((f) => <span key={f.id} className="cel-fala"><b style={{ color: M.corDe(f.quem) }}>{M.nomeDe(f.quem)}:</b> {f.texto}</span>)}
                                </span>
                            </button>
                        </Item>
                    );
                })}
            </Lista>
        </div>
    );
}
