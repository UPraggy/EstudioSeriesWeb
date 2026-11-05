// Rotas do Express: POST /<NomeRota> e GET /<NomeRota>. O mapa fica em controllersMapa.js
// (o motor do navegador usa o mesmo mapa, sem o Express).
const routes = require('express').Router();
const { controllers, controllersGet } = require('./controllersMapa');

Object.keys(controllers).forEach((rota) => routes.post(`/${rota}`, controllers[rota].REST));
Object.keys(controllersGet).forEach((rota) => routes.get(`/${rota}`, controllersGet[rota].REST));

module.exports = routes;
