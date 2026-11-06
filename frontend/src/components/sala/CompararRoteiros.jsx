import { useState } from 'react';
import { Ico } from '../subComponents/icones';
import FolhaRoteiro from './FolhaRoteiro';
import '../../assets/css/CompararRoteiros.css';

// Assinatura do que se lê num plano: se mudou, o plano ganha a marca "mudou" nas duas folhas.
const assinatura = (p) => JSON.stringify(p ? [p.deS, p.ateS, p.local, p.visual, p.tela, (p.falas || []).map((f) => [f.quem, f.via, f.texto])] : null);

export function planosMudados(a, b) {
    const pa = new Map((a && Array.isArray(a.planos) ? a.planos : []).map((p) => [p.n, p]));
    const pb = new Map((b && Array.isArray(b.planos) ? b.planos : []).map((p) => [p.n, p]));
    const mudados = new Set();
    for (const n of new Set([...pa.keys(), ...pb.keys()])) if (assinatura(pa.get(n)) !== assinatura(pb.get(n))) mudados.add(n);
    return mudados;
}

/**
 * Duas folhas lado a lado (no celular, alterna entre elas). Planos diferentes ficam marcados nas duas.
 * props: esquerda { rotulo, roteiro }, direita { rotulo, roteiro }, nomes, locais, n, onUsar (direita), onFechar
 */
export default function CompararRoteiros({ esquerda, direita, nomes, locais, n, onUsar, onFechar }) {
    const [lado, setLado] = useState('dir');
    const mudados = planosMudados(esquerda.roteiro, direita.roteiro);
    const tituloMudou = (esquerda.roteiro.titulo || '') !== (direita.roteiro.titulo || '');
    const resumo = mudados.size === 0
        ? (tituloMudou ? 'Só o título mudou.' : 'Os planos são iguais.')
        : `${mudados.size} ${mudados.size === 1 ? 'plano mudou' : 'planos mudaram'}${tituloMudou ? ' e o título também' : ''}.`;

    return (
        <section className="comparar" aria-label="Comparar propostas de roteiro">
            <div className="cmp-barra">
                <div className="cmp-texto">
                    <strong><Ico.comparar aria-hidden="true" />Comparando</strong>
                    <span>{esquerda.rotulo} com {direita.rotulo}. {resumo}</span>
                </div>
                <div className="cmp-alternar" role="group" aria-label="Qual folha ver">
                    <button type="button" className={`cmp-lado${lado === 'esq' ? ' ativo' : ''}`} aria-pressed={lado === 'esq'} onClick={() => setLado('esq')}>{esquerda.rotulo}</button>
                    <button type="button" className={`cmp-lado${lado === 'dir' ? ' ativo' : ''}`} aria-pressed={lado === 'dir'} onClick={() => setLado('dir')}>{direita.rotulo}</button>
                </div>
                <div className="acoes">
                    <button type="button" className="btn" onClick={onFechar}><Ico.fechar aria-hidden="true" />Fechar</button>
                    {onUsar && <button type="button" className="btn primario" onClick={onUsar}><Ico.confirmar aria-hidden="true" />Usar {direita.rotulo}</button>}
                </div>
            </div>
            <div className="cmp-grade" data-lado={lado}>
                <div className="cmp-col esq">
                    <p className="cmp-rotulo">{esquerda.rotulo}</p>
                    <FolhaRoteiro roteiro={{ ...esquerda.roteiro, n }} nomes={nomes} locais={locais} compacta mudados={mudados} rascunho={esquerda.rascunho} />
                </div>
                <div className="cmp-col dir">
                    <p className="cmp-rotulo">{direita.rotulo}</p>
                    <FolhaRoteiro roteiro={{ ...direita.roteiro, n }} nomes={nomes} locais={locais} compacta mudados={mudados} rascunho />
                </div>
            </div>
        </section>
    );
}
