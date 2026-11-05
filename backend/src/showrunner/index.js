// Showrunner: prompts do Prompt Mestre 1 (docs/PROMPT-MESTRE-1.md) + validação de cada etapa.
const { executarEtapa, ETAPAS, MODELO_PADRAO } = require('./etapas');
const { extrairJson } = require('./json');
const validar = require('./validar');
const prompts = require('./prompts');
const precos = require('./precos');
const { obterChamarLLM, exigirChamarLLM } = require('./llm');

module.exports = { executarEtapa, ETAPAS, MODELO_PADRAO, extrairJson, validar, prompts, precos, obterChamarLLM, exigirChamarLLM };
