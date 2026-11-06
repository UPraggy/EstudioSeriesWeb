import { useEffect, useState } from 'react';
import Dialogo from '../subComponents/Dialogo';
import { Ico } from '../subComponents/icones';
import { Girador, avisar } from '../subComponents/Movimento';
import { SalvarIdeiaSerie } from '../funcionalidades/bancoGet';
import { erroDe } from '../funcionalidades/fetchFunc';

// Edita a ideia da série (o texto livre, pode ser um prompt inteiro) que o showrunner usa para gerar a bíblia.
const MAX = 20000;

export default function EditarIdeia({ aberto, serieId, ideia = '', onFechar, onSalvo }) {
    const [texto, setTexto] = useState(ideia);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState('');
    useEffect(() => { if (aberto) { setTexto(ideia); setErro(''); } }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

    async function salvar() {
        setSalvando(true);
        const r = await SalvarIdeiaSerie({ serie: serieId, ideia: texto });
        setSalvando(false);
        if (erroDe(r)) { setErro(erroDe(r)); return; }
        avisar('Ideia da série salva');
        onSalvo && onSalvo(r.ideia);
        onFechar();
    }

    return (
        <Dialogo
            aberto={aberto}
            id="dlg-ideia"
            icone={Ico.showrunner}
            titulo="Ideia da série"
            descricao="O texto que o showrunner usa para gerar a bíblia (premissa, personagens, regras e o mapa dos episódios). Pode colar o prompt inteiro."
            largura={720}
            onFechar={onFechar}
            travado={salvando}
            rodape={(
                <>
                    <span className="dlg-rodape-esq num">{texto.length.toLocaleString('pt-BR')} de {MAX.toLocaleString('pt-BR')} caracteres</span>
                    <button type="button" className="btn" onClick={onFechar} disabled={salvando} data-foco>Cancelar</button>
                    <button type="button" className="btn primario" onClick={salvar} disabled={salvando || !texto.trim() || texto === ideia} aria-busy={salvando}>
                        {salvando && <Girador />}<Ico.salvar aria-hidden="true" />Salvar ideia
                    </button>
                </>
            )}
        >
            {erro && <p className="nota-erro" role="alert"><Ico.erro aria-hidden="true" /><span>{erro}</span></p>}
            <label className="campo">
                <span>Ideia</span>
                <textarea rows={16} value={texto} maxLength={MAX} onChange={(e) => setTexto(e.target.value)} />
                <small>Depois de salvar, rode "Gerar bíblia e mapa" de novo e aprove a proposta para a história valer.</small>
            </label>
        </Dialogo>
    );
}
