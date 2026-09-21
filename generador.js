// Generador de preguntas tipo test sin IA: extrae huecos rellenables
// (numeros y frases propias) del texto de los temas y construye
// distractores a partir del propio contenido del temario.

var CONECTORES = { de: 1, del: 1, la: 1, las: 1, los: 1, y: 1 };
var MARCADOR = '_____';

function shuffle(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

function limpiarTexto(raw) {
  var lines = raw.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
  var freq = {};
  lines.forEach(function (l) { freq[l] = (freq[l] || 0) + 1; });
  var kept = lines.filter(function (l) {
    if (freq[l] >= 3 && l.length < 220) return false; // cabeceras/pies repetidos
    if (/^www\./i.test(l)) return false;
    if (/derechos reservados/i.test(l)) return false;
    if (/^\d+$/.test(l)) return false; // numeros de pagina sueltos
    if (/^---.*---$/.test(l)) return false; // separadores internos
    return true;
  });
  return kept.join(' ');
}

function dividirFrases(text) {
  var normalizado = text.replace(/\s+/g, ' ').trim();
  var frases = normalizado.match(/[^.!?]+[.!?]+(?=\s|$)/g) || [];
  return frases.map(function (f) { return f.trim(); })
    .filter(function (f) { return f.length >= 50 && f.length <= 280 && /[a-záéíóúñ]/i.test(f); });
}

var TITLE_CASE_RE = /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+$/;

function extraerCandidatos(frase) {
  var tokens = [];
  var re = /[A-Za-zÁÉÍÓÚÑáéíóúñ]+|\d+(?:[.,]\d+)?/g;
  var m;
  while ((m = re.exec(frase))) tokens.push({ text: m[0], index: m.index });

  var candidatos = [];
  for (var i = 0; i < tokens.length; i++) {
    var tok = tokens[i];
    if (/^\d/.test(tok.text)) {
      candidatos.push({ tipo: 'numero', valor: tok.text });
      continue;
    }
    // solo palabras en "Formato Título" (mayúscula inicial + minúsculas):
    // descarta MAYÚSCULAS SOSTENIDAS de titulares/artículos y letras sueltas ("D", "b")
    if (!TITLE_CASE_RE.test(tok.text)) continue;

    var j = i + 1;
    var palabras = [tok.text];
    while (j < tokens.length) {
      var t2 = tokens[j];
      if (TITLE_CASE_RE.test(t2.text)) { palabras.push(t2.text); j++; continue; }
      if (CONECTORES[t2.text.toLowerCase()] && j + 1 < tokens.length && TITLE_CASE_RE.test(tokens[j + 1].text)) {
        palabras.push(t2.text); palabras.push(tokens[j + 1].text); j += 2; continue;
      }
      break;
    }
    if (palabras.length >= 2 || i > 0) {
      candidatos.push({ tipo: 'propio', valor: palabras.join(' ') });
    }
    i = j - 1;
  }
  return candidatos;
}

function extraerPalabraLarga(frase) {
  var m = frase.match(/\b[a-záéíóúñ]{8,}\b/g);
  if (!m || !m.length) return null;
  m.sort(function (a, b) { return b.length - a.length; });
  var top = m.slice(0, 3);
  return top[Math.floor(Math.random() * top.length)];
}

function reemplazarPrimera(frase, valor, marcador) {
  var idx = frase.indexOf(valor);
  if (idx === -1) return null;
  return frase.slice(0, idx) + marcador + frase.slice(idx + valor.length);
}

function construirPools(frases) {
  var numeros = new Set();
  var propios = new Set();
  var palabras = new Set();
  frases.forEach(function (f) {
    extraerCandidatos(f).forEach(function (c) {
      if (c.tipo === 'numero') numeros.add(c.valor);
      else propios.add(c.valor);
    });
    var largas = f.match(/\b[a-záéíóúñ]{8,}\b/g) || [];
    largas.forEach(function (w) { palabras.add(w); });
  });
  return { numeros: Array.from(numeros), propios: Array.from(propios), palabras: Array.from(palabras) };
}

function generarDistractoresNumero(correcto, pool, dificultad) {
  var num = parseFloat(correcto.replace(',', '.'));
  var vistos = new Set([correcto]);
  var resultado = [];

  var delPool = shuffle(pool.filter(function (v) { return v !== correcto; }));
  if (dificultad === 'facil') {
    // preferir del pool valores bien distintos en magnitud
    delPool = delPool.filter(function (v) {
      var n = parseFloat(v.replace(',', '.'));
      return Math.abs(n - num) >= Math.max(3, num * 0.3);
    }).concat(delPool);
  } else if (dificultad === 'dificil') {
    delPool = delPool.filter(function (v) {
      var n = parseFloat(v.replace(',', '.'));
      return Math.abs(n - num) <= Math.max(3, num * 0.3) && v !== correcto;
    }).concat(delPool);
  }
  for (var i = 0; i < delPool.length && resultado.length < 3; i++) {
    if (!vistos.has(delPool[i])) { resultado.push(delPool[i]); vistos.add(delPool[i]); }
  }

  var deltas = dificultad === 'facil' ? [Math.max(8, Math.round(num * 0.6)), -Math.max(8, Math.round(num * 0.5)), Math.max(15, Math.round(num * 1.2))]
    : dificultad === 'dificil' ? [1, -1, 2]
    : [3, -2, 5];

  var di = 0;
  while (resultado.length < 3 && di < deltas.length) {
    var val = Math.round(num + deltas[di]);
    if (val < 0) val = Math.abs(val) + 1;
    var s = String(val);
    if (!vistos.has(s)) { resultado.push(s); vistos.add(s); }
    di++;
  }
  var guard = 0;
  while (resultado.length < 3 && guard < 25) {
    var val2 = Math.max(0, Math.round(num + (Math.random() * 20 - 10)));
    var s2 = String(val2);
    if (!vistos.has(s2)) { resultado.push(s2); vistos.add(s2); }
    guard++;
  }
  return resultado.slice(0, 3);
}

function solapamiento(a, b) {
  var pa = a.toLowerCase().split(' ');
  var pb = b.toLowerCase().split(' ');
  return pb.filter(function (w) { return pa.indexOf(w) !== -1; }).length;
}

function generarDistractoresTexto(correcto, pool, dificultad) {
  var otras = pool.filter(function (v) { return v.toLowerCase() !== correcto.toLowerCase(); });
  if (dificultad === 'dificil') {
    otras = otras.slice().sort(function (a, b) { return solapamiento(correcto, b) - solapamiento(correcto, a); });
    otras = otras.slice(0, Math.max(10, Math.ceil(otras.length * 0.4)));
    otras = shuffle(otras);
  } else if (dificultad === 'facil') {
    otras = shuffle(otras).sort(function (a, b) { return solapamiento(correcto, a) - solapamiento(correcto, b); });
  } else {
    otras = shuffle(otras);
  }
  var vistos = new Set([correcto.toLowerCase()]);
  var resultado = [];
  for (var i = 0; i < otras.length && resultado.length < 3; i++) {
    var key = otras[i].toLowerCase();
    if (!vistos.has(key)) { resultado.push(otras[i]); vistos.add(key); }
  }
  return resultado;
}

function generarPreguntas(items, numPreguntas, dificultad) {
  var todasFrases = [];
  items.forEach(function (it) {
    var limpio = limpiarTexto(it.text);
    dividirFrases(limpio).forEach(function (f) {
      todasFrases.push({ frase: f, tema: it.nombre });
    });
  });
  if (!todasFrases.length) return [];

  var pools = construirPools(todasFrases.map(function (x) { return x.frase; }));
  var barajadas = shuffle(todasFrases);
  var preguntas = [];
  var frasesUsadas = new Set();

  for (var i = 0; i < barajadas.length && preguntas.length < numPreguntas; i++) {
    var item = barajadas[i];
    if (frasesUsadas.has(item.frase)) continue;

    var candidatos = extraerCandidatos(item.frase);
    if (!candidatos.length) {
      var palabra = extraerPalabraLarga(item.frase);
      if (!palabra) continue;
      candidatos = [{ tipo: 'palabra', valor: palabra }];
    }
    candidatos = shuffle(candidatos);

    var pregunta = null;
    for (var c = 0; c < candidatos.length && !pregunta; c++) {
      var cand = candidatos[c];
      var distractores;
      if (cand.tipo === 'numero') distractores = generarDistractoresNumero(cand.valor, pools.numeros, dificultad);
      else if (cand.tipo === 'propio') distractores = generarDistractoresTexto(cand.valor, pools.propios, dificultad);
      else distractores = generarDistractoresTexto(cand.valor, pools.palabras, dificultad);

      if (!distractores || distractores.length < 3) continue;

      var textoHueco = reemplazarPrimera(item.frase, cand.valor, MARCADOR);
      if (!textoHueco) continue;

      pregunta = {
        question: textoHueco + ' ¿Qué opción completa correctamente el hueco?',
        options: [cand.valor].concat(distractores.slice(0, 3)),
        correctIndex: 0,
        tema: item.tema
      };
    }
    if (pregunta) {
      preguntas.push(pregunta);
      frasesUsadas.add(item.frase);
    }
  }
  return preguntas;
}

module.exports = { generarPreguntas: generarPreguntas };
