// POST /RenderizarEpisodio { serie, ep, motor?: "ffmpeg" | "narrador" } — monta o episódio a partir do edicao.json
// em episodios/epNN/saida/. Responde na hora; o andamento sai em StatusRender.
const { responder, exigir } = require('../edicao/http');
const render = require('../edicao/render');

exports.REST = responder(async (d) => {
    exigir(d, 'serie', 'ep');
    return render.renderizar({ serie: d.serie, ep: d.ep, motor: d.motor || 'ffmpeg' });
});
