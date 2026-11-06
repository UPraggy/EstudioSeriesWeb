import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import GlobalVar from './subComponents/GlobalVar';
import { Ico } from './subComponents/icones';
import { Abas, Esqueleto, Trocar, Vazio } from './subComponents/Movimento';
import { LerSerie, LerEpisodio } from './funcionalidades/bancoGet';
import { erroDe } from './funcionalidades/fetchFunc';
import { episodiosDaTemporada, quadrosDaSerie, textoDuracao } from './sala/serieUtil';
import { etapasDaSerie } from './sala/producaoUtil';
import VisaoGeral from './sala/VisaoGeral';
import Temporada from './sala/Temporada';
import Biblia from './sala/Biblia';
import ElencoLocais from './sala/ElencoLocais';
import Episodios from './sala/Episodios';
import NovoEpisodio from './sala/NovoEpisodio';
import ApagarSerie from './sala/ApagarSerie';
import MenuAcoes from './subComponents/MenuAcoes';
import '../assets/css/Telas.css';
import '../assets/css/SalaShowrunner.css';

const ABAS = [
    { id: 'visao', rotulo: 'Visão geral', icone: Ico.visaoGeral },
    { id: 'temporada', rotulo: 'Temporada', icone: Ico.temporada },
    { id: 'biblia', rotulo: 'Bíblia', icone: Ico.biblia },
    { id: 'elenco', rotulo: 'Elenco e locais', icone: Ico.elenco },
    { id: 'episodios', rotulo: 'Episódios', icone: Ico.episodio },
];

// Cabeçalho de cena: os quadros da série (a capa primeiro) sob um véu escuro, o título como cartaz e a ação principal.
function CabecalhoCena({ serieId, dados, onNovoEpisodio, onApagarSerie, onVerLixeira }) {
    const { serie, biblia } = dados;
    const quadros = quadrosDaSerie(dados);
    const eps = episodiosDaTemporada(serie, biblia);
    const criados = eps.filter((e) => e.criado);
    const ultimo = criados[criados.length - 1];
    const gasto = dados.custos ? dados.custos.gastoUsd : 0;
    const teto = serie.orcamento ? serie.orcamento.tetoSerieUsd : null;
    const premissa = String(biblia.premissa || serie.ideia || '').trim();

    return (
        <header className="sala-cena">
            {/* entrada única da tela: os quadros chegam em cascata (CSS @keyframes, ver SalaShowrunner.css) */}
            {quadros.length > 0 && (
                <div className="cena-quadros" aria-hidden="true">
                    {quadros.map((c, i) => (
                        <div key={c} className="cena-quadro" style={{ '--i': i }}>
                            <img src={GlobalVar.urlMidia(serieId, c)} alt="" />
                        </div>
                    ))}
                </div>
            )}
            <div className="cena-veu" aria-hidden="true" />
            <div className="cena-int">
                {serie.genero && <p className="cena-genero">{serie.genero}</p>}
                <h1 className="cena-titulo">{serie.titulo}</h1>
                {premissa && <p className="cena-premissa">{premissa}</p>}
                <ul className="cena-fatos" aria-label="Dados da série">
                    {/* estado REAL da base da série (ideia, bíblia, elenco); serie.etapa ficava parado e não decide mais nada */}
                    {(() => { const f = etapasDaSerie(dados).find((x) => x.estado !== 'feito'); return <li><Ico.series aria-hidden="true" /><span>{f ? <>Falta <strong>{f.nome.toLowerCase()}</strong></> : <>Base da série <strong>pronta</strong></>}</span></li>; })()}
                    <li><Ico.episodio aria-hidden="true" /><span><strong className="num">{criados.length}</strong> de <span className="num">{eps.length || criados.length}</span> episódios</span></li>
                    <li><Ico.duracao aria-hidden="true" /><span><strong className="num">{textoDuracao(serie.duracaoAlvoS || 60)}</strong> por padrão</span></li>
                    <li><Ico.custo aria-hidden="true" /><span><strong className="num">{GlobalVar.usd(gasto)}</strong>{teto ? <> de <span className="num">{GlobalVar.usd(teto)}</span></> : ' gastos'}</span></li>
                </ul>
                <div className="cena-acoes">
                    {ultimo ? (
                        <>
                            <Link className="btn primario" to={`/serie/${serieId}/ep/${ultimo.n}`}>
                                <Ico.episodio aria-hidden="true" />Abrir o Ep. {ultimo.n} na Mesa
                            </Link>
                            <button type="button" className="btn" onClick={() => onNovoEpisodio()}>
                                <Ico.novo className="ico-pular" aria-hidden="true" />Novo episódio
                            </button>
                        </>
                    ) : (
                        <button type="button" className="btn primario" onClick={() => onNovoEpisodio()}>
                            <Ico.novo className="ico-pular" aria-hidden="true" />Criar o primeiro episódio
                        </button>
                    )}
                    <MenuAcoes
                        rotulo="Mais ações da série"
                        classeBotao="btn icone cena-mais"
                        itens={[
                            { id: 'lixeira', rotulo: 'Ver a lixeira', icone: Ico.lixeira, onSelecionar: onVerLixeira },
                            { id: 'apagar', rotulo: 'Apagar série', icone: Ico.apagar, perigo: true, onSelecionar: onApagarSerie },
                        ]}
                    />
                </div>
            </div>
        </header>
    );
}

function SalaEsqueleto() {
    return (
        <main className="sala" aria-busy="true">
            <span className="sr" role="status">Carregando a série…</span>
            <div className="sala-cena sala-cena-esq">
                <div className="cena-int">
                    <Esqueleto altura={14} largura={200} />
                    <Esqueleto altura={64} largura="min(520px, 80%)" />
                    <Esqueleto linhas={2} largura="min(560px, 90%)" />
                    <Esqueleto altura={34} largura={260} />
                </div>
            </div>
            <div className="tela sala-corpo">
                <Esqueleto altura={40} />
                <div className="sala-esq-grade">
                    <Esqueleto altura={180} />
                    <Esqueleto altura={180} />
                </div>
            </div>
        </main>
    );
}

