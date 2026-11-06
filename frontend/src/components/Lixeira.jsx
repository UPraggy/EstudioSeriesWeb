import { useCallback, useEffect, useState } from 'react';
import Dialogo from './subComponents/Dialogo';
import GlobalVar from './subComponents/GlobalVar';
import { Ico } from './subComponents/icones';
import { Esqueleto, Girador, Item, Lista, Vazio, avisar } from './subComponents/Movimento';
import { ListarLixeira, RestaurarDaLixeira, rotaIndisponivel } from './funcionalidades/bancoGet';
import { erroDe } from './funcionalidades/fetchFunc';
import { SEM_ROTA, mb } from './sala/ApagarSerie';
import { plural } from './sala/serieUtil';
import './../assets/css/Lixeira.css';

/**
 * Lixeira do Estúdio: séries e episódios apagados (<dados>\_lixeira). Restaurar devolve para onde estavam e nunca
 * sobrescreve (se já existir outro no lugar, o servidor recusa e explica). O Estúdio nunca esvazia a lixeira.
 * onRestaurado(resposta) recarrega a tela de quem abriu.
 */
export default function Lixeira({ aberto, pastaDados, onFechar, onRestaurado }) {
    const [itens, setItens] = useState(null);
    const [erro, setErro] = useState('');
    const [restaurando, setRestaurando] = useState('');
    const [erros, setErros] = useState({});

    const carregar = useCallback(async () => {
        const r = await ListarLixeira();
        if (rotaIndisponivel(r)) { setErro(SEM_ROTA); setItens([]); return; }
        if (erroDe(r)) { setErro(erroDe(r)); setItens([]); return; }
        setErro('');
        setItens(r.itens || []);
    }, []);

    useEffect(() => {
        if (!aberto) return;
        setItens(null); setErros({}); setRestaurando('');
        carregar();
    }, [aberto, carregar]);

    async function restaurar(i) {
        setRestaurando(i.item);
        setErros((e) => ({ ...e, [i.item]: '' }));
        const r = await RestaurarDaLixeira({ item: i.item });
        setRestaurando('');
        if (rotaIndisponivel(r)) { setErros((e) => ({ ...e, [i.item]: SEM_ROTA })); return; }
        if (erroDe(r)) { setErros((e) => ({ ...e, [i.item]: erroDe(r) })); return; }
        avisar(i.tipo === 'serie' ? `"${i.titulo}" voltou para Séries` : `Ep. ${i.ep} voltou para "${i.tituloSerie}"`, 'ok', 4500);
        await carregar();
        onRestaurado && onRestaurado(r);
    }

    const raiz = pastaDados || 'E:\\EstudioSeriesDados';

    return (
        <Dialogo
            id="lixeira"
            aberto={aberto}
            titulo="Lixeira"
            icone={Ico.lixeira}
            descricao="O que você apagou fica aqui, inteiro, até você decidir. Restaurar devolve para onde estava."
            onFechar={onFechar}
            travado={Boolean(restaurando)}
            largura={600}
            rodape={<button type="button" className="btn" onClick={onFechar} disabled={Boolean(restaurando)} data-foco>Fechar</button>}
        >
            <div className="lx">
                {itens === null && <Esqueleto linhas={3} />}
                {erro && <p className="dlg-erro" role="alert"><Ico.erro aria-hidden="true" />{erro}</p>}
                {itens && itens.length === 0 && !erro && (
                    <Vazio icone={Ico.lixeira} titulo="A lixeira está vazia" texto="Séries e episódios apagados aparecem aqui e podem voltar quando você quiser." />
                )}
                {itens && itens.length > 0 && (
                    <Lista as="ul" className="lx-itens">
                        {itens.map((i) => {
                            const Icone = i.tipo === 'serie' ? Ico.series : Ico.episodio;
                            const ocupado = restaurando === i.item;
                            const nome = i.tipo === 'serie'
                                ? (i.titulo || i.serie)
                                : `Ep. ${String(i.ep).padStart(2, '0')}${i.titulo ? `: ${i.titulo}` : ''}`;
                            const sobre = i.tipo === 'serie'
                                ? `Série, ${plural(i.arquivos, 'arquivo', 'arquivos')}, ${mb(i.tamanhoMb)}`
                                : `Episódio de "${i.tituloSerie}", ${mb(i.tamanhoMb)}`;
                            return (
                                <Item as="li" key={i.item} className="lx-item">
                                    <span className="lx-item-ico" aria-hidden="true"><Icone /></span>
                                    <span className="lx-item-txt">
                                        <strong title={nome}>{nome}</strong>
                                        <span>{sobre}</span>
                                        <span>Apagado em {GlobalVar.dataHoraBR(i.apagadoEm) || '—'}</span>
                                    </span>
                                    {i.tipo === 'serie' || i.tipo === 'episodio' ? (
                                        <button type="button" className="btn mini" onClick={() => restaurar(i)} disabled={Boolean(restaurando)} aria-busy={ocupado} aria-label={`Restaurar ${nome}`}>
                                            {ocupado && <Girador />}
                                            <Ico.restaurar aria-hidden="true" /><span>Restaurar</span>
                                        </button>
                                    ) : <span className="lx-item-txt"><span>Restaure à mão</span></span>}
                                    {(erros[i.item] || i.erro) && (
                                        <p className="lx-item-erro" role="alert"><Ico.erro aria-hidden="true" />{erros[i.item] || i.erro}</p>
                                    )}
                                </Item>
                            );
                        })}
                    </Lista>
                )}
                <p className="lx-texto">
                    Fica em <code className="lx-caminho">{`${raiz}\\_lixeira\\`}</code>, uma pasta por item com um <code className="lx-caminho">motivo.json</code>. O Estúdio nunca esvazia a lixeira: para liberar espaço, apague a pasta à mão.
                </p>
            </div>
        </Dialogo>
    );
}
