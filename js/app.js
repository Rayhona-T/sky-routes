/* ============================================================
   app.js — game shell for Sky Routes: The BFS Expedition.
   State machine, controls, keyboard/touch input, modals,
   narration and the plane's reactions.
   ============================================================ */
(function () {
  'use strict';

  var B = window.SkyBFS;
  var L = window.SkyLevels;

  /* ---------------------------------------------------------- DOM */
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  var canvas = $('#map');
  var scene = new window.SkyScene(canvas);

  var el = {
    missionBadge: $('#mission-badge'),
    missionName: $('#mission-name'),
    missionText: $('#mission-text'),
    missionTags: $('#mission-tags'),
    play: $('#btn-play'),
    playLabel: $('#play-label'),
    step: $('#btn-step'),
    reset: $('#btn-reset'),
    speed: $('#speed'),
    speedOut: $('#speed-out'),
    bar: $('#progress-bar'),
    counter: $('#step-counter'),
    mode: $('#mode-chip'),
    statCurrent: $('#stat-current'),
    statDepth: $('#stat-depth'),
    statVisited: $('#stat-visited'),
    statPath: $('#stat-path'),
    queueView: $('#queue-view'),
    queueLen: $('#queue-len'),
    narration: $('#narration-text'),
    mascot: $('#mascot'),
    toast: $('#canvas-toast'),
    restore: $('#btn-restore'),
    clear: $('#btn-clear'),
    sound: $('#btn-sound'),
    tutorial: $('#btn-tutorial'),
    help: $('#btn-help'),
    explain: $('#btn-explain'),
    tutPractice: $('#btn-tut-practice'),
    winEyebrow: $('#win-eyebrow'),
    winTitle: $('#win-title'),
    winCopy: $('#win-copy'),
    winPath: $('#win-path'),
    winVisited: $('#win-visited'),
    winSteps: $('#win-steps'),
    winTime: $('#win-time'),
    winReplay: $('#btn-win-replay'),
    winEdit: $('#btn-win-edit'),
    winNext: $('#btn-win-next')
  };

  /* screen-reader status line (throttled during autoplay) */
  var srStatus = document.createElement('div');
  srStatus.setAttribute('aria-live', 'polite');
  srStatus.setAttribute('aria-atomic', 'true');
  srStatus.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap';
  document.body.appendChild(srStatus);

  /* ------------------------------------------------------- config */
  var SPEEDS = [
    { label: '0.5×', ms: 300 },
    { label: '1×', ms: 150 },
    { label: '2×', ms: 75 },
    { label: '4×', ms: 38 },
    { label: '8×', ms: 19 }
  ];
  var MOOD_MOUTH = {
    idle: 'M27 55q4.5 4 9 0',
    curious: 'M27 56q4.5 -1 9 0',
    happy: 'M26 54q5.5 7 11 0',
    wow: 'M31.5 53a4.5 4.5 0 100 9 4.5 4.5 0 100-9',
    win: 'M25 53q6.5 9 13 0',
    sad: 'M27 59q4.5 -5 9 0'
  };

  /* --------------------------------------------------------- state */
  var S = {
    levelIndex: 0,
    model: null,
    result: null,
    frameIndex: 0,
    playing: false,
    speedIdx: 2,
    tool: 'start',
    cursor: -1,
    cursorVisible: true,
    hover: -1,
    airwayFirst: -1,
    acc: 0,
    last: 0,
    elapsed: 0,
    lastTick: null,
    flyStart: 0,
    flyDur: 1400,
    flying: false,
    finished: false,
    won: false,
    sound: true,
    lastAnnounce: 0,
    openModal: null,
    lastFocus: null,
    lastBlip: 0
  };

  var view = {
    frame: null, hover: -1, cursor: -1, cursorVisible: true, airwayFirst: -1
  };

  /* ==================================================== utilities */
  function nm(id) { return B.name(id, S.model.cols); }
  function currentFrame() {
    return S.result ? S.result.frames[S.frameIndex] : null;
  }
  function lastFrameIndex() {
    return S.result ? S.result.frames.length - 1 : 0;
  }

  function showToast(msg, ms) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { el.toast.classList.remove('show'); }, ms || 2400);
  }

  function setMood(mood) {
    el.mascot.setAttribute('data-mood', mood);
    var mouth = el.mascot.querySelector('.mouth');
    if (mouth && MOOD_MOUTH[mood]) mouth.setAttribute('d', MOOD_MOUTH[mood]);
  }

  /* -------------------------------------------------------- audio */
  var AC = null;
  function ac() {
    if (!AC) {
      try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; }
    }
    if (AC && AC.state === 'suspended') AC.resume();
    return AC;
  }
  function tone(freq, dur, type, vol, delay) {
    if (!S.sound || !AC) return;              /* audio unlocks on first gesture */
    if (AC.state !== 'running') AC.resume();
    var c = AC;
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    o.connect(g); g.connect(c.destination);
    var t = c.currentTime + (delay || 0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol || 0.06, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur + 0.03);
  }
  function sfxDiscover() {
    var now = performance.now();
    if (now - S.lastBlip < 55) return;
    S.lastBlip = now;
    tone(700 + Math.random() * 120, 0.12, 'triangle', 0.05);
  }
  function sfxClick() { tone(520, 0.06, 'sine', 0.04); }
  function sfxNope() { tone(210, 0.18, 'square', 0.045); }
  function sfxWin() {
    [523, 659, 784, 1047, 1319].forEach(function (f, i) {
      tone(f, 0.3, 'triangle', 0.07, i * 0.11);
    });
  }

  /* =================================================== level flow */
  function loadLevel(index) {
    pause();
    S.levelIndex = index;
    S.model = L.load(index);
    scene.setModel(S.model);
    S.cursor = S.model.start;
    S.airwayFirst = -1;
    S.elapsed = 0;
    S.finished = false;
    S.won = false;
    el.missionBadge.textContent = S.model.badge;
    el.missionName.textContent = S.model.name;
    el.missionText.textContent = S.model.brief;
    el.missionTags.innerHTML = S.model.tags.map(function (t) {
      return '<span>' + t + '</span>';
    }).join('');
    $$('.nav-btn').forEach(function (b) {
      b.classList.toggle('is-active', +b.getAttribute('data-level') === index);
    });
    recompute(true);
    setMood('idle');
    el.narration.innerHTML = introText();
    showToast(S.model.badge + ' · ' + S.model.name);
    sfxClick();
  }

  function introText() {
    return 'Ready on <b>' + S.model.name + '</b>. Pick a departure and a destination with the tools, then press ' +
      '<span class="mono">Autoplay</span> to watch BFS widen across the sky — or <span class="mono">Step</span> to go one move at a time.';
  }

  function recompute(silent, msg) {
    S.result = B.run(S.model);
    S.frameIndex = 0;
    S.playing = false;
    S.flying = false;
    S.finished = false;
    S.won = false;
    S.elapsed = 0;
    S.lastTick = null;
    S.acc = 0;
    scene.plane.mode = 'idle';
    scene.plane.t = 0;
    view.frame = currentFrame();
    if (!silent) {
      el.narration.innerHTML = msg ||
        'Map updated — the search was reset to step zero. Press <span class="mono">Autoplay</span> to run it again.';
      showToast(msg ? 'Search reset' : 'Map updated · search reset');
      setMood('idle');
    }
    updateUI(true);
  }

  /* ================================================== transport */
  function play() {
    if (!S.result) return;
    if (S.frameIndex >= lastFrameIndex() || S.flying) reset();
    S.playing = true;
    S.acc = 0;
    ac();
    updateUI();
    el.narration.setAttribute('aria-live', 'off');
  }
  function pause() {
    S.playing = false;
    updateUI();
    el.narration.setAttribute('aria-live', 'polite');
  }
  function togglePlay() { S.playing ? pause() : play(); }

  /* wall-clock time actually spent searching (long pauses excluded) */
  function tickTime() {
    var now = performance.now();
    if (S.lastTick != null && now - S.lastTick < 6000) S.elapsed += (now - S.lastTick) / 1000;
    S.lastTick = now;
  }

  function advance() {
    if (S.frameIndex >= lastFrameIndex()) { finish(); return; }
    S.frameIndex++;
    tickTime();
    onFrame();
  }

  function stepOnce() {
    if (!S.result) return;
    pause();
    if (S.frameIndex >= lastFrameIndex()) { finish(); return; }
    S.frameIndex++;
    tickTime();
    onFrame();
  }

  function reset() {
    pause();
    S.frameIndex = 0;
    S.elapsed = 0;
    S.lastTick = null;
    S.flying = false;
    S.finished = false;
    S.won = false;
    S.airwayFirst = -1;
    scene.plane.mode = 'idle';
    scene.plane.t = 0;
    setMood('idle');
    el.narration.innerHTML = introText();
    srStatus.textContent = 'Search reset to step zero.';
    updateUI(true);
  }

  function finish() {
    pause();
    tickTime();
    S.finished = true;
    if (S.result.found) startFlight();
    else {
      scene.plane.mode = 'sad';
      setMood('sad');
      el.mode.textContent = 'No route';
      el.mode.className = 'mode-chip mode-done';
      showToast('No route — the destination is cut off. Edit the map and try again.', 3400);
      sfxNope();
      srStatus.textContent = 'No route found. The destination is unreachable.';
    }
    updateUI(true);
  }

  /* ------------------------------------------- win / plane flight */
  function startFlight() {
    var path = S.result.path;
    var hops = Math.max(1, path.length - 1);
    S.flying = true;
    S.flyStart = performance.now();
    S.flyDur = Math.max(1500, hops * 190);
    scene.plane.mode = 'fly';
    scene.plane.t = 0;
    setMood('wow');
    el.mode.textContent = 'Flying';
    el.mode.className = 'mode-chip mode-run';
    sfxWin();
    srStatus.textContent = 'Destination reached in ' + hops + ' hops. The plane is flying the shortest route.';
  }

  function arrive() {
    S.flying = false;
    S.won = true;
    scene.plane.mode = 'fly';
    scene.plane.t = 1;
    setMood('win');
    scene.celebrate();
    showWin();
  }

  function showWin() {
    var r = S.result;
    el.winPath.textContent = (r.path.length - 1);
    el.winVisited.textContent = r.expanded;
    el.winSteps.textContent = r.steps;
    el.winTime.textContent = S.elapsed.toFixed(1) + 's';

    if (S.levelIndex === 3) {
      el.winEyebrow.textContent = 'Expedition log';
      el.winTitle.textContent = 'Route found!';
      el.winCopy.textContent = 'Your hand-built map still has a way through — BFS never stopped looking until the queue ran dry.';
      el.winNext.textContent = 'Keep editing';
    } else if (S.levelIndex === 2) {
      el.winEyebrow.textContent = 'Expedition complete';
      el.winTitle.textContent = 'All three skies cleared!';
      el.winCopy.textContent = 'You have flown every hand-drawn route in the expedition. Free Play is open — build a nastier sky and see if BFS still wins.';
      el.winNext.textContent = 'Open Free Play →';
    } else {
      el.winEyebrow.textContent = 'Level complete';
      el.winTitle.textContent = 'Smooth flying!';
      el.winCopy.textContent = 'BFS reached the destination with the fewest possible hops, exploring level by level.';
      el.winNext.textContent = 'Next level →';
    }
    setTimeout(function () { if (S.won) openModal('modal-win'); }, 620);
  }

  /* ================================================== frame hooks */
  function onFrame() {
    var f = currentFrame();
    view.frame = f;
    if (!f) return;

    if (f.t === 'enqueue') {
      scene.burst(f.focus, 'small');
      sfxDiscover();
      setMood('curious');
    } else if (f.t === 'found') {
      scene.burst(f.focus, 'big');
      setMood('wow');
    } else if (f.t === 'dequeue') {
      scene.plane.mode = 'idle';
    }

    updateUI();

    if (S.frameIndex >= lastFrameIndex()) finish();
  }

  /* ======================================================== UI */
  function updateUI(full) {
    var f = currentFrame();
    if (!f || !S.result) return;

    /* transport */
    el.play.classList.toggle('is-playing', S.playing);
    el.playLabel.textContent = S.playing ? 'Pause' : (S.frameIndex >= lastFrameIndex() && S.result.found && S.won ? 'Fly again' : 'Autoplay');
    el.play.setAttribute('aria-label', S.playing ? 'Pause search' : 'Play search');

    var total = lastFrameIndex();
    var pct = total ? (S.frameIndex / total) * 100 : 0;
    el.bar.style.width = pct.toFixed(1) + '%';
    el.counter.textContent = 'Step ' + S.frameIndex + ' / ' + total;

    if (S.won || S.flying) { el.mode.textContent = S.flying ? 'Flying' : 'Complete'; el.mode.className = 'mode-chip mode-done'; }
    else if (S.playing) { el.mode.textContent = 'Running'; el.mode.className = 'mode-chip mode-run'; }
    else if (S.frameIndex === 0) { el.mode.textContent = 'Ready'; el.mode.className = 'mode-chip mode-idle'; }
    else if (S.frameIndex >= total) { el.mode.textContent = S.result.found ? 'Done' : 'No route'; el.mode.className = 'mode-chip mode-done'; }
    else { el.mode.textContent = 'Paused'; el.mode.className = 'mode-chip mode-pause'; }

    /* readout */
    var cur = f.current >= 0 ? nm(f.current) : '—';
    setText(el.statCurrent, cur);
    setText(el.statDepth, f.level >= 0 ? String(f.level) : '—');
    setText(el.statVisited, String(f.expanded));
    setText(el.statPath, f.path ? (f.path.length - 1) + ' hops' : '—');

    /* queue */
    var q = f.queue;
    el.queueLen.textContent = q.length;
    if (!q.length) {
      el.queueView.innerHTML = '<span class="queue-empty">empty — search finished</span>';
    } else {
      var html = '';
      for (var i = 0; i < q.length; i++) {
        html += '<span class="q-chip' + (i === 0 ? ' is-head' : '') + '">' + nm(q[i]) + '</span>';
      }
      el.queueView.innerHTML = html;
    }

    /* narration */
    if (f.text) el.narration.innerHTML = f.text;

    /* throttled screen-reader summary while autoplaying */
    var now = performance.now();
    if (now - S.lastAnnounce > 1400) {
      S.lastAnnounce = now;
      srStatus.textContent = 'Step ' + S.frameIndex + ' of ' + total + '. Current node ' + cur +
        '. ' + f.expanded + ' nodes explored. ' + q.length + ' waiting in the queue.';
    }

    if (full) {
      el.speedOut.textContent = SPEEDS[S.speedIdx].label;
      el.speed.value = String(S.speedIdx);
    }
  }

  function setText(node, txt) {
    if (node.textContent === txt) return;
    node.textContent = txt;
    var animate = !S.playing || SPEEDS[S.speedIdx].ms >= 38;
    if (!animate) return;
    node.classList.remove('pop');
    void node.offsetWidth;
    node.classList.add('pop');
  }

  /* ======================================================= tools */
  function selectTool(tool) {
    S.tool = tool;
    S.airwayFirst = -1;
    $$('.tool').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-tool') === tool));
    });
    var hints = {
      start: 'Click a cell to set the departure airport',
      goal: 'Click a cell to set the destination airport',
      storm: 'Click a cell to drop a storm (click again to clear)',
      mountain: 'Click a cell to raise a mountain (click again to clear)',
      airway: 'Click one cell, then an adjacent one, to close that airway',
      erase: 'Click a cell to clear obstacles and closed airways there'
    };
    showToast(hints[tool]);
    sfxClick();
  }

  function cellBlocked(id) { return B.isBlockedCell(S.model.terrain, id); }

  function applyTool(id) {
    if (id < 0) return;
    var m = S.model;
    S.cursor = id;

    switch (S.tool) {
      case 'start':
        if (id === m.goal) { sfxNope(); showToast('That is already the destination — pick another cell.'); return; }
        if (cellBlocked(id)) { sfxNope(); showToast('That cell is blocked. Use Erase first.'); return; }
        m.start = id;
        sfxClick();
        recompute(false, 'Departure airport moved to <b>' + nm(id) + '</b> — BFS will ripple out from there.');
        updateView();
        return;
      case 'goal':
        if (id === m.start) { sfxNope(); showToast('That is already the departure airport.'); return; }
        if (cellBlocked(id)) { sfxNope(); showToast('That cell is blocked. Use Erase first.'); return; }
        m.goal = id;
        sfxClick();
        recompute(false, 'Destination set to <b>' + nm(id) + '</b> — BFS will now hunt for the fewest hops to it.');
        updateView();
        return;
      case 'storm':
      case 'mountain':
        if (id === m.start || id === m.goal) { sfxNope(); showToast('The airports must stay clear of obstacles.'); return; }
        var t = S.tool === 'storm' ? B.TERRAIN.STORM : B.TERRAIN.MOUNTAIN;
        m.terrain[id] = (m.terrain[id] === t) ? B.TERRAIN.SKY : t;
        break;
      case 'airway':
        if (S.airwayFirst < 0) {
          S.airwayFirst = id;
          showToast('Now click an adjacent cell to close the airway between them.');
          sfxClick();
          updateView();
          return;
        }
        if (S.airwayFirst === id) { S.airwayFirst = -1; showToast('Airway selection cancelled.'); updateView(); return; }
        var adj = B.rawNeighbours(S.airwayFirst, m.cols, m.rows);
        if (adj.indexOf(id) === -1) {
          S.airwayFirst = id;
          showToast('Not adjacent — pick a neighbour of ' + nm(id) + '.');
          sfxNope();
          updateView();
          return;
        }
        var key = B.edgeKey(S.airwayFirst, id);
        if (m.closedEdges.has(key)) { m.closedEdges.delete(key); showToast('Airway ' + nm(S.airwayFirst) + '–' + nm(id) + ' reopened'); }
        else { m.closedEdges.add(key); showToast('Airway ' + nm(S.airwayFirst) + '–' + nm(id) + ' closed'); }
        S.airwayFirst = -1;
        sfxClick();
        break;
      case 'erase':
        m.terrain[id] = B.TERRAIN.SKY;
        B.rawNeighbours(id, m.cols, m.rows).forEach(function (n) {
          m.closedEdges.delete(B.edgeKey(id, n));
        });
        break;
    }
    sfxClick();
    recompute();
  }

  function updateView() {
    view.frame = currentFrame();
    view.hover = S.hover;
    view.cursor = S.cursor;
    view.cursorVisible = S.cursorVisible;
    view.airwayFirst = S.airwayFirst;
  }

  /* ====================================================== modals */
  function openModal(id) {
    if (S.openModal) closeModal(true);
    var modal = document.getElementById(id);
    if (!modal) return;
    S.lastFocus = document.activeElement;
    modal.hidden = false;
    S.openModal = id;
    var focusable = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusable) focusable.focus();
    pause();
    sfxClick();
  }
  function closeModal(keepFocus) {
    if (!S.openModal) return;
    var modal = document.getElementById(S.openModal);
    if (modal) modal.hidden = true;
    S.openModal = null;
    if (!keepFocus && S.lastFocus && S.lastFocus.focus) S.lastFocus.focus();
  }

  /* ===================================================== input */
  function bindEvents() {
    /* transport */
    el.play.addEventListener('click', function () { sfxClick(); togglePlay(); });
    el.step.addEventListener('click', function () { sfxClick(); stepOnce(); });
    el.reset.addEventListener('click', function () { sfxClick(); reset(); showToast('Search reset'); });
    el.speed.addEventListener('input', function () { setSpeed(+el.speed.value); });

    /* tools */
    $$('.tool').forEach(function (btn) {
      btn.addEventListener('click', function () { selectTool(btn.getAttribute('data-tool')); });
    });
    el.restore.addEventListener('click', function () {
      L.restore(S.model);
      recompute();
      showToast('Map restored to its original layout');
      sfxClick();
    });
    el.clear.addEventListener('click', function () {
      L.clearObstacles(S.model);
      recompute();
      showToast('All obstacles and closed airways cleared');
      sfxClick();
    });

    /* nav */
    $$('.nav-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { loadLevel(+btn.getAttribute('data-level')); });
    });

    /* modals */
    el.tutorial.addEventListener('click', function () { openModal('modal-tutorial'); });
    el.help.addEventListener('click', function () { openModal('modal-keys'); });
    el.explain.addEventListener('click', function () { openModal('modal-tutorial'); });
    el.tutPractice.addEventListener('click', function () { closeModal(); loadLevel(0); });
    el.sound.addEventListener('click', function () {
      S.sound = !S.sound;
      el.sound.setAttribute('aria-pressed', String(S.sound));
      showToast(S.sound ? 'Sound on' : 'Sound muted');
      if (S.sound) sfxClick();
    });
    el.winReplay.addEventListener('click', function () { closeModal(); reset(); play(); });
    el.winEdit.addEventListener('click', function () { closeModal(); loadLevel(3); });
    el.winNext.addEventListener('click', function () {
      closeModal();
      if (S.levelIndex < 3) loadLevel(S.levelIndex + 1);
      else { reset(); showToast('Keep building — the tools are yours.'); }
    });

    $$('.modal').forEach(function (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target.hasAttribute('data-close') || e.target.closest('[data-close]')) closeModal();
      });
    });

    /* canvas pointer */
    canvas.addEventListener('pointermove', function (e) {
      var p = scene.toLogical(e.clientX, e.clientY);
      S.hover = scene.cellAt(p.x, p.y);
      updateView();
    });
    canvas.addEventListener('pointerleave', function () { S.hover = -1; updateView(); });
    canvas.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      canvas.focus();
      ac();
      var p = scene.toLogical(e.clientX, e.clientY);
      var id = scene.cellAt(p.x, p.y);
      if (id >= 0) { S.cursorVisible = true; applyTool(id); }
      updateView();
    });

    /* keyboard */
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', function () { scene.resize(); });
  }

  function setSpeed(idx) {
    S.speedIdx = Math.max(0, Math.min(SPEEDS.length - 1, idx));
    el.speed.value = String(S.speedIdx);
    el.speedOut.textContent = SPEEDS[S.speedIdx].label;
    el.speedOut.classList.remove('pop');
    void el.speedOut.offsetWidth;
    el.speedOut.classList.add('pop');
  }

  function onKey(e) {
    var k = e.key;
    var tag = (e.target.tagName || '').toLowerCase();
    var typing = tag === 'input' || tag === 'textarea' || tag === 'select';

    if (k === 'Escape') {
      if (S.openModal) { closeModal(); e.preventDefault(); }
      else if (S.airwayFirst >= 0) { S.airwayFirst = -1; updateView(); }
      return;
    }

    /* keep Tab inside an open dialog */
    if (S.openModal && k === 'Tab') {
      var modal = document.getElementById(S.openModal);
      var items = Array.prototype.filter.call(
        modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
        function (n) { return n.offsetParent !== null || n === document.activeElement; }
      );
      if (!items.length) return;
      var first = items[0], lastItem = items[items.length - 1];
      if (!modal.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastItem.focus(); }
      else if (!e.shiftKey && document.activeElement === lastItem) { e.preventDefault(); first.focus(); }
      return;
    }

    if (S.openModal || typing) return;

    var onButton = tag === 'button' || tag === 'summary' || tag === 'a';

    if (k === ' ' || k === 'Spacebar') {
      if (onButton) return;              /* let the browser activate the button */
      e.preventDefault();
      sfxClick();
      togglePlay();
      return;
    }
    if (k === '.' || k === 's' || k === 'S') { e.preventDefault(); sfxClick(); stepOnce(); return; }
    if (k === 'r' || k === 'R') { e.preventDefault(); sfxClick(); reset(); showToast('Search reset'); return; }
    if (k === 't' || k === 'T') { e.preventDefault(); openModal('modal-tutorial'); return; }
    if (k === '1') { setSpeed(1); showToast('Speed 1×'); return; }
    if (k === '2') { setSpeed(2); showToast('Speed 2×'); return; }
    if (k === '3') { setSpeed(3); showToast('Speed 4×'); return; }

    if (k === 'Enter') {
      if (onButton) return;
      if (S.cursor >= 0) { e.preventDefault(); applyTool(S.cursor); updateView(); }
      return;
    }

    if (k.indexOf('Arrow') === 0) {
      if (onButton) return;
      e.preventDefault();
      S.cursorVisible = true;
      var c = B.colOf(Math.max(0, S.cursor), S.model.cols);
      var r = B.rowOf(Math.max(0, S.cursor), S.model.cols);
      if (k === 'ArrowLeft') c--;
      if (k === 'ArrowRight') c++;
      if (k === 'ArrowUp') r--;
      if (k === 'ArrowDown') r++;
      c = Math.max(0, Math.min(S.model.cols - 1, c));
      r = Math.max(0, Math.min(S.model.rows - 1, r));
      S.cursor = B.idOf(c, r, S.model.cols);
      S.hover = S.cursor;
      updateView();
      srStatus.textContent = 'Cursor on ' + nm(S.cursor);
    }
  }

  /* ====================================================== loop */
  function loop(now) {
    var dt = Math.min(0.05, (now - (S.last || now)) / 1000);
    S.last = now;

    if (S.playing) {
      S.acc += dt * 1000;
      var iv = SPEEDS[S.speedIdx].ms;
      var guard = 0;
      while (S.acc >= iv && S.playing && guard++ < 40) {
        S.acc -= iv;
        advance();
      }
    }

    if (S.flying) {
      var t = (now - S.flyStart) / S.flyDur;
      scene.plane.t = Math.min(1, t);
      if (t >= 1) arrive();
    }

    updateView();
    scene.draw(view, now, dt);
    requestAnimationFrame(loop);
  }

  /* ======================================================= boot */
  function init() {
    bindEvents();
    loadLevel(0);
    setSpeed(2);
    selectTool('start');
    el.narration.innerHTML = introText();
    requestAnimationFrame(loop);

    /* first gesture unlocks web audio */
    document.addEventListener('pointerdown', function once() {
      ac();
      document.removeEventListener('pointerdown', once);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
