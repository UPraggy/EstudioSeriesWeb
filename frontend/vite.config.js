import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import motorNavegador from './vite-plugin-motor.js';

// Dois destinos:
//  - padrão (npm run dev / build): o Vite (5190) repassa /api para o backend Express (4190) da mesma máquina.
//  - "pages" (npm run build:pages / dev:pages): site estático para o GitHub Pages. Caminhos relativos (serve em
//    qualquer /<repositório>/), rotas com # (HashRouter, recarregar não dá 404) e o MOTOR DO NAVEGADOR: o próprio
//    backend empacotado para rodar dentro do navegador (vite-plugin-motor.js, docs/MOTOR-NAVEGADOR.md). O Estúdio do
//    PC em http://127.0.0.1:4190 vira opção em Configurações.

// Política de segurança do site publicado (o Pages não deixa mandar cabeçalhos: vai por <meta>).
// connect-src limita para onde a página pode mandar dados: o OpenRouter (IA e login) e o Estúdio do PC (127.0.0.1).
// Se um dia o download do vídeo pronto vier de outro domínio, ele precisa entrar aqui (ver docs/MOTOR-NAVEGADOR.md).
const CSP = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "media-src 'self' blob: data:",
    "font-src 'self' data:",
    "connect-src 'self' https://openrouter.ai https://*.openrouter.ai http://127.0.0.1:* http://localhost:*",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
].join('; ');

export default defineConfig(({ mode, command }) => {
    const pages = mode === 'pages';
    return {
        base: pages ? './' : '/',
        plugins: [
            react(),
            motorNavegador(),
            // O Pages passa os arquivos pelo Jekyll; .nojekyll desliga isso (nomes com "_" deixariam de ser servidos).
            pages && {
                name: 'estudio-nojekyll',
                generateBundle() { this.emitFile({ type: 'asset', fileName: '.nojekyll', source: '' }); },
            },
            // CSP só no build (o servidor de desenvolvimento do Vite injeta scripts próprios).
            pages && command === 'build' && {
                name: 'estudio-csp',
                transformIndexHtml(html) {
                    return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
                },
            },
        ].filter(Boolean),
        build: pages ? { outDir: 'dist-pages', emptyOutDir: true } : undefined,
        server: {
            proxy: { '/api': { target: `http://127.0.0.1:${process.env.PORTA || 4190}`, changeOrigin: true } },
        },
    };
});
