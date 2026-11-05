import { useState } from 'react';
import { Ico } from './subComponents/icones';
import { Expandir, Girador, motion, MOV } from './subComponents/Movimento';
import { procurarMotor, definirEndereco, enderecoAjudante } from './funcionalidades/motor';
import '../assets/css/SemMotor.css';

// Tela do site publicado (GitHub Pages) quando o Estúdio do PC não respondeu.
// Honesta: diz o que falta, como resolver e o que (ainda) não funciona sem o PC.
export default function SemMotor({ estado }) {
    const procurando = estado.modo === 'procurando';
    const [editando, setEditando] = useState(false);
    const [texto, setTexto] = useState(enderecoAjudante());
    const [erroCampo, setErroCampo] = useState('');

    function salvarEndereco(e) {
        e.preventDefault();
        const ok = definirEndereco(texto);
        if (!ok) { setErroCampo('Endereço inválido. Exemplo: 127.0.0.1:4190'); return; }
        setErroCampo('');
        setTexto(ok);
        setEditando(false);
        procurarMotor();
    }

    return (
        <main className="sem-motor">
            <motion.section
                className="sem-motor-cartao"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: MOV.base, ease: MOV.enfatico }}
                aria-labelledby="sem-motor-titulo"
            >
                <div className={`sem-motor-icone${procurando ? ' procurando' : ''}`} aria-hidden="true">
                    <Ico.computador />
                </div>
                <h1 id="sem-motor-titulo">{procurando ? 'Procurando o Estúdio do seu PC' : 'Conecte o Estúdio do seu PC'}</h1>
                <p className="sem-motor-lead">
                    Este site é a interface. O trabalho de verdade (as pastas das séries, as vozes, a IA e a montagem) roda no
                    Estúdio instalado no seu computador.
                </p>

                <p className={`sem-motor-estado ${procurando ? 'procurando' : 'falhou'}`} role="status" aria-live="polite">
                    {procurando ? <Girador /> : <Ico.desconectado aria-hidden="true" />}
                    <span>
                        {procurando ? 'Procurando em ' : `${estado.erro || 'Sem resposta.'} Endereço: `}
                        <code>{estado.endereco}</code>
                    </span>
                </p>

                <ol className="sem-motor-passos">
                    <li>No PC, abra o <strong>Abrir Estudio.vbs</strong> (ou o atalho "Estúdio de Séries" na Área de Trabalho).</li>
                    <li>Volte aqui e clique em <strong>Procurar de novo</strong>.</li>
                    <li>Se o navegador perguntar se este site pode <strong>acessar apps e serviços do seu dispositivo</strong>, escolha Permitir.</li>
                </ol>

                <div className="sem-motor-acoes">
                    <button type="button" className="btn primario" onClick={() => procurarMotor()} disabled={procurando} aria-busy={procurando}>
                        {procurando && <Girador />}
                        <Ico.regerar className="ico-girar" aria-hidden="true" />
                        Procurar de novo
                    </button>
                    <button type="button" className="btn fantasma" aria-expanded={editando} onClick={() => setEditando((v) => !v)}>
                        <Ico.config aria-hidden="true" />
                        Mudar endereço
                    </button>
                </div>

                <Expandir aberto={editando}>
                    <form className="sem-motor-endereco" onSubmit={salvarEndereco}>
                        <label className="campo">
                            <span>Endereço do Estúdio</span>
                            <input value={texto} onChange={(e) => setTexto(e.target.value)} spellCheck={false} placeholder="127.0.0.1:4190" />
                            <small>Padrão: 127.0.0.1:4190. Fica salvo só neste navegador.</small>
                        </label>
                        {erroCampo && <p className="nota-erro"><Ico.erro aria-hidden="true" />{erroCampo}</p>}
                        <button type="submit" className="btn"><Ico.confirmar aria-hidden="true" />Salvar e procurar</button>
                    </form>
                </Expandir>

                <div className="sem-motor-limites">
                    <h2><Ico.info aria-hidden="true" />O que funciona sem o PC</h2>
                    <p>
                        Por enquanto, nada. O motor que roda dentro do navegador (séries guardadas no próprio navegador, IA com a
                        sua chave, vozes e montagem) é a próxima etapa do plano.
                    </p>
                    <p>
                        No celular, o site ainda não alcança o Estúdio do PC: por enquanto, use pelo computador.
                    </p>
                </div>
            </motion.section>
        </main>
    );
}
