// "Gerado fora": peças para levar um pedido do Estúdio para outra plataforma (Midjourney, Runway, Kling, Flow,
// ChatGPT...) e trazer o resultado de volta sem pagar aqui.
//  - copiar(texto, aviso) · baixar(url, nome) · lerBase64(arquivo)
//  - <BlocoPedido>: prompt (com "Copiar prompt"), dados (modelo, proporção...), imagens que vão junto (ver e baixar)
//    e "Copiar tudo (JSON)"
//  - <BotaoAnexar>: escolhe um arquivo (imagem ou vídeo), confere tipo e tamanho e entrega o File
import { useRef, useState } from 'react';
import { Ico } from './icones';
import { Girador, avisar } from './Movimento';
import '../../assets/css/PedidoExterno.css';

export const LIMITE_MB = { imagem: 25, video: 300 };
const ACEITA = { imagem: 'image/png,image/jpeg,image/webp', video: 'video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm' };

export async function copiar(texto, aviso = 'Copiado') {
    const t = String(texto ?? '');
    try {
        await navigator.clipboard.writeText(t);
    } catch {
        // sem permissão de área de transferência (http, iframe): o jeito antigo
        const area = document.createElement('textarea');
        area.value = t;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        try { document.execCommand('copy'); } catch { /* nada a fazer */ }
        area.remove();
    }
    avisar(aviso, 'ok', 2200);
}

// Baixa pelo fetch (o atributo download não vale entre portas diferentes do mesmo PC).
export async function baixar(url, nome) {
    try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const blob = await r.blob();
        const href = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = href;
        a.download = nome || 'arquivo';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(href), 4000);
    } catch (e) {
        avisar(`Não consegui baixar: ${e.message}`, 'erro', 4000);
    }
}

export function lerBase64(arquivo) {
    return new Promise((resolve, reject) => {
        const leitor = new FileReader();
        leitor.onload = () => resolve(String(leitor.result).replace(/^data:[^,]*,/, ''));
        leitor.onerror = () => reject(new Error('Não consegui ler o arquivo.'));
        leitor.readAsDataURL(arquivo);
    });
}

const nomeDe = (caminho) => String(caminho || '').split('/').pop() || 'imagem.png';

/**
 * Um pedido pronto para levar para fora.
 * props: titulo, prompt, dados [[rotulo, valor]], imagens [{ rotulo, url, nome }], json (objeto do "Copiar tudo"),
 *        rotuloPrompt ('Prompt'), extra (nó no rodapé, ex.: botão de anexar), compacto
 */
export function BlocoPedido({ titulo, prompt, dados = [], imagens = [], json, rotuloPrompt = 'Prompt', extra, compacto = false }) {
    const visiveis = dados.filter(([, v]) => v !== undefined && v !== null && v !== '');
    return (
        <section className={`pex${compacto ? ' compacto' : ''}`}>
            {titulo && <h3 className="pex-titulo">{titulo}</h3>}
            <div className="pex-prompt">
                <div className="pex-prompt-cab">
                    <span className="pex-rotulo">{rotuloPrompt}</span>
                    <button type="button" className="btn mini" onClick={() => copiar(prompt, 'Prompt copiado')} disabled={!prompt}>
                        <Ico.copiar aria-hidden="true" />Copiar prompt
                    </button>
                </div>
                <pre className="pex-texto">{prompt || 'Sem prompt.'}</pre>
            </div>
            {visiveis.length > 0 && (
                <dl className="pex-dados">
                    {visiveis.map(([k, v]) => (
                        <div key={k}><dt>{k}</dt><dd className="num">{String(v)}</dd></div>
                    ))}
                </dl>
            )}
            {imagens.length > 0 && (
                <div className="pex-imagens">
                    <span className="pex-rotulo">Imagens que vão junto</span>
                    <ul>
                        {imagens.map((im) => (
                            <li key={`${im.rotulo}-${im.url}`}>
                                <figure>
                                    {im.url ? <img src={im.url} alt={im.rotulo} loading="lazy" /> : <span className="pex-sem">sem arquivo</span>}
                                    <figcaption>{im.rotulo}</figcaption>
                                </figure>
                                {im.url && (
                                    <button type="button" className="btn mini fantasma" onClick={() => baixar(im.url, im.nome || nomeDe(im.url))} title={`Baixar ${im.nome || ''}`.trim()}>
                                        <Ico.baixar aria-hidden="true" />Baixar
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            <div className="pex-rodape">
                {json !== undefined && (
                    <button type="button" className="btn mini" onClick={() => copiar(JSON.stringify(json, null, 2), 'Pedido completo copiado (JSON)')}>
                        <Ico.json aria-hidden="true" />Copiar tudo (JSON)
                    </button>
                )}
                {extra}
            </div>
            {json !== undefined && (
                <details className="pex-json">
                    <summary>Ver o pedido completo (JSON)</summary>
                    <pre>{JSON.stringify(json, null, 2)}</pre>
                </details>
            )}
        </section>
    );
}

/**
 * Botão "Anexar …": abre o seletor, confere tipo e tamanho e chama onArquivo(File). Mostra o girador enquanto ocupado.
 * props: tipo ('imagem' | 'video'), rotulo, ocupado, disabled, onArquivo, classe ('btn mini'), titulo
 */
export function BotaoAnexar({ tipo = 'imagem', rotulo, ocupado = false, disabled = false, onArquivo, classe = 'btn mini', titulo }) {
    const ref = useRef(null);
    const [erro, setErro] = useState('');
    function escolher(e) {
        const arq = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!arq) return;
        const ehVideo = /^video\//.test(arq.type) || /\.(mp4|mov|webm)$/i.test(arq.name);
        const ehImagem = /^image\/(png|jpeg|webp)$/.test(arq.type) || /\.(png|jpe?g|webp)$/i.test(arq.name);
        if ((tipo === 'video' && !ehVideo) || (tipo === 'imagem' && !ehImagem)) {
            const msg = tipo === 'video' ? 'Escolha um vídeo MP4, MOV ou WEBM.' : 'Escolha uma imagem PNG, JPEG ou WEBP.';
            setErro(msg);
            avisar(msg, 'erro', 4000);
            return;
        }
        if (arq.size > LIMITE_MB[tipo] * 1024 * 1024) {
            const msg = `O arquivo tem ${Math.round(arq.size / 1024 / 1024)} MB; o limite é ${LIMITE_MB[tipo]} MB.`;
            setErro(msg);
            avisar(msg, 'erro', 4000);
            return;
        }
        setErro('');
        onArquivo(arq);
    }
    return (
        <>
            <input ref={ref} type="file" accept={ACEITA[tipo]} hidden onChange={escolher} />
            <button
                type="button"
                className={classe}
                onClick={() => ref.current && ref.current.click()}
                disabled={disabled || ocupado}
                aria-busy={ocupado}
                title={titulo || (erro || `Use um${tipo === 'video' ? ' vídeo' : 'a imagem'} gerado fora do Estúdio (sem custo aqui). Até ${LIMITE_MB[tipo]} MB.`)}
            >
                {ocupado ? <Girador /> : <Ico.anexarArquivo aria-hidden="true" />}
                <span>{rotulo || (tipo === 'video' ? 'Anexar vídeo' : 'Anexar imagem')}</span>
            </button>
        </>
    );
}
