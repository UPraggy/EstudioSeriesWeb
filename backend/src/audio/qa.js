// QA de pronúncia: chama o qa_pronuncia.py existente (Whisper offline, CPU) por meio do fala_cli.py.
// Nota = parecença entre o texto escrito e o que o Whisper ouviu (0–1); < 0,9 = revisar.
// Pega palavra trocada/engolida, NÃO sotaque. O Whisper erra falas curtas e escreve números ("45"): olhe as trocas.
const fs = require('fs');
const path = require('path');
const { chamarFalaCli } = require('./motor');
const { lerFalasEpisodio } = require('./falas');

const NOTA_MINIMA = 0.9;

async function testarPronuncia({ arquivo, texto, modelo = 'small', minimo = NOTA_MINIMA }, { executor = chamarFalaCli } = {}) {
    if (!arquivo || !fs.existsSync(arquivo)) throw new Error(`Arquivo da fala não encontrado: ${arquivo}`);
    if (!texto) throw new Error('Informe o texto escrito da fala');
    const r = await executor({ acao: 'qa', arquivo, texto, modelo });
    return { nota: r.nota, revisar: r.nota < minimo, minimo, ouvido: r.ouvido, trocas: r.trocas || [], modelo };
}

// QA de uma fala já gerada do episódio (pelo id, ex.: "p03-f01"), comparando com o texto EXIBIDO.
async function testarFalaDoEpisodio(serie, episodio, id, opcoes = {}, deps = {}) {
    const { doc, pastaSerie } = lerFalasEpisodio(serie, episodio);
    const fala = (doc.falas || []).find((f) => f.id === id);
    if (!fala) throw new Error(`Fala ${id} não existe em falas.json`);
    if (!fala.arquivo) throw new Error(`Fala ${id} ainda não tem áudio (status: ${fala.status})`);
    const r = await testarPronuncia({ ...opcoes, arquivo: path.join(pastaSerie, fala.arquivo), texto: fala.textoExibido }, deps);
    return { id, quem: fala.quem, voz: fala.voz, intencao: fala.intencao, texto: fala.textoExibido, ...r };
}

module.exports = { testarPronuncia, testarFalaDoEpisodio, NOTA_MINIMA };
