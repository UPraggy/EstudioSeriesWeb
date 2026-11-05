import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dois destinos:
//  - padrão (npm run dev / build): o Vite (5190) repassa /api para o backend Express (4190) da mesma máquina.
//  - "pages" (npm run build:pages): site estático para o GitHub Pages. Caminhos relativos (serve em qualquer
//    /<repositório>/), rotas com # (HashRouter, recarregar não dá 404) e o motor híbrido procura o Estúdio do PC
//    em http://127.0.0.1:4190 (ver src/components/funcionalidades/motor.js e docs/PUBLICAR-NO-PAGES.md).
export default defineConfig(({ mode }) => {
    const pages = mode === 'pages';
    return {
        base: pages ? './' : '/',
        plugins: [
            react(),
            // O Pages passa os arquivos pelo Jekyll; .nojekyll desliga isso (nomes com "_" deixariam de ser servidos).
            pages && {
                name: 'estudio-nojekyll',
                generateBundle() { this.emitFile({ type: 'asset', fileName: '.nojekyll', source: '' }); },
            },
        ].filter(Boolean),
        build: pages ? { outDir: 'dist-pages', emptyOutDir: true } : undefined,
        server: {
            proxy: { '/api': { target: `http://127.0.0.1:${process.env.PORTA || 4190}`, changeOrigin: true } },
        },
    };
});
