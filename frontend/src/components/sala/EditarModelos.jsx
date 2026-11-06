import { useEffect, useMemo, useState } from 'react';
import Dialogo from '../subComponents/Dialogo';
import GlobalVar from '../subComponents/GlobalVar';
import { Ico } from '../subComponents/icones';
import { Esqueleto, Girador, avisar } from '../subComponents/Movimento';
import { CatalogoModelos, SalvarModelos } from '../funcionalidades/bancoGet';
import { erroDe } from '../funcionalidades/fetchFunc';
import '../../assets/css/EditarModelos.css';

// Troca os modelos da série (serie.json → modelos). Tudo passa pelo OpenRouter, com a chave do OpenRouter:
// "openai/…", "google/…" são só o fornecedor dentro do catálogo do OpenRouter. Não gasta nada ao salvar.
const PAPEIS = [
    { id: 'texto', rotulo: 'Texto', ajuda: 'Showrunner (roteiro, bíblia, decupagem) e memória da série.', tipo: 'texto', icone: 'texto' },
    { id: 'imagem', rotulo: 'Imagem', ajuda: 'Fichas de personagem/local e quadro-chave de cada plano.', tipo: 'imagem', icone: 'imagem' },
    { id: 'videoRascunho', rotulo: 'Vídeo rascunho', ajuda: 'Testes baratos antes do take final.', tipo: 'video', icone: 'video' },
    { id: 'videoFinal', rotulo: 'Vídeo final', ajuda: 'Take que entra no episódio.', tipo: 'video', icone: 'video' },
    { id: 'apresentador', rotulo: 'Apresentador', ajuda: 'Narrador falando para a câmera (lip-sync).', tipo: 'video', icone: 'personagem' },
];

function precoDe(tipo, m) {
    if (!m) return '';
    if (tipo === 'texto') {
        if (m.entradaUsdMilhao == null) return 'preço não informado';
        return `US$ ${String(m.entradaUsdMilhao).replace('.', ',')} entrada, US$ ${String(m.saidaUsdMilhao).replace('.', ',')} saída, por milhão de tokens`;
    }
    if (tipo === 'video') {
        const p = m.precoExemplo || {};
        if (p.erro || p.semAudioUsd == null) return 'preço na cotação';
        const base = `${p.duracaoS} s ${p.resolucao || ''}: ${GlobalVar.usdFino(p.semAudioUsd)} sem áudio`;
        return p.comAudioUsd != null ? `${base}, ${GlobalVar.usdFino(p.comAudioUsd)} com áudio` : base;
    }
    const partes = [];
    if (m.referencias) partes.push(`até ${m.referencias} referência${m.referencias > 1 ? 's' : ''}`);
    if (m.vertical === false) partes.push('sem 9:16');
    partes.push('preço na cotação');
    return partes.join(', ');
}

