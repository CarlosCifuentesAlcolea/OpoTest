(function () {
  var API_BASE = 'http://localhost:3000';
  var STORAGE_HISTORIAL = 'opotest-historial';

  var temario = []; // [{id, bloque, nombre, numPdfs}]
  var backendOnline = false;
  var currentTemaId = null; // null => ámbito global
  var config = { dificultad: 'media', numPreguntas: 21 };

  var seccion = 'examen'; // examen | estadisticas
  var view = 'config'; // config | quiz | resultado
  var exam = null; // {questions:[{question,options,correctIndex,tema}], modo}
  var quiz = null; // {pos, answered, selected, optionOrder, correctCount, respuestas:[], guardado}
  var historial = []; // [{fecha, modo, ambito, dificultad, total, correctas, porTema}]

  var mainEl = document.getElementById('main');
  var listEl = document.getElementById('tema-list');
  var fileRefEl = document.getElementById('file-ref');

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function getTema(id) { return temario.find(function (t) { return t.id === id; }); }
  function temasConContenido() { return temario.filter(function (t) { return t.numPdfs > 0; }); }

  function formatearFecha(iso) {
    try {
      return new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return iso; }
  }

  // ---------------- HISTORIAL (localStorage) ----------------

  function cargarHistorial() {
    try {
      var raw = window.localStorage.getItem(STORAGE_HISTORIAL);
      historial = raw ? JSON.parse(raw) : [];
    } catch (e) {
      historial = [];
    }
  }

  function persistirHistorial() {
    try {
      window.localStorage.setItem(STORAGE_HISTORIAL, JSON.stringify(historial));
    } catch (e) {
      // almacenamiento lleno o bloqueado: el historial de esta sesión no se conservará
    }
  }

  function guardarIntento() {
    var porTema = {};
    quiz.respuestas.forEach(function (r) {
      var key = r.tema || 'General';
      if (!porTema[key]) porTema[key] = { correctas: 0, total: 0 };
      porTema[key].total += 1;
      if (r.correct) porTema[key].correctas += 1;
    });
    var ambito = exam.modo === 'tema'
      ? ((exam.questions[0] && exam.questions[0].tema) || 'Tema')
      : 'Examen global';
    historial.push({
      fecha: new Date().toISOString(),
      modo: exam.modo,
      ambito: ambito,
      dificultad: config.dificultad,
      total: exam.questions.length,
      correctas: quiz.correctCount,
      porTema: porTema
    });
    persistirHistorial();
  }

  // ---------------- CARGA DEL TEMARIO ----------------

  async function cargarTemario() {
    try {
      var res = await fetch(API_BASE + '/api/temario');
      if (!res.ok) throw new Error('bad_status');
      var body = await res.json();
      temario = Array.isArray(body.temas) ? body.temas : [];
      backendOnline = true;
    } catch (e) {
      temario = [];
      backendOnline = false;
    }
    var conContenido = temasConContenido().length;
    fileRefEl.textContent = backendOnline
      ? (temario.length ? (conContenido + '/' + temario.length + ' TEMAS CON CONTENIDO') : 'TEMARIO VACÍO')
      : 'SIN CONEXIÓN CON EL BACKEND';
    render();
  }

  // ---------------- CLAUDE (backend) ----------------

  async function generarExamen(modo, temaIds, dificultad, numPreguntas) {
    var res;
    try {
      res = await fetch(API_BASE + '/api/examenes/generar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modo: modo, temaIds: temaIds, dificultad: dificultad, numPreguntas: numPreguntas })
      });
    } catch (e) {
      throw { code: 'network_error' };
    }

    var body = null;
    try { body = await res.json(); } catch (e) { body = null; }

    if (!res.ok) {
      throw { code: (body && body.error) || 'api_error' };
    }
    if (!body || !Array.isArray(body.questions)) {
      throw { code: 'invalid_json' };
    }
    return { questions: body.questions, generadas: body.generadas || body.questions.length, solicitadas: body.solicitadas || body.questions.length };
  }

  function init() {
    cargarHistorial();
    cargarTemario();
  }

  // ---------------- RENDER ----------------

  function render() {
    document.getElementById('tab-examen').className = 'tab-btn' + (seccion === 'examen' ? ' active' : '');
    document.getElementById('tab-estadisticas').className = 'tab-btn' + (seccion === 'estadisticas' ? ' active' : '');
    renderSidebar();
    if (seccion === 'estadisticas') { renderEstadisticas(); return; }
    if (view === 'config') renderConfig();
    else if (view === 'quiz') renderQuiz();
    else if (view === 'resultado') renderResultado();
  }

  function renderSidebar() {
    listEl.innerHTML = '';

    var global = document.createElement('button');
    global.className = 'tema-item' + (currentTemaId === null && seccion === 'examen' ? ' active' : '');
    global.innerHTML = 'Examen global<span class="meta">' + temasConContenido().length + ' temas con contenido</span>';
    global.onclick = function () { currentTemaId = null; seccion = 'examen'; view = 'config'; render(); };
    listEl.appendChild(global);

    if (!temario.length) {
      var d = document.createElement('div');
      d.style.cssText = 'padding:10px 18px;font-size:12.5px;color:var(--ink-soft)';
      d.textContent = backendOnline ? 'No se han encontrado temas en la carpeta Temario.' : 'No se ha podido conectar con el backend.';
      listEl.appendChild(d);
      return;
    }

    var bloques = [];
    temario.forEach(function (t) {
      if (bloques.indexOf(t.bloque) === -1) bloques.push(t.bloque);
    });

    bloques.forEach(function (bloque) {
      var label = document.createElement('div');
      label.className = 'bloque-label';
      label.textContent = bloque;
      listEl.appendChild(label);

      temario.filter(function (t) { return t.bloque === bloque; }).forEach(function (t) {
        var btn = document.createElement('button');
        var sinContenido = t.numPdfs === 0;
        btn.className = 'tema-item' + (t.id === currentTemaId && seccion === 'examen' ? ' active' : '') + (sinContenido ? ' sin-contenido' : '');
        btn.innerHTML = escapeHtml(t.nombre) + '<span class="meta">' + (sinContenido ? 'sin PDFs todavía' : (t.numPdfs + ' PDF' + (t.numPdfs > 1 ? 's' : ''))) + '</span>';
        btn.onclick = function () { currentTemaId = t.id; seccion = 'examen'; view = 'config'; render(); };
        listEl.appendChild(btn);
      });
    });
  }

  function renderConfig() {
    var tema = currentTemaId ? getTema(currentTemaId) : null;
    var modo = tema ? 'tema' : 'global';
    var disponible = tema ? tema.numPdfs > 0 : temasConContenido().length > 0;

    var titulo = tema ? escapeHtml(tema.nombre) : 'Examen global';
    var subtitulo = tema ? escapeHtml(tema.bloque) : 'Preguntas repartidas entre todos los temas que ya tienen contenido';

    var html = '<h2 class="serif" style="margin-top:0">' + titulo + '</h2>' +
      '<div style="color:var(--ink-soft);font-size:13.5px;margin-top:-10px;margin-bottom:18px">' + subtitulo + '</div>';

    if (!backendOnline) {
      html += '<div class="banner error">No se ha podido conectar con el backend en ' + API_BASE + '. Arráncalo con <code>npm start</code> y recarga la página.</div>';
    } else if (!disponible) {
      html += '<div class="banner error">' + (tema
        ? 'Este tema todavía no tiene PDFs en su carpeta dentro de Temario/. Añade "Contenido.pdf" u otros PDFs y pulsa "↻ Actualizar temario".'
        : 'Ningún tema tiene todavía PDFs en la carpeta Temario/. Añade contenido y pulsa "↻ Actualizar temario".') + '</div>';
    }

    html +=
      '<div class="field">' +
      '<label>Dificultad</label>' +
      '<div class="choice-group" id="grp-dificultad">' +
      ['facil', 'media', 'dificil'].map(function (d) {
        var nombres = { facil: 'Fácil', media: 'Media', dificil: 'Difícil' };
        return '<button type="button" class="choice-btn' + (config.dificultad === d ? ' active' : '') + '" data-val="' + d + '">' + nombres[d] + '</button>';
      }).join('') +
      '</div>' +
      '</div>' +
      '<div class="field">' +
      '<label>Número de preguntas</label>' +
      '<input type="text" inputmode="numeric" class="num-input" id="in-num-preguntas" value="' + config.numPreguntas + '">' +
      '</div>' +
      '<div id="gen-banner"></div>' +
      '<div class="actions-row" style="margin-top:10px">' +
      '<button class="btn" id="btn-generar-examen"' + (disponible && backendOnline ? '' : ' disabled') + '>Generar examen (' + config.numPreguntas + ' preguntas)</button>' +
      '</div>';

    mainEl.innerHTML = html;

    Array.prototype.forEach.call(document.querySelectorAll('#grp-dificultad .choice-btn'), function (btn) {
      btn.onclick = function () { config.dificultad = btn.getAttribute('data-val'); render(); };
    });

    var numInput = document.getElementById('in-num-preguntas');
    numInput.onchange = function () {
      var n = parseInt(numInput.value, 10);
      if (!n || n < 5) n = 5;
      if (n > 60) n = 60;
      config.numPreguntas = n;
      render();
    };

    var btnGenerar = document.getElementById('btn-generar-examen');
    if (btnGenerar) {
      btnGenerar.onclick = function () { lanzarGeneracionExamen(modo, tema); };
    }
  }

  async function lanzarGeneracionExamen(modo, tema) {
    var banner = document.getElementById('gen-banner');
    var btn = document.getElementById('btn-generar-examen');
    btn.disabled = true;
    banner.innerHTML = '<div class="banner"><span class="spinner-text">Generando examen de ' + config.numPreguntas + ' preguntas (' + config.dificultad + ')… puede tardar un momento.</span></div>';

    var temaIds = modo === 'tema' ? [tema.id] : [];

    try {
      var resultado = await generarExamen(modo, temaIds, config.dificultad, config.numPreguntas);
      var aviso = resultado.generadas < resultado.solicitadas
        ? ('Solo se han podido generar ' + resultado.generadas + ' de las ' + resultado.solicitadas + ' preguntas pedidas: el texto de este tema no da para más huecos distintos.')
        : null;
      exam = { questions: resultado.questions, modo: modo, aviso: aviso };
      iniciarQuiz();
    } catch (e) {
      var code = e && e.code;
      var msg = 'No se ha podido generar el examen. Puedes intentarlo de nuevo.';
      if (code === 'network_error') msg = 'No se ha podido conectar con el servidor. Comprueba que el backend esté en marcha (npm start).';
      else if (code === 'sin_contenido') msg = 'No hay PDFs con texto suficiente para generar este examen.';
      else if (code === 'sin_preguntas') msg = 'No se han podido extraer suficientes huecos rellenables del texto de este tema. Prueba con otro tema o con el examen global.';
      else if (code === 'invalid_json') msg = 'La respuesta del servidor no tenía el formato esperado. Vuelve a intentarlo.';
      banner.innerHTML = '<div class="banner error">' + msg + '</div>';
      btn.disabled = false;
    }
  }

  // ---------------- QUIZ ----------------

  function iniciarQuiz() {
    quiz = {
      pos: 0,
      answered: false,
      selected: null,
      optionOrder: null,
      correctCount: 0,
      respuestas: [],
      guardado: false
    };
    view = 'quiz';
    render();
  }

  function renderQuiz() {
    if (!exam || quiz.pos >= exam.questions.length) {
      if (!quiz.guardado) {
        guardarIntento();
        quiz.guardado = true;
      }
      view = 'resultado';
      render();
      return;
    }
    var q = exam.questions[quiz.pos];
    if (!quiz.optionOrder) {
      var ord = [0, 1, 2, 3];
      for (var i = ord.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = ord[i]; ord[i] = ord[j]; ord[j] = tmp;
      }
      quiz.optionOrder = ord;
    }
    var letters = ['A', 'B', 'C', 'D'];

    var optsHtml = quiz.optionOrder.map(function (origIdx, pos) {
      var isCorrect = origIdx === q.correctIndex;
      var isSelected = quiz.selected === origIdx;
      var cls = 'option';
      if (quiz.answered) {
        cls += ' disabled';
        if (isCorrect) cls += ' correct';
        else if (isSelected) cls += ' incorrect';
        else cls += ' dim';
      }
      return '<div class="' + cls + '" data-orig="' + origIdx + '">' +
        '<div class="letter">' + letters[pos] + '</div>' +
        '<div>' + escapeHtml(q.options[origIdx]) + '</div>' +
        '</div>';
    }).join('');

    mainEl.innerHTML =
      (exam.aviso ? '<div class="banner">' + escapeHtml(exam.aviso) + '</div>' : '') +
      '<div class="exam-card">' +
      '<div class="q-number">Pregunta ' + (quiz.pos + 1) + ' de ' + exam.questions.length + (q.tema ? ' · ' + escapeHtml(q.tema) : '') + '</div>' +
      '<div class="q-text">' + escapeHtml(q.question) + '</div>' +
      '<div id="opts">' + optsHtml + '</div>' +
      '<div class="quiz-footer">' +
      '<div class="quiz-progress">ACIERTOS: ' + quiz.correctCount + ' / ' + quiz.pos + '</div>' +
      (quiz.answered ? '<button class="btn" id="btn-next">' + (quiz.pos + 1 < exam.questions.length ? 'Siguiente →' : 'Ver resultado') + '</button>' : '<button class="btn secondary" id="btn-quit">Salir del examen</button>') +
      '</div>' +
      '</div>';

    if (!quiz.answered) {
      Array.prototype.forEach.call(document.querySelectorAll('#opts .option'), function (el) {
        el.onclick = function () { selectAnswer(q, parseInt(el.getAttribute('data-orig'), 10)); };
      });
      document.getElementById('btn-quit').onclick = function () { view = 'config'; exam = null; quiz = null; render(); };
    } else {
      document.getElementById('btn-next').onclick = function () {
        quiz.pos += 1;
        quiz.answered = false;
        quiz.selected = null;
        quiz.optionOrder = null;
        render();
      };
    }
  }

  function selectAnswer(q, chosenIdx) {
    quiz.answered = true;
    quiz.selected = chosenIdx;
    var correct = chosenIdx === q.correctIndex;
    if (correct) quiz.correctCount += 1;
    quiz.respuestas.push({ question: q.question, options: q.options, correctIndex: q.correctIndex, chosenIndex: chosenIdx, tema: q.tema, correct: correct });
    render();
  }

  function renderResultado() {
    var total = exam.questions.length;
    var pct = total ? Math.round(100 * quiz.correctCount / total) : 0;
    var fallos = quiz.respuestas.filter(function (r) { return !r.correct; });

    var letters = ['A', 'B', 'C', 'D'];
    var revisionHtml = fallos.length
      ? '<h3 class="serif" style="margin-top:26px;font-size:16px">Preguntas falladas (' + fallos.length + ')</h3><div>' +
        fallos.map(function (r) {
          return '<div class="review-item">' +
            '<div class="rq">' + escapeHtml(r.question) + (r.tema ? ' <span style="font-weight:400;color:var(--ink-soft)">— ' + escapeHtml(r.tema) + '</span>' : '') + '</div>' +
            '<div class="ra wrong">Tu respuesta: ' + letters[r.chosenIndex] + ') ' + escapeHtml(r.options[r.chosenIndex]) + '</div>' +
            '<div class="ra right">Correcta: ' + letters[r.correctIndex] + ') ' + escapeHtml(r.options[r.correctIndex]) + '</div>' +
            '</div>';
        }).join('') + '</div>'
      : '<div class="banner" style="margin-top:22px;border-left-color:var(--green)">¡Examen perfecto, ni un fallo!</div>';

    mainEl.innerHTML =
      '<div class="exam-card" style="text-align:center">' +
      '<div class="q-number">RESULTADO DEL EXAMEN</div>' +
      '<div class="q-text" style="margin-bottom:6px">' + quiz.correctCount + ' / ' + total + ' correctas (' + pct + '%)</div>' +
      '<div class="actions-row" style="justify-content:center;margin-top:20px">' +
      '<button class="btn" id="btn-nuevo-examen">Nuevo examen</button>' +
      '</div></div>' +
      revisionHtml;

    document.getElementById('btn-nuevo-examen').onclick = function () { view = 'config'; exam = null; quiz = null; render(); };
  }

  // ---------------- ESTADÍSTICAS ----------------

  function renderEstadisticas() {
    if (!historial.length) {
      mainEl.innerHTML = '<h2 class="serif" style="margin-top:0">Estadísticas</h2>' +
        '<div class="empty">Todavía no has terminado ningún examen. En cuanto completes uno, aquí verás tu progresión y tus puntos débiles.</div>';
      return;
    }

    var totalPreguntas = 0, totalCorrectas = 0;
    var porTemaGlobal = {};
    historial.forEach(function (h) {
      totalPreguntas += h.total;
      totalCorrectas += h.correctas;
      Object.keys(h.porTema || {}).forEach(function (k) {
        if (!porTemaGlobal[k]) porTemaGlobal[k] = { correctas: 0, total: 0 };
        porTemaGlobal[k].correctas += h.porTema[k].correctas;
        porTemaGlobal[k].total += h.porTema[k].total;
      });
    });
    var pctGlobal = totalPreguntas ? Math.round(100 * totalCorrectas / totalPreguntas) : 0;

    var ordenCron = historial.slice().sort(function (a, b) { return new Date(a.fecha) - new Date(b.fecha); });
    var puntos = ordenCron.map(function (h) {
      return { fecha: h.fecha, pct: h.total ? Math.round(100 * h.correctas / h.total) : 0 };
    });

    var temasList = Object.keys(porTemaGlobal).map(function (nombre) {
      var d = porTemaGlobal[nombre];
      return { nombre: nombre, correctas: d.correctas, total: d.total, pct: d.total ? Math.round(100 * d.correctas / d.total) : 0 };
    }).sort(function (a, b) { return a.pct - b.pct; });

    var difLabels = { facil: 'Fácil', media: 'Media', dificil: 'Difícil' };

    var html = '<h2 class="serif" style="margin-top:0">Estadísticas</h2>' +
      '<div class="stats-row">' +
      '<div class="stat"><div class="num">' + historial.length + '</div><div class="lbl">Exámenes realizados</div></div>' +
      '<div class="stat"><div class="num">' + totalPreguntas + '</div><div class="lbl">Preguntas respondidas</div></div>' +
      '<div class="stat"><div class="num">' + pctGlobal + '%</div><div class="lbl">Acierto global</div></div>' +
      '</div>';

    html += '<div class="chart-card"><h3 class="serif">Progresión</h3>' +
      '<div class="chart-sub">% de aciertos por examen, en orden cronológico</div>' +
      construirGraficoLinea(puntos) + '</div>';

    if (temasList.length) {
      html += '<div class="chart-card"><h3 class="serif">Por tema</h3>' +
        '<div class="chart-sub">% de aciertos acumulado en cada tema (de menor a mayor dominio)</div>' +
        construirGraficoBarras(temasList) + '</div>';
    }

    html += '<div class="chart-card"><h3 class="serif">Historial de exámenes</h3><div class="historial-list">' +
      historial.slice().sort(function (a, b) { return new Date(b.fecha) - new Date(a.fecha); }).map(function (h) {
        var p = h.total ? Math.round(100 * h.correctas / h.total) : 0;
        return '<div class="historial-item">' +
          '<div><div class="hi-main">' + escapeHtml(h.ambito) + '</div><div class="hi-meta">' + formatearFecha(h.fecha) + ' · ' + (difLabels[h.dificultad] || h.dificultad) + '</div></div>' +
          '<div class="hi-score">' + h.correctas + '/' + h.total + ' (' + p + '%)</div>' +
          '</div>';
      }).join('') +
      '</div>' +
      '<div class="actions-row" style="margin-top:14px"><button class="btn danger" id="btn-borrar-historial">Borrar historial</button></div>' +
      '</div>';

    mainEl.innerHTML = html;

    var btnBorrar = document.getElementById('btn-borrar-historial');
    if (btnBorrar) {
      btnBorrar.onclick = function () {
        if (window.confirm('¿Seguro que quieres borrar todo el historial de exámenes? No se puede deshacer.')) {
          historial = [];
          persistirHistorial();
          render();
        }
      };
    }
  }

  function construirGraficoLinea(puntos) {
    var W = 640, H = 180;
    var padL = 34, padR = 14, padT = 20, padB = 28;
    var plotW = W - padL - padR;
    var plotH = H - padT - padB;
    var n = puntos.length;

    function xAt(i) { return n <= 1 ? padL + plotW / 2 : padL + (i * plotW / (n - 1)); }
    function yAt(pct) { return padT + (1 - pct / 100) * plotH; }

    var grid = [0, 25, 50, 75, 100].map(function (v) {
      var y = yAt(v);
      return '<line class="chart-grid-line" x1="' + padL + '" y1="' + y + '" x2="' + (padL + plotW) + '" y2="' + y + '"></line>' +
        '<text class="chart-axis-label" x="' + (padL - 6) + '" y="' + (y + 3) + '" text-anchor="end">' + v + '</text>';
    }).join('');

    var linePts = puntos.map(function (p, i) { return xAt(i) + ',' + yAt(p.pct); }).join(' ');
    var areaPts = linePts + ' ' + xAt(n - 1) + ',' + (padT + plotH) + ' ' + xAt(0) + ',' + (padT + plotH);

    var dots = puntos.map(function (p, i) {
      var x = xAt(i), y = yAt(p.pct);
      var titulo = formatearFecha(p.fecha) + ': ' + p.pct + '%';
      return '<circle cx="' + x + '" cy="' + y + '" r="4" style="fill:var(--green);stroke:var(--paper-raised)" stroke-width="2"><title>' + escapeHtml(titulo) + '</title></circle>';
    }).join('');

    var labelStep = Math.max(1, Math.ceil(n / 7));
    var xLabels = puntos.map(function (p, i) {
      if (i % labelStep !== 0 && i !== n - 1) return '';
      var x = xAt(i);
      var txt = new Date(p.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
      return '<text class="chart-axis-label" x="' + x + '" y="' + (H - 6) + '" text-anchor="middle">' + txt + '</text>';
    }).join('');

    var ultimo = puntos[n - 1];
    var labelUltimo = '<text class="chart-value-label" x="' + xAt(n - 1) + '" y="' + (yAt(ultimo.pct) - 10) + '" text-anchor="end">' + ultimo.pct + '%</text>';

    return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">' +
      grid +
      '<polygon points="' + areaPts + '" style="fill:var(--green);opacity:0.1"></polygon>' +
      '<polyline points="' + linePts + '" style="fill:none;stroke:var(--green)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></polyline>' +
      dots + xLabels + labelUltimo +
      '</svg>';
  }

  function construirGraficoBarras(temas) {
    var W = 640;
    var barH = 20, gap = 14, padL = 190, padR = 46, padT = 6, padB = 6;
    var plotW = W - padL - padR;
    var H = padT + temas.length * (barH + gap) - gap + padB;

    function colorFor(pct) {
      if (pct >= 70) return 'var(--green)';
      if (pct >= 40) return 'var(--amber)';
      return 'var(--red)';
    }

    var bars = temas.map(function (t, i) {
      var y = padT + i * (barH + gap);
      var w = Math.max(2, plotW * (t.pct / 100));
      var titulo = t.nombre + ': ' + t.correctas + '/' + t.total + ' (' + t.pct + '%)';
      var nombreCorto = t.nombre.length > 26 ? t.nombre.slice(0, 24) + '…' : t.nombre;
      return '<g><title>' + escapeHtml(titulo) + '</title>' +
        '<text class="chart-bar-label" x="' + (padL - 10) + '" y="' + (y + barH / 2 + 4) + '" text-anchor="end">' + escapeHtml(nombreCorto) + '</text>' +
        '<rect x="' + padL + '" y="' + y + '" width="' + plotW + '" height="' + barH + '" rx="4" style="fill:var(--line)"></rect>' +
        '<rect x="' + padL + '" y="' + y + '" width="' + w + '" height="' + barH + '" rx="4" style="fill:' + colorFor(t.pct) + '"></rect>' +
        '<text class="chart-value-label" x="' + (padL + w + 8) + '" y="' + (y + barH / 2 + 4) + '">' + t.pct + '%</text>' +
        '</g>';
    }).join('');

    return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">' + bars + '</svg>';
  }

  document.getElementById('btn-refresh-temario').onclick = function () { cargarTemario(); };
  document.getElementById('tab-examen').onclick = function () { seccion = 'examen'; render(); };
  document.getElementById('tab-estadisticas').onclick = function () { seccion = 'estadisticas'; render(); };

  init();
})();
