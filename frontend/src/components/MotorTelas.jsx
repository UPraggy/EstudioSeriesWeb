import { Ico } from './subComponents/icones';
import { Girador, motion, MOV } from './subComponents/Movimento';
import { procurarMotor, reabrirPasta, trocarMotor, usarNestaAba } from './funcionalidades/motor';
import '../assets/css/SemMotor.css';

// Telas de passagem do motor do navegador (site sem backend): abrindo as séries, pasta para reconfirmar e erro.
// Mesmo cartão da tela SemMotor (tema escuro, docs/GUIA-VISUAL.md).
function Cartao({ icone: Icone, titulo, children, girando = false }) {
    return (
        <main className="sem-motor">
            <motion.section
                className="sem-motor-cartao"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: MOV.base, ease: MOV.enfatico }}
                aria-labelledby="motor-titulo"
            >
                <div className={`sem-motor-icone${girando ? ' procurando' : ''}`} aria-hidden="true"><Icone /></div>
                <h1 id="motor-titulo">{titulo}</h1>
                {children}
            </motion.section>
        </main>
    );
}

export function MotorAbrindo({ estado }) {
    const pct = typeof estado.progresso === 'number' ? Math.round(estado.progresso * 100) : null;
    return (
        <Cartao icone={Ico.series} titulo="Abrindo o Estúdio" girando>
            <p className="sem-motor-lead">Tudo roda aqui no navegador: as séries, a IA com a sua chave e as gerações.</p>
            <p className="sem-motor-estado procurando" role="status" aria-live="polite">
                <Girador />
                <span>{estado.etapa || 'Preparando'}{pct !== null ? ` · ${pct}%` : ''}</span>
            </p>
            {pct !== null && (
                <div className="motor-barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Carregando as séries">
                    <span style={{ transform: `scaleX(${pct / 100})` }} />
                </div>
            )}
        </Cartao>
    );
}

export function MotorPermissao({ estado }) {
    return (
        <Cartao icone={Ico.pasta} titulo="Reabrir a pasta das séries">
            <p className="sem-motor-lead">
                As séries estão na pasta <code>{estado.pasta}</code> do seu computador. Por segurança, o navegador pede para você
                confirmar o acesso de novo a cada visita (se instalar o site como app, ele lembra sozinho).
            </p>
            <div className="sem-motor-acoes">
                <button type="button" className="btn primario" onClick={() => reabrirPasta()}>
                    <Ico.pasta aria-hidden="true" />
                    Reabrir a pasta
                </button>
            </div>
            <div className="sem-motor-limites">
                <p>Se preferir, troque para o armazenamento interno do navegador em Configurações (as séries da pasta continuam lá).</p>
            </div>
        </Cartao>
    );
}

export function MotorOutraAba({ estado }) {
    return (
        <Cartao icone={Ico.series} titulo="O Estúdio está aberto em outra aba">
            <p className="sem-motor-lead">
                {estado.tomada
                    ? 'Você abriu o Estúdio em outra aba ou janela. Esta parou para não gravar por cima do que foi feito lá.'
                    : 'Só uma aba por vez pode mexer nas séries (cada aba guarda uma cópia do índice na memória). Feche a outra ou continue aqui.'}
            </p>
            <div className="sem-motor-acoes">
                <button type="button" className="btn primario" onClick={() => usarNestaAba()}>
                    <Ico.confirmar aria-hidden="true" />
                    Usar nesta aba
                </button>
            </div>
            <div className="sem-motor-limites">
                <p>Ao usar aqui, a outra aba para e mostra este mesmo aviso. Nada que já foi salvo se perde.</p>
            </div>
        </Cartao>
    );
}

export function MotorErro({ estado }) {
    return (
        <Cartao icone={Ico.aviso} titulo="O Estúdio não abriu neste navegador">
            <p className="sem-motor-estado falhou" role="alert">
                <Ico.erro aria-hidden="true" />
                <span>{estado.erro}</span>
            </p>
            <ul className="sem-motor-passos">
                <li>Use o <strong>Chrome</strong> ou o <strong>Edge</strong> atualizados (no celular, o Chrome).</li>
                <li>Janela anônima pode bloquear o armazenamento do site: abra numa janela normal.</li>
                <li>Se o erro falar de "service worker", recarregue a página (F5).</li>
            </ul>
            <div className="sem-motor-acoes">
                <button type="button" className="btn primario" onClick={() => procurarMotor()}>
                    <Ico.regerar aria-hidden="true" />
                    Tentar de novo
                </button>
                <button type="button" className="btn fantasma" onClick={() => trocarMotor('ajudante')}>
                    <Ico.computador aria-hidden="true" />
                    Usar o Estúdio do PC
                </button>
            </div>
        </Cartao>
    );
}