export default function EditarModelos({ aberto, serieId, atuais = {}, onFechar, onSalvo }) {
    const [cat, setCat] = useState(null);
    const [erro, setErro] = useState('');
    const [escolha, setEscolha] = useState({});
    const [busca, setBusca] = useState('');
    const [salvando, setSalvando] = useState(false);

    useEffect(() => {
        if (!aberto) return;
        setEscolha({ ...atuais });
        setBusca('');
        setErro('');
        if (!cat) CatalogoModelos().then((r) => (erroDe(r) ? setErro(erroDe(r)) : setCat(r)));
    }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

    const filtrar = useMemo(() => {
        const t = busca.trim().toLowerCase();
        return (lista, atual) => {
            const l = (lista || []).filter((m) => !t || m.id.toLowerCase().includes(t) || String(m.nome || '').toLowerCase().includes(t));
            // o modelo atual sempre aparece, mesmo fora do filtro ou do catálogo
            if (atual && !l.some((m) => m.id === atual)) l.unshift({ id: atual, nome: atual, foraDoCatalogo: !(lista || []).some((m) => m.id === atual) });
            return l;
        };
    }, [busca]);

    const mudou = PAPEIS.filter((p) => escolha[p.id] && escolha[p.id] !== atuais[p.id]);

    async function salvar() {
        setSalvando(true);
        const pedido = Object.fromEntries(mudou.map((p) => [p.id, escolha[p.id]]));
        const r = await SalvarModelos({ serie: serieId, modelos: pedido });
        setSalvando(false);
        if (erroDe(r)) { setErro(erroDe(r)); avisar(erroDe(r), 'erro'); return; }
        (r.avisos || []).forEach((a) => avisar(a, 'aviso'));
        avisar(mudou.length === 1 ? `Modelo de ${mudou[0].rotulo.toLowerCase()} trocado` : `${mudou.length} modelos trocados`);
        onSalvo && onSalvo(r.modelos);
        onFechar();
    }

    return (
        <Dialogo
            aberto={aberto}
            id="dlg-modelos"
            icone={Ico.config}
            titulo="Modelos da série"
            descricao="Tudo roda pelo OpenRouter, com a sua chave de lá. O nome antes da barra (openai, google, bytedance…) é só o fornecedor dentro do catálogo do OpenRouter."
            largura={680}
            onFechar={onFechar}
            travado={salvando}
            rodape={(
                <>
                    <span className="dlg-rodape-esq">{mudou.length ? `${mudou.length} troca${mudou.length > 1 ? 's' : ''} para salvar` : 'Nada mudou'}</span>
                    <button type="button" className="btn" onClick={onFechar} disabled={salvando} data-foco>Cancelar</button>
                    <button type="button" className="btn primario" onClick={salvar} disabled={!mudou.length || salvando} aria-busy={salvando}>
                        {salvando && <Girador />}<Ico.salvar aria-hidden="true" />Salvar modelos
                    </button>
                </>
            )}
        >
            {erro && <p className="nota-erro" role="alert"><Ico.erro aria-hidden="true" /><span>{erro}</span></p>}
            {!cat && !erro && <Esqueleto linhas={6} />}
            {cat && (
                <div className="modelos-editar">
                    <label className="campo modelos-busca">
                        <span>Filtrar modelos</span>
                        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex.: veo, seedance, gemini, claude" spellCheck={false} />
                        <small>
                            Catálogo do OpenRouter{cat.texto.baixadoEm ? ` de ${new Date(cat.texto.baixadoEm).toLocaleDateString('pt-BR')}` : ''}.
                            Preço de referência; o valor exato aparece na cotação antes de cada gasto.
                        </small>
                    </label>
                    {PAPEIS.map((p) => {
                        const Icone = Ico[p.icone];
                        const lista = filtrar(cat[p.tipo]?.modelos, escolha[p.id]);
                        const sel = (cat[p.tipo]?.modelos || []).find((m) => m.id === escolha[p.id]);
                        const trocado = escolha[p.id] !== atuais[p.id];
                        return (
                            <div key={p.id} className={`modelo-linha${trocado ? ' trocado' : ''}`}>
                                <label className="campo">
                                    <span><Icone aria-hidden="true" />{p.rotulo}{trocado && <em className="modelo-novo">novo</em>}</span>
                                    <select value={escolha[p.id] || ''} onChange={(e) => setEscolha((x) => ({ ...x, [p.id]: e.target.value }))}>
                                        {!escolha[p.id] && <option value="">Escolha um modelo</option>}
                                        {lista.map((m) => (
                                            <option key={m.id} value={m.id}>{m.foraDoCatalogo ? `${m.id} (fora do catálogo)` : m.id}</option>
                                        ))}
                                    </select>
                                    <small>{p.ajuda} {sel ? precoDe(p.tipo, sel) + '.' : ''}</small>
                                </label>
                                {trocado && atuais[p.id] && (
                                    <button type="button" className="btn mini fantasma" onClick={() => setEscolha((x) => ({ ...x, [p.id]: atuais[p.id] }))} title={`Voltar para ${atuais[p.id]}`}>
                                        <Ico.desfazer aria-hidden="true" />Voltar
                                    </button>
                                )}
                            </div>
                        );
                    })}
                    {cat.simulado && <p className="nota-aviso"><Ico.simulado aria-hidden="true" /><span>Modo simulado: o catálogo é o último baixado.</span></p>}
                </div>
            )}
        </Dialogo>
    );
}
