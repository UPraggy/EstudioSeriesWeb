// GET /Saude — servidor vivo e se a chave do OpenRouter está configurada (nunca devolve a chave).
exports.REST = async (req, res) => {
    try {
        const chave = Boolean(process.env.ASE_OPENROUTER_KEY || process.env.OPENROUTER_API_KEY);
        return res.json({ ok: true, chaveOpenRouter: chave, dados: process.env.ESTUDIO_DADOS || 'E:\\EstudioSeriesDados' });
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ Error: error.message });
    }
};
