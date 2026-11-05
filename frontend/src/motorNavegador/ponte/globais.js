// Injetado pelo esbuild em todo o pacote do backend: as referências livres a `process` e `Buffer`
// passam a usar estas versões (nunca as do Node nem variáveis globais da página).
import { processo } from '../estado.js';
import { Buffer } from '../buffer.js';

export { processo as process, Buffer };
