// "A voz de Davi mudou (Cadu → Remy): 1 fala com a voz antiga" + "Regerar falas de Davi" (TTS grátis).
// Usado na página do episódio (perto do selo "Falas") e no topo da Mesa. A edição troca só as falas (Ctrl+Z desfaz).
import { useState } from 'react';
import { RegerarFalasVoz, rotaIndisponivel } from '../funcionalidades/bancoGet';
import { erroDe } from '../funcionalidades/fetchFunc';
import { Ico } from '../subComponents/icones';
import { Girador, avisar } from '../subComponents/Movimento';
import '../../assets/css/AvisoVozes.css';

const qtd = (n) => (n === 1 ? '1 fala' : `${n} falas`);

// O que mudou, em português: voz (Cadu → Remy) ou só o tom (+0Hz → -4Hz).
function textoMudanca(m) {
    if (m.mudouVoz) return `A voz de ${m.nome} mudou (${m.nomeVozAntes} → ${m.nomeVozAgora})`;
    return `O tom de ${m.nome} mudou (${m.tomAntes} → ${m.tomAgora})`;
}

/**
 * props: serieId, ep, mudancas (do /EstadoProducao ou /ConferirVozesFalas), erros (avisos de configuração),
 *        onFeito(resposta) — a tela recarrega a edição/estado; compacto (Mesa)
 */
export default function AvisoVozes({ serieId, ep, mudancas = [], erros = [], onFeito, compacto = false }) {
    const [ocupado, setOcupado] = useState(null); // quem (ou '*')
    if (!mudancas.length && !erros.length) return null;

    async function regerar(quem) {
        setOcupado(quem || '*');
        const r = await RegerarFalasVoz({ serie: serieId, ep, quem });
        setOcupado(null);
        if (rotaIndisponivel(r)) { avisar('Reinicie o Estúdio para regerar as falas por voz (rota nova).', 'aviso', 6000); return; }
        if (erroDe(r)) { avisar(`Não regerou: ${erroDe(r)}`, 'erro', 7000); return; }
        const n = (r.regeradas || []).length;
        avisar(`${qtd(n)} com a voz nova${r.modo === 'edicao' ? '. A edição foi atualizada (Ctrl+Z desfaz na Mesa).' : '.'}`, 'ok', 5000);
        (r.avisos || []).slice(0, 3).forEach((a) => avisar(a, 'aviso', 6000));
        if (onFeito) onFeito(r);
    }

    return (
        <div className={`aviso-vozes${compacto ? ' compacto' : ''}`} role="status">
            {mudancas.map((m) => (
                <div key={m.quem} className="av-linha">
                    <Ico.voz className="av-ico" aria-hidden="true" />
                    <p className="av-texto">
                        <strong>{textoMudanca(m)}</strong>
                        <span>: {qtd(m.falas.length)} com a voz antiga</span>
                    </p>
                    <button type="button" className="btn mini" onClick={() => regerar(m.quem)} disabled={Boolean(ocupado)} aria-busy={ocupado === m.quem}
                        title={`Gera de novo ${m.falas.length === 1 ? 'a fala' : 'as falas'} de ${m.nome} com a voz atual (TTS grátis). Vídeo, cortes e ajustes ficam.`}>
                        {ocupado === m.quem ? <Girador /> : <Ico.regerar className="ico-girar" aria-hidden="true" />}
                        Regerar falas de {m.nome}
                    </button>
                </div>
            ))}
            {mudancas.length > 1 && (
                <div className="av-todas">
                    <button type="button" className="btn mini fantasma" onClick={() => regerar(null)} disabled={Boolean(ocupado)} aria-busy={ocupado === '*'}>
                        {ocupado === '*' && <Girador />}Regerar todas as falas
                    </button>
                </div>
            )}
            {erros.map((e) => <p key={e} className="av-erro"><Ico.aviso aria-hidden="true" />{e}</p>)}
        </div>
    );
}
