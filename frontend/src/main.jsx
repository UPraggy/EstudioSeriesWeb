import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource/courier-prime/400.css';
import '@fontsource/courier-prime/700.css';
import App from './App';

// Site publicado aberto por http:// (o Cloudflare de rafaelmr.com.br não redireciona sozinho): vai para https://.
// Sem https o navegador não deixa o motor do navegador funcionar (service worker, OPFS e login do OpenRouter).
const LOCAIS = ['localhost', '127.0.0.1', '[::1]'];
const irParaHttps = import.meta.env.VITE_DESTINO === 'pages'
    && window.location.protocol === 'http:'
    && !LOCAIS.includes(window.location.hostname);

if (irParaHttps) {
    window.location.replace(`https://${window.location.host}${window.location.pathname}${window.location.search}${window.location.hash}`);
} else {
    createRoot(document.getElementById('root')).render(
        <React.StrictMode>
            <App />
        </React.StrictMode>
    );
}
