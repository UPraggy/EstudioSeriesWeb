// Rotas do Express: POST /<NomeRota> e GET /<NomeRota>. O mapa fica em controllersMapa.js
// (o motor do navegador usa o mesmo mapa, sem o Express).
const express = require('express');
const { controllers, controllersGet, controllersBinarios } = require('./controllersMapa');

const routes = express.Router();

// AnexarVideoTrecho aceita JSON (base64) ou o corpo binário do vídeo (até 300 MB, metadados na query).
// Vem antes do mapa: o leitor binário precisa rodar antes do controller.
routes.post('/AnexarVideoTrecho', express.raw({ type: ['application/octet-stream', 'video/*'], limit: '300mb' }), controllersBinarios.AnexarVideoTrecho.REST);

Object.keys(controllers).forEach((rota) => routes.post(`/${rota}`, controllers[rota].REST));
Object.keys(controllersGet).forEach((rota) => routes.get(`/${rota}`, controllersGet[rota].REST));

module.exports = routes;