export default function SalaShowrunner({ ativaResp }) {
    const { id } = useParams();
    const [params, setParams] = useSearchParams();
    const aba = ABAS.some((a) => a.id === params.get('aba')) ? params.get('aba') : 'visao';
    const [dados, setDados] = useState(null);
    const [detalhes, setDetalhes] = useState({});
    const [erro, setErro] = useState('');
    const [novo, setNovo] = useState(null); // null = fechado; { n?, titulo? } = aberto
    const [apagar, setApagar] = useState(false);
    const navegar = useNavigate();
    const abasRef = useRef(null);

    const carregar = useCallback(async () => {
        const r = await LerSerie({ id });
        if (erroDe(r)) { setErro(erroDe(r)); return; }
        setErro('');
        setDados(r);
        // Detalhes (roteiro, planos, votação) dos episódios que já têm pasta.
        const criados = (r.serie.episodios || []).map((e) => e.n);
        const lidos = await Promise.all(criados.map((n) => LerEpisodio({ id, n })));
        const mapa = {};
        lidos.forEach((x, i) => { if (!erroDe(x) && x.episodio) mapa[criados[i]] = x.episodio; });
        setDetalhes(mapa);
    }, [id]);

    useEffect(() => {
        setDados(null);
        setDetalhes({});
        carregar();
    }, [carregar]);

    useEffect(() => {
        if (dados) document.title = `${dados.serie.titulo} · Estúdio de Séries`;
        return () => { document.title = 'Estúdio de Séries'; };
    }, [dados]);

    // No celular as abas rolam para os lados: a aba ativa sempre fica à vista.
    const temDados = Boolean(dados);
    useEffect(() => {
        const faixa = abasRef.current;
        const ativa = faixa && faixa.querySelector('[aria-selected="true"]');
        if (!faixa || !ativa || faixa.scrollWidth <= faixa.clientWidth) return;
        const alvo = ativa.offsetLeft - (faixa.clientWidth - ativa.offsetWidth) / 2;
        faixa.scrollTo({ left: Math.max(0, alvo), behavior: 'smooth' });
    }, [aba, temDados]);

    // Troca de aba (e, opcionalmente, sub-aba/ficha/episódio) pela URL: dá para voltar e compartilhar o link.
    // Só rola a página se as abas já saíram da tela (o cabeçalho de cena fica onde está).
    const irPara = useCallback((novaAba, extra = {}) => {
        const p = new URLSearchParams();
        if (novaAba && novaAba !== 'visao') p.set('aba', novaAba);
        Object.entries(extra).forEach(([k, v]) => { if (v !== undefined && v !== null) p.set(k, String(v)); });
        setParams(p);
        const el = abasRef.current;
        if (el) {
            const alvo = el.getBoundingClientRect().top + window.scrollY - 64;
            if (window.scrollY > alvo) window.scrollTo({ top: alvo });
        }
    }, [setParams]);

    const abrirNovo = useCallback((inicial = {}) => setNovo(inicial), []);

    if (erro) {
        return (
            <main className="tela sala">
                <Vazio icone={Ico.erro} titulo="Não consegui abrir a série" texto={`${id}: ${erro}`}>
                    <Link className="btn" to="/"><Ico.voltar className="ico-voltar" aria-hidden="true" />Voltar para Séries</Link>
                </Vazio>
            </main>
        );
    }
    if (!dados) return <SalaEsqueleto />;

    const criados = (dados.serie.episodios || []).length;
    const abas = ABAS.map((a) => (a.id === 'episodios' ? { ...a, contador: criados || null } : a));
    const rotuloAba = (ABAS.find((a) => a.id === aba) || ABAS[0]).rotulo;
    const props = { serieId: id, dados, detalhes, recarregar: carregar, irPara, params, ativaResp, abrirNovo };

    return (
        <main className={`sala${ativaResp ? ' resp' : ''}`}>
            <CabecalhoCena
                serieId={id}
                dados={dados}
                onNovoEpisodio={abrirNovo}
                onApagarSerie={() => setApagar(true)}
                onVerLixeira={() => navegar('/?lixeira=1')}
            />

            <div className="tela sala-corpo">
                <div ref={abasRef} className="sala-abas-faixa">
                    <Abas abas={abas} ativa={aba} onTrocar={(a) => irPara(a)} rotuloAria="Seções da série" className="sala-abas" />
                </div>
                <Trocar chave={aba} className="sala-conteudo">
                    <div role="tabpanel" aria-label={rotuloAba}>
                        {aba === 'visao' && <VisaoGeral {...props} />}
                        {aba === 'temporada' && <Temporada {...props} />}
                        {aba === 'biblia' && <Biblia {...props} />}
                        {aba === 'elenco' && <ElencoLocais {...props} />}
                        {aba === 'episodios' && <Episodios {...props} />}
                    </div>
                </Trocar>
            </div>

            <NovoEpisodio
                aberto={Boolean(novo)}
                serieId={id}
                dados={dados}
                inicial={novo}
                onFechar={() => setNovo(null)}
                onCriado={async (ep) => {
                    setNovo(null);
                    await carregar();
                    irPara('episodios', { ep: ep.n });
                }}
            />

            <ApagarSerie
                aberto={apagar}
                serie={{ id, titulo: dados.serie.titulo }}
                onFechar={() => setApagar(false)}
                onApagada={() => { setApagar(false); navegar('/'); }}
            />
        </main>
    );
}
