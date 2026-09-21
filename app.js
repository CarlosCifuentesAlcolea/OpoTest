(function () {
  var API_BASE = 'http://localhost:3000';

  var temario = []; // [{id, bloque, nombre, numPdfs}]
  var backendOnline = false;
  var currentTemaId = null; // null => ámbito global
  var config = { dificultad: 'media', numPreguntas: 21 };

  var view = 'config'; // config | quiz | resultado
  var exam = null; // {questions:[{question,options,correctIndex,tema}], modo}
  var quiz = null; // {pos, answered, selected, optionOrder, correctCount, respuestas:[]}

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
    cargarTemario();
  }

  // ---------------- RENDER ----------------

  function render() {
    renderSidebar();
    if (view === 'config') renderConfig();
    else if (view === 'quiz') renderQuiz();
    else if (view === 'resultado') renderResultado();
  }

  function renderSidebar() {
    listEl.innerHTML = '';

    var global = document.createElement('button');
    global.className = 'tema-item' + (currentTemaId === null ? ' active' : '');
    global.innerHTML = 'Examen global<span class="meta">' + temasConContenido().length + ' temas con contenido</span>';
    global.onclick = function () { currentTemaId = null; view = 'config'; render(); };
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
        btn.className = 'tema-item' + (t.id === currentTemaId ? ' active' : '') + (sinContenido ? ' sin-contenido' : '');
        btn.innerHTML = escapeHtml(t.nombre) + '<span class="meta">' + (sinContenido ? 'sin PDFs todavía' : (t.numPdfs + ' PDF' + (t.numPdfs > 1 ? 's' : ''))) + '</span>';
        btn.onclick = function () { currentTemaId = t.id; view = 'config'; render(); };
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
      respuestas: []
    };
    view = 'quiz';
    render();
  }

  function renderQuiz() {
    if (!exam || quiz.pos >= exam.questions.length) {
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

  document.getElementById('btn-refresh-temario').onclick = function () { cargarTemario(); };

  init();
})();
