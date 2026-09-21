const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { PDFParse } = require('pdf-parse');
const { generarPreguntas } = require('./generador');

const app = express();
const PORT = process.env.PORT || 3000;
const TEMARIO_DIR = path.join(__dirname, 'Temario');

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname)));

// ---------------- TEMARIO (lectura de Temario/Bloque .../Tema ...) ----------------

function listTemas() {
  if (!fs.existsSync(TEMARIO_DIR)) return [];
  var bloques = fs.readdirSync(TEMARIO_DIR, { withFileTypes: true })
    .filter(function (d) { return d.isDirectory() && d.name.indexOf('.') !== 0; })
    .sort(function (a, b) { return a.name.localeCompare(b.name, 'es'); });

  var temas = [];
  bloques.forEach(function (bloqueDir) {
    var bloquePath = path.join(TEMARIO_DIR, bloqueDir.name);
    var temaDirs = fs.readdirSync(bloquePath, { withFileTypes: true })
      .filter(function (d) { return d.isDirectory() && d.name.indexOf('.') !== 0; })
      .sort(function (a, b) { return a.name.localeCompare(b.name, 'es'); });

    temaDirs.forEach(function (temaDir) {
      var temaPath = path.join(bloquePath, temaDir.name);
      var pdfFiles = fs.readdirSync(temaPath).filter(function (f) { return f.toLowerCase().endsWith('.pdf'); });
      temas.push({
        id: bloqueDir.name + '/' + temaDir.name,
        bloque: bloqueDir.name,
        nombre: temaDir.name,
        numPdfs: pdfFiles.length
      });
    });
  });
  return temas;
}

function resolveTemaPath(temaId) {
  var temaPath = path.resolve(path.join(TEMARIO_DIR, temaId));
  var base = path.resolve(TEMARIO_DIR) + path.sep;
  if (temaPath.indexOf(base) !== 0) throw new Error('invalid_tema');
  return temaPath;
}

var textCache = new Map(); // temaId -> { mtimeKey, text }

async function getTemaText(temaId) {
  var temaPath = resolveTemaPath(temaId);
  var pdfFiles = fs.readdirSync(temaPath).filter(function (f) { return f.toLowerCase().endsWith('.pdf'); });
  var mtimeKey = pdfFiles.map(function (f) {
    var st = fs.statSync(path.join(temaPath, f));
    return f + ':' + st.mtimeMs;
  }).join('|');

  var cached = textCache.get(temaId);
  if (cached && cached.mtimeKey === mtimeKey) return cached.text;

  var combined = '';
  for (var i = 0; i < pdfFiles.length; i++) {
    var f = pdfFiles[i];
    var buf = fs.readFileSync(path.join(temaPath, f));
    try {
      var parser = new PDFParse({ data: buf });
      var result = await parser.getText();
      await parser.destroy();
      combined += '\n\n--- ' + f + ' ---\n' + result.text;
    } catch (e) {
      combined += '\n\n--- ' + f + ' (no se pudo leer este PDF) ---\n';
    }
  }
  textCache.set(temaId, { mtimeKey: mtimeKey, text: combined });
  return combined;
}

app.get('/api/temario', function (req, res) {
  try {
    res.json({ temas: listTemas() });
  } catch (e) {
    res.status(500).json({ error: 'temario_error' });
  }
});

// ---------------- GENERAR EXAMEN (sin IA, a partir del propio temario) ----------------

var DIFICULTADES_VALIDAS = { facil: 1, media: 1, dificil: 1 };

app.post('/api/examenes/generar', async function (req, res) {
  var body = req.body || {};
  var modo = body.modo;
  var temaIds = Array.isArray(body.temaIds) ? body.temaIds : [];
  var dificultad = DIFICULTADES_VALIDAS[body.dificultad] ? body.dificultad : 'media';
  var numPreguntas = Math.max(5, Math.min(60, parseInt(body.numPreguntas, 10) || 21));

  if (modo !== 'tema' && modo !== 'global') {
    return res.status(400).json({ error: 'invalid_request' });
  }

  var todas = listTemas();
  var seleccionadas;
  if (modo === 'tema') {
    if (temaIds.length !== 1) return res.status(400).json({ error: 'invalid_request' });
    seleccionadas = todas.filter(function (t) { return t.id === temaIds[0]; });
  } else {
    seleccionadas = temaIds.length ? todas.filter(function (t) { return temaIds.indexOf(t.id) !== -1; }) : todas;
  }
  seleccionadas = seleccionadas.filter(function (t) { return t.numPdfs > 0; });

  if (!seleccionadas.length) {
    return res.status(400).json({ error: 'sin_contenido' });
  }

  var items = [];
  for (var i = 0; i < seleccionadas.length; i++) {
    var t = seleccionadas[i];
    var text;
    try {
      text = await getTemaText(t.id);
    } catch (e) {
      continue;
    }
    if (text && text.trim()) items.push({ nombre: t.nombre, bloque: t.bloque, text: text });
  }

  if (!items.length) {
    return res.status(400).json({ error: 'sin_contenido' });
  }

  var preguntas = generarPreguntas(items, numPreguntas, dificultad);
  if (!preguntas.length) {
    return res.status(400).json({ error: 'sin_preguntas' });
  }

  res.json({ questions: preguntas, generadas: preguntas.length, solicitadas: numPreguntas });
});

app.listen(PORT, function () {
  console.log('OpoTest backend escuchando en http://localhost:' + PORT);
});
