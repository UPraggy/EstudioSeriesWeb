// "Prompt e anexar" de uma ficha (elenco, local, objeto): para cada vista mostra o pedido EXATO que a geração usaria
// (prompt, modelo, proporção, destino e a imagem de referência que vai junto), com "Copiar prompt", "Copiar tudo
// (JSON)" e baixar a referência; e "Anexar imagem" para usar uma imagem gerada fora (Midjourney, Flow...) no mesmo
// lugar da geração (ref/<estado>-<vista>), sem custo.
// props: aberto, serieId, ficha, itens [{ vista: { id, nome }, pedido }], onFechar, onAnexado()
import { useEffect, useState } from 'react';
import Dialogo from '../subComponents/Dialogo';
import GlobalVar from '../subComponents/GlobalVar';
import { Ico } from '../subComponents/icones';
import { Esqueleto, avisar } from '../subComponents/Movimento';
import { BlocoPedido, BotaoAnexar, copiar, lerBase64 } from '../subComponents/PedidoExterno';
import { AnexarImagemFicha, VerPedidoGeracao } from '../funcionalidades/bancoGet';
import { erroDe } from '../funcionalidades/fetchFunc';
import { PASTA_DO_TIPO, refsDaFicha, urlDaFicha } from './serieUtil';
import '../../assets/css/PedidoFicha.css';

export default function PedidoFicha({ aberto, serieId, ficha, itens = [], onFechar, onAnexado }) {
    const [vistos, setVistos] = useState({});
    const [carregando, setCarregando] = useState(false);
    const [erro, setErro] = useState('');
    const [anexando, setAnexando] = useState('');

    const chaveItens = itens.map((it) => `${it.vista.id}:${it.pedido.prompt}`).join('|');
    useEffect(() => {
        if (!aberto || !ficha) return undefined;
        let vivo = true;
        setCarregando(true);
        setErro('');
        Promise.all(itens.map((it) => VerPedidoGeracao({ tipo: 'imagem', serie: serieId, pedido: it.pedido }))).then((rs) => {
            if (!vivo) return;
            setCarregando(false);
            const falha = rs.find((r) => erroDe(r));
            if (falha) { setErro(erroDe(falha)); return; }
            setVistos(Object.fromEntries(rs.map((r, i) => [itens[i].vista.id, r])));
        });
        return () => { vivo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aberto, serieId, ficha && ficha.id, chaveItens]);

    if (!ficha) return <Dialogo aberto={false} titulo="" onFechar={onFechar} />;
    const pasta = PASTA_DO_TIPO[ficha.tipo];
    const estado = ficha.estadoAtual || 'padrao';
    const refsAtuais = Object.fromEntries(refsDaFicha(ficha).map((r) => [r.vista, r.caminho]));

    async function anexar(vista, arquivo) {
        setAnexando(vista.id);
        setErro('');
        let base64;
        try { base64 = await lerBase64(arquivo); } catch (e) { setAnexando(''); setErro(e.message); return; }
        const r = await AnexarImagemFicha({ serie: serieId, tipo: pasta, id: ficha.id, estado, vista: vista.id, arquivo: { nome: arquivo.name, base64 } });
        setAnexando('');
        if (erroDe(r)) { setErro(erroDe(r)); avisar(`Não anexei: ${erroDe(r)}`, 'erro', 5000); return; }
        avisar(`${vista.nome} de ${ficha.nome} anexada (sem custo)`, 'ok');
        if (onAnexado) onAnexado(r);
    }

    const dadosFicha = { id: ficha.id, tipo: ficha.tipo, nome: ficha.nome, papel: ficha.papel || '', ancora: ficha.ancora || '', ...(ficha.onde ? { onde: ficha.onde } : {}), estado };
    const tudo = { ficha: dadosFicha, pedidos: itens.map((it) => ({ vista: it.vista.id, ...(vistos[it.vista.id] || { pedido: it.pedido }) })) };

    return (
        <Dialogo
            aberto={aberto}
            id="pedido-ficha"
            icone={Ico.verPrompt}
            titulo={`Prompt e anexar — ${ficha.nome}`}
            descricao="O que a geração mandaria para a IA, vista por vista. Gere onde quiser e anexe a imagem aqui: ela entra no mesmo lugar e registro da geração do Estúdio, sem custo."
            onFechar={onFechar}
            largura={860}
            travado={Boolean(anexando)}
            rodape={(
                <>
                    <span className="dlg-rodape-esq"><Ico.custo aria-hidden="true" />Ver e anexar não gastam nada.</span>
                    <button type="button" className="btn" onClick={() => copiar(JSON.stringify(tudo, null, 2), 'Ficha e pedidos copiados (JSON)')}>
                        <Ico.json aria-hidden="true" />Copiar tudo (JSON)
                    </button>
                    <button type="button" className="btn primario" onClick={onFechar} data-foco disabled={Boolean(anexando)}>Fechar</button>
                </>
            )}
        >
            <dl className="pf-ficha">
                <div><dt>Âncora</dt><dd>{ficha.ancora || 'Sem prompt âncora.'}</dd></div>
                {ficha.onde && <div><dt>Fica em</dt><dd>{ficha.onde}</dd></div>}
            </dl>
            {erro && <p className="dlg-erro" role="alert"><Ico.erro aria-hidden="true" />{erro}</p>}
            {carregando && <Esqueleto linhas={4} />}
            <div className="pf-vistas">
                {itens.map((it) => {
                    const v = vistos[it.vista.id];
                    const atual = refsAtuais[it.vista.id];
                    const imagens = (v ? v.arquivos : []).map((a) => ({
                        rotulo: a.papel === 'referencia' ? 'Referência (rosto canônico)' : a.papel,
                        url: a.caminho ? GlobalVar.urlMidia(serieId, a.caminho) : a.url,
                        nome: a.caminho ? a.caminho.split('/').pop() : undefined,
                    }));
                    return (
                        <div key={it.vista.id} className="pf-vista">
                            <div className="pf-atual">
                                {atual
                                    ? <img src={urlDaFicha(serieId, ficha, atual)} alt={`${ficha.nome}: ${it.vista.nome} atual`} loading="lazy" />
                                    : <span className="pf-sem"><Ico.imagem aria-hidden="true" />Sem imagem</span>}
                                <span className="suave">{atual ? 'Atual' : 'Ainda não tem'}</span>
                            </div>
                            <BlocoPedido
                                compacto
                                titulo={it.vista.nome}
                                prompt={it.pedido.prompt}
                                dados={[
                                    ['Modelo', (v && v.modelo) || it.pedido.modelo],
                                    ['Proporção', it.pedido.proporcao],
                                    ['Resolução', it.pedido.resolucao],
                                    ['Grava em', it.pedido.destino],
                                ]}
                                imagens={imagens}
                                json={v ? { ficha: dadosFicha, vista: it.vista.id, ...v } : { ficha: dadosFicha, vista: it.vista.id, pedido: it.pedido }}
                                extra={(
                                    <BotaoAnexar
                                        tipo="imagem"
                                        rotulo={atual ? 'Trocar por imagem de fora' : 'Anexar imagem'}
                                        ocupado={anexando === it.vista.id}
                                        disabled={Boolean(anexando) && anexando !== it.vista.id}
                                        onArquivo={(arq) => anexar(it.vista, arq)}
                                    />
                                )}
                            />
                        </div>
                    );
                })}
            </div>
        </Dialogo>
    );
}
