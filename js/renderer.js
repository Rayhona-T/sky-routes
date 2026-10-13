/* ============================================================
   renderer.js — the illustrated canvas world of Sky Routes.
   Pastel sky, floating islands, ocean, mountains, storms,
   clouds, tiny planes, glowing airways and the plane mascot.
   Pure drawing: no dependencies, logical space is 944 x 600.
   ============================================================ */
(function (root) {
  'use strict';

  var B = root.SkyBFS;

  var W = 944, H = 600;
  var OX = 52, OY = 58, CELL = 56;

  var C = {
    ink: '#2B3A67', inkSoft: '#5B6A96', inkFaint: '#8C97BC',
    tileIdle: 'rgba(255,255,255,0.80)',
    tileFrontier: 'rgba(255,233,152,0.96)',
    tileVisited: 'rgba(157,231,199,0.92)',
    tileCurrent: 'rgba(255,196,220,0.98)',
    tilePath: 'rgba(146,216,255,0.98)',
    tileStorm: 'rgba(176,187,219,0.88)',
    tileMountain: 'rgba(198,187,238,0.88)',
    tileSea: 'rgba(178,224,247,0.82)',
    tileLine: 'rgba(43,58,103,0.11)',
    edge: 'rgba(120,142,196,0.34)',
    tree: 'rgba(63,191,143,0.55)',
    closed: '#F0776A',
    coral: '#FF9A8B', gold: '#FFD166', sky: '#8ED0F5', mint: '#3FBF8F',
    lav: '#C9BDF6',
    storm: '#96A2C4', stormDark: '#7A87B2',
    mount: '#A795D8', mountDark: '#8674C4', snow: '#FFFFFF',
    islTop: '#8FE3BC', islBody: '#F6DFBE', islRock: '#DCBB92', islShade: '#C7A176',
    bridge: '#E3BC8C', bridgeDark: '#B78D5C',
    sea: '#C7E9FA'
  };

  var FONT = '"Segoe UI", system-ui, -apple-system, Arial, sans-serif';

  /* ---------------------------------------------------------- utils */
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function ease(t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function rnd(seed) { var x = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  /* deterministic scatter so the scenery never jumps around */
  function makeScatter(n, seed, w, h, min, max) {
    var out = [];
    for (var i = 0; i < n; i++) {
      out.push({
        x: rnd(seed + i * 3.7) * (w + 240) - 120,
        y: 20 + rnd(seed + i * 9.1) * (h - 90),
        s: min + rnd(seed + i * 5.3) * (max - min),
        v: 4 + rnd(seed + i * 2.9) * 9,
        a: .35 + rnd(seed + i * 7.7) * .5
      });
    }
    return out.sort(function (p, q) { return p.s - q.s; });
  }

  /* ============================================================ Scene */
  function Scene(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.model = null;
    this.cols = 15; this.rows = 9;
    this.dpr = 1;
    this.particles = [];
    this.clouds = makeScatter(9, 11, W, 260, 46, 108);
    this.bgIslands = [
      { x: 18, y: 398, s: .55 }, { x: 926, y: 168, s: .5 },
      { x: 646, y: 594, s: .52 }, { x: 30, y: 20, s: .42 }
    ];
    this.jets = [
      { y: 84, v: 26, dir: 1, x: -80, s: .55 },
      { y: 236, v: 17, dir: -1, x: W + 60, s: .4 }
    ];
    this.plane = { mode: 'idle', t: 0 };
    this.resize();
  }

  Scene.prototype.resize = function () {
    var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.dpr = dpr;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  Scene.prototype.setModel = function (model) {
    this.model = model;
    this.cols = model.cols; this.rows = model.rows;
  };

  Scene.prototype.cellRect = function (id) {
    var c = B.colOf(id, this.cols), r = B.rowOf(id, this.cols);
    return { x: OX + c * CELL, y: OY + r * CELL, w: CELL, h: CELL };
  };
  Scene.prototype.cellCenter = function (id) {
    var q = this.cellRect(id);
    return { x: q.x + q.w / 2, y: q.y + q.h / 2 };
  };
  Scene.prototype.cellAt = function (px, py) {
    var c = Math.floor((px - OX) / CELL), r = Math.floor((py - OY) / CELL);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return B.idOf(c, r, this.cols);
  };
  Scene.prototype.toLogical = function (clientX, clientY) {
    var b = this.canvas.getBoundingClientRect();
    return { x: (clientX - b.left) / b.width * W, y: (clientY - b.top) / b.height * H };
  };

  /* ----------------------------------------------------- particles */
  Scene.prototype.burst = function (id, kind) {
    var p = this.cellCenter(id), n = kind === 'big' ? 26 : 11;
    var palette = kind === 'big'
      ? [C.gold, C.coral, '#FFFFFF', C.sky, C.mint]
      : [C.gold, '#FFFFFF', C.sky];
    for (var i = 0; i < n; i++) {
      var a = (Math.PI * 2 * i) / n + Math.random() * .5;
      var sp = (kind === 'big' ? 70 : 40) * (.5 + Math.random());
      this.particles.push({
        x: p.x, y: p.y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 18,
        life: 1, decay: kind === 'big' ? .75 : 1.15,
        size: kind === 'big' ? 4 + Math.random() * 4 : 2.5 + Math.random() * 2.5,
        color: palette[(Math.random() * palette.length) | 0],
        star: Math.random() < .5
      });
    }
  };
  Scene.prototype.celebrate = function () {
    var self = this;
    var ids = this.model ? [this.model.start, this.model.goal] : [];
    ids.forEach(function (id) { self.burst(id, 'big'); });
    for (var i = 0; i < 40; i++) {
      this.particles.push({
        x: 40 + Math.random() * (W - 80), y: -10 - Math.random() * 60,
        vx: -30 + Math.random() * 60, vy: 60 + Math.random() * 90,
        life: 1, decay: .3 + Math.random() * .25,
        size: 4 + Math.random() * 5,
        color: [C.gold, C.coral, C.sky, C.mint, '#C9BDF6'][(Math.random() * 5) | 0],
        star: false, spin: Math.random() * 6, vspin: -4 + Math.random() * 8
      });
    }
  };
  Scene.prototype.updateParticles = function (dt) {
    var out = [];
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      p.life -= p.decay * dt;
      if (p.life <= 0) continue;
      p.vy += 60 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.spin) p.spin += p.vspin * dt;
      out.push(p);
    }
    this.particles = out;
  };

  /* ============================================================ sky */
  Scene.prototype.drawSky = function (t) {
    var ctx = this.ctx, g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#FFF7EC');
    g.addColorStop(.34, '#EAF3FF');
    g.addColorStop(.72, '#DFEDFC');
    g.addColorStop(1, '#D3E7FA');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    /* sun */
    var sx = W - 96, sy = 76;
    var sun = ctx.createRadialGradient(sx, sy, 6, sx, sy, 96);
    sun.addColorStop(0, 'rgba(255,226,150,.95)');
    sun.addColorStop(.34, 'rgba(255,214,132,.42)');
    sun.addColorStop(1, 'rgba(255,214,132,0)');
    ctx.fillStyle = sun;
    ctx.beginPath(); ctx.arc(sx, sy, 96, 0, 7); ctx.fill();
    ctx.fillStyle = '#FFE9A8';
    ctx.beginPath(); ctx.arc(sx, sy, 30, 0, 7); ctx.fill();

    /* ocean band */
    var oy = 508;
    var sea = ctx.createLinearGradient(0, oy, 0, H);
    sea.addColorStop(0, 'rgba(159,215,244,.55)');
    sea.addColorStop(1, 'rgba(120,190,232,.85)');
    ctx.fillStyle = sea;
    ctx.beginPath();
    ctx.moveTo(0, oy + 8);
    for (var x = 0; x <= W; x += 24) {
      ctx.lineTo(x, oy + 8 + Math.sin((x / 60) + t / 900) * 4);
    }
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();

    /* sun glitter on the water */
    ctx.save();
    ctx.globalAlpha = .5;
    for (var i = 0; i < 16; i++) {
      var gx = ((i * 71 + t / 26) % (W + 80)) - 40;
      var gy = oy + 24 + ((i * 37) % 62);
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.fillRect(gx, gy, 16, 2);
    }
    ctx.restore();

    /* clouds */
    for (var k = 0; k < this.clouds.length; k++) {
      var cl = this.clouds[k];
      var cx = ((cl.x + (t / 1000) * cl.v) % (W + 320)) - 160;
      this.drawCloud(cx, cl.y, cl.s, cl.a);
    }

    /* distant floating islands */
    for (var d = 0; d < this.bgIslands.length; d++) {
      var isl = this.bgIslands[d];
      this.drawIsland(isl.x, isl.y + Math.sin(t / 1400 + d) * 5, isl.s, true);
    }

    /* tiny jets crossing the sky */
    for (var j = 0; j < this.jets.length; j++) {
      var jt = this.jets[j];
      jt.x += jt.dir * jt.v * .016;
      if (jt.dir > 0 && jt.x > W + 90) jt.x = -90;
      if (jt.dir < 0 && jt.x < -90) jt.x = W + 90;
      ctx.save();
      ctx.globalAlpha = .5;
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.setLineDash([3, 12]);
      ctx.beginPath();
      ctx.moveTo(jt.x - jt.dir * 16, jt.y + 2);
      ctx.lineTo(jt.x - jt.dir * (16 + 90), jt.y + 6);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      ctx.save();
      ctx.translate(jt.x, jt.y + Math.sin(t / 700 + j * 2) * 3);
      if (jt.dir < 0) ctx.scale(-1, 1);
      ctx.scale(jt.s, jt.s);
      this.planeShape(ctx, 0, 0, 0, 0.55, '#FFFFFF');
      ctx.restore();
    }
  };

  Scene.prototype.drawCloud = function (x, y, s, a) {
    var ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(x, y, 38 * s / 60, 16 * s / 60, 0, 0, 7);
    ctx.ellipse(x - 22 * s / 60, y + 4 * s / 60, 24 * s / 60, 12 * s / 60, 0, 0, 7);
    ctx.ellipse(x + 24 * s / 60, y + 5 * s / 60, 26 * s / 60, 12 * s / 60, 0, 0, 7);
    ctx.ellipse(x + 4 * s / 60, y - 9 * s / 60, 22 * s / 60, 15 * s / 60, 0, 0, 7);
    ctx.fill();
    ctx.restore();
  };

  Scene.prototype.drawIsland = function (x, y, s, ghost) {
    var ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.globalAlpha = ghost ? .55 : 1;

    /* rock underside */
    ctx.fillStyle = C.islRock;
    ctx.beginPath();
    ctx.moveTo(-42, 0);
    ctx.quadraticCurveTo(-30, 40, -6, 54);
    ctx.quadraticCurveTo(14, 46, 34, 22);
    ctx.quadraticCurveTo(44, 10, 42, 0);
    ctx.closePath(); ctx.fill();

    /* grass cap */
    ctx.fillStyle = C.islTop;
    ctx.beginPath();
    ctx.ellipse(0, 0, 44, 14, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = C.islShade;
    ctx.beginPath();
    ctx.ellipse(0, 4, 42, 9, 0, 0, 7);
    ctx.globalAlpha *= .5;
    ctx.fill();
    ctx.globalAlpha = ghost ? .55 : 1;

    if (!ghost) {
      /* palm */
      ctx.strokeStyle = '#8A6B4A'; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-8, -2); ctx.quadraticCurveTo(-12, -18, -4, -28); ctx.stroke();
      ctx.fillStyle = '#6ED3A5';
      for (var i = 0; i < 5; i++) {
        var a = -Math.PI / 2 + (i - 2) * .5;
        ctx.beginPath();
        ctx.ellipse(-4 + Math.cos(a) * 11, -29 + Math.sin(a) * 7, 10, 4.2, a, 0, 7);
        ctx.fill();
      }
      /* waterfall */
      ctx.fillStyle = 'rgba(150,220,255,.85)';
      ctx.fillRect(14, 2, 5, 34);
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.fillRect(15.5, 2, 2, 34);
    }
    ctx.restore();
  };

  /* ============================================================ map */
  Scene.prototype.drawPanel = function () {
    var ctx = this.ctx;
    ctx.save();
    ctx.shadowColor = 'rgba(43,58,103,.18)';
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 10;
    rr(ctx, OX - 14, OY - 14, this.cols * CELL + 28, this.rows * CELL + 28, 26);
    ctx.fillStyle = 'rgba(255,255,255,.34)';
    ctx.fill();
    ctx.restore();

    ctx.save();
    rr(ctx, OX - 14, OY - 14, this.cols * CELL + 28, this.rows * CELL + 28, 26);
    ctx.strokeStyle = 'rgba(255,255,255,.75)';
    ctx.lineWidth = 2;
    ctx.setLineDash([1, 0]);
    ctx.stroke();
    ctx.restore();

    /* coordinate labels */
    ctx.save();
    ctx.font = '800 13px ' + FONT;
    ctx.fillStyle = C.inkFaint;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (var c = 0; c < this.cols; c++) {
      ctx.fillText(B.name(c, this.cols).replace(/\d+$/, ''), OX + c * CELL + CELL / 2, OY - 28);
    }
    ctx.textAlign = 'center';
    for (var r = 0; r < this.rows; r++) {
      ctx.fillText(String(r + 1), OX - 30, OY + r * CELL + CELL / 2);
    }
    ctx.restore();
  };

  Scene.prototype.tileColor = function (terrain, phase) {
    switch (terrain) {
      case B.TERRAIN.MOUNTAIN: return C.tileMountain;
      case B.TERRAIN.STORM: return C.tileStorm;
      case B.TERRAIN.SEA: return C.tileSea;
    }
    switch (phase) {
      case 1: return C.tileFrontier;
      case 2: return C.tileVisited;
      case 3: return C.tilePath;
    }
    return C.tileIdle;
  };

  Scene.prototype.drawTiles = function (frame, now) {
    var ctx = this.ctx, terrain = this.model.terrain;
    var N = this.cols * this.rows;
    var phase = frame ? frame.phase : null;
    for (var id = 0; id < N; id++) {
      var q = this.cellRect(id);
      var x = q.x + 3, y = q.y + 3, w = q.w - 6, h = q.h - 6;
      var ph = phase ? phase[id] : 0;
      var isCurrent = frame && frame.current === id;
      var isFocus = frame && frame.focus === id;
      var isObstacle = B.isBlockedCell(terrain, id);

      ctx.save();
      rr(ctx, x, y, w, h, 11);
      ctx.fillStyle = this.tileColor(terrain[id], isCurrent ? 0 : ph);
      ctx.fill();
      ctx.strokeStyle = isObstacle ? 'rgba(43,58,103,.22)' : C.tileLine;
      ctx.lineWidth = 1.4;
      ctx.stroke();

      if (!isObstacle) {
        if (isCurrent) {
          ctx.fillStyle = C.tileCurrent;
          ctx.fill();
          var pulse = .5 + .5 * Math.sin(now / 220);
          ctx.shadowColor = 'rgba(255,120,170,' + (.55 + .35 * pulse) + ')';
          ctx.shadowBlur = 16 + pulse * 12;
          ctx.strokeStyle = 'rgba(255,255,255,.95)';
          ctx.lineWidth = 2.6;
          ctx.stroke();
          ctx.shadowBlur = 0;
        } else if (ph === 1) {
          ctx.strokeStyle = 'rgba(240,180,41,' + (.55 + .3 * Math.sin(now / 300 + id)) + ')';
          ctx.lineWidth = 2.4;
          ctx.setLineDash([5, 5]);
          ctx.lineDashOffset = -now / 60;
          ctx.stroke();
          ctx.setLineDash([]);
        } else if (ph === 3) {
          ctx.strokeStyle = 'rgba(255,255,255,.95)';
          ctx.lineWidth = 2.2;
          ctx.stroke();
        } else if (ph === 2) {
          ctx.strokeStyle = 'rgba(63,191,143,.6)';
          ctx.lineWidth = 1.8;
          ctx.stroke();
        }
      }
      ctx.restore();

      /* focus halo for the node being discovered */
      if (isFocus && frame.t === 'enqueue') {
        ctx.save();
        rr(ctx, x - 3, y - 3, w + 6, h + 6, 13);
        ctx.strokeStyle = 'rgba(63,191,143,' + (.9) + ')';
        ctx.lineWidth = 3;
        ctx.shadowColor = 'rgba(63,191,143,.9)';
        ctx.shadowBlur = 14;
        ctx.stroke();
        ctx.restore();
      }

      /* visited tick */
      if (ph === 2 && !isCurrent) {
        ctx.save();
        ctx.strokeStyle = 'rgba(31,122,91,.85)';
        ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(x + w / 2 - 7, y + h / 2 + 1);
        ctx.lineTo(x + w / 2 - 1.5, y + h / 2 + 6);
        ctx.lineTo(x + w / 2 + 7, y + h / 2 - 6);
        ctx.stroke();
        ctx.restore();
      }
      /* frontier dot */
      if (ph === 1 && !isCurrent) {
        ctx.save();
        ctx.fillStyle = '#B98A00';
        ctx.beginPath();
        ctx.arc(x + w - 9, y + 9, 4.4, 0, 7);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.9)';
        ctx.lineWidth = 1.6; ctx.stroke();
        ctx.restore();
      }
    }
  };

  Scene.prototype.drawTerrain = function (now) {
    var ctx = this.ctx, terrain = this.model.terrain, N = this.cols * this.rows;
    for (var id = 0; id < N; id++) {
      var q = this.cellRect(id);
      var cx = q.x + q.w / 2, cy = q.y + q.h / 2;
      var t = terrain[id];
      if (t === B.TERRAIN.MOUNTAIN) this.drawMountain(cx, cy, now, id);
      else if (t === B.TERRAIN.STORM) this.drawStorm(cx, cy, now, id);
      else if (t === B.TERRAIN.ISLAND) this.drawIsl(cx, cy);
      else if (t === B.TERRAIN.BRIDGE) this.drawBridge(cx, cy, now);
      else if (t === B.TERRAIN.SEA) this.drawWaves(cx, cy, now, id);
    }
  };

  Scene.prototype.drawMountain = function (cx, cy, now, id) {
    var ctx = this.ctx, sway = Math.sin(now / 1600 + id) * .6;
    ctx.save();
    ctx.translate(cx, cy + sway);
    ctx.fillStyle = C.mountDark;
    ctx.beginPath(); ctx.moveTo(-22, 14); ctx.lineTo(-4, -16); ctx.lineTo(10, 14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = C.mount;
    ctx.beginPath(); ctx.moveTo(-4, 14); ctx.lineTo(9, -19); ctx.lineTo(23, 14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = C.snow;
    ctx.beginPath(); ctx.moveTo(3, -6); ctx.lineTo(9, -19); ctx.lineTo(15, -6);
    ctx.quadraticCurveTo(9, -10, 3, -6); ctx.closePath(); ctx.fill();
    ctx.restore();
  };

  Scene.prototype.drawStorm = function (cx, cy, now, id) {
    var ctx = this.ctx;
    var flash = Math.sin(now / 420 + id * 2.3);
    ctx.save();
    ctx.translate(cx, cy - 2);
    /* rain */
    ctx.strokeStyle = 'rgba(255,255,255,.7)';
    ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (var i = 0; i < 3; i++) {
      var rx = -12 + i * 12;
      var off = ((now / 9) + i * 9 + id * 13) % 14;
      ctx.globalAlpha = .55;
      ctx.beginPath(); ctx.moveTo(rx, 9 + off * .3); ctx.lineTo(rx - 2, 17 + off * .3); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    /* cloud */
    ctx.fillStyle = C.stormDark;
    ctx.beginPath();
    ctx.ellipse(0, 2, 20, 9.5, 0, 0, 7);
    ctx.ellipse(-12, 4, 11, 7, 0, 0, 7);
    ctx.ellipse(12, 4, 12, 7, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = C.storm;
    ctx.beginPath();
    ctx.ellipse(-1, -3, 16, 10, 0, 0, 7);
    ctx.ellipse(-11, -1, 9, 6.5, 0, 0, 7);
    ctx.ellipse(10, -2, 10, 7, 0, 0, 7);
    ctx.fill();
    if (flash > .93) {
      ctx.fillStyle = '#FFF3B0';
      ctx.beginPath();
      ctx.moveTo(-2, 6); ctx.lineTo(-9, 17); ctx.lineTo(-1, 15);
      ctx.lineTo(-5, 24); ctx.lineTo(7, 12); ctx.lineTo(0, 13); ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  };

  Scene.prototype.drawIsl = function (cx, cy) {
    var ctx = this.ctx;
    ctx.save();
    ctx.translate(cx, cy + 6);
    ctx.fillStyle = 'rgba(43,58,103,.14)';
    ctx.beginPath(); ctx.ellipse(0, 15, 20, 5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = C.islRock;
    ctx.beginPath();
    ctx.moveTo(-19, 0); ctx.quadraticCurveTo(-13, 20, -2, 27);
    ctx.quadraticCurveTo(10, 22, 19, 6); ctx.quadraticCurveTo(20, 1, 19, 0);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = C.islTop;
    ctx.beginPath(); ctx.ellipse(0, 0, 21, 7, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.45)';
    ctx.beginPath(); ctx.ellipse(-5, -2, 8, 3, 0, 0, 7); ctx.fill();
    ctx.restore();
  };

  Scene.prototype.drawBridge = function (cx, cy, now) {
    var ctx = this.ctx;
    ctx.save();
    ctx.translate(cx, cy);
    /* ropes */
    ctx.strokeStyle = C.bridgeDark; ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-24, -13); ctx.quadraticCurveTo(0, -2, 24, -13); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-24, 13); ctx.quadraticCurveTo(0, 24, 24, 13); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-24, -13); ctx.lineTo(-24, 13);
    ctx.moveTo(24, -13); ctx.lineTo(24, 13); ctx.stroke();
    /* planks */
    for (var i = -3; i <= 3; i++) {
      var x = i * 7;
      var sag = (1 - Math.pow(i / 3.4, 2)) * 6;
      ctx.fillStyle = i % 2 ? C.bridge : '#EFCB9F';
      rr(ctx, x - 3, -11 + sag, 6, 22, 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(140,100,60,.35)';
      ctx.lineWidth = .8; ctx.stroke();
    }
    ctx.restore();
  };

  Scene.prototype.drawWaves = function (cx, cy, now, id) {
    var ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.75)';
    ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (var i = 0; i < 2; i++) {
      var yy = cy - 6 + i * 12;
      ctx.beginPath();
      for (var x = -16; x <= 16; x += 4) {
        ctx.lineTo(cx + x, yy + Math.sin((x / 8) + now / 480 + id + i) * 2.4);
      }
      ctx.stroke();
    }
    ctx.restore();
  };

  /* ------------------------------------------------------- airways */
  Scene.prototype.drawAirways = function (frame, now) {
    var ctx = this.ctx, m = this.model, cols = this.cols;

    /* generic faint airway lattice */
    ctx.save();
    ctx.strokeStyle = C.edge;
    ctx.lineWidth = 1.4;
    for (var id = 0; id < this.cols * this.rows; id++) {
      if (B.isBlockedCell(m.terrain, id)) continue;
      var a = this.cellCenter(id);
      var c = B.colOf(id, cols), r = B.rowOf(id, cols);
      if (c + 1 < this.cols) {
        var right = B.idOf(c + 1, r, cols);
        if (!B.isBlockedCell(m.terrain, right) && !m.closedEdges.has(B.edgeKey(id, right))) {
          var b = this.cellCenter(right);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
      if (r + 1 < this.rows) {
        var dn = B.idOf(c, r + 1, cols);
        if (!B.isBlockedCell(m.terrain, dn) && !m.closedEdges.has(B.edgeKey(id, dn))) {
          var d = this.cellCenter(dn);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(d.x, d.y); ctx.stroke();
        }
      }
    }
    ctx.restore();

    /* BFS tree so far */
    if (frame && frame.parent) {
      ctx.save();
      ctx.strokeStyle = C.tree;
      ctx.lineWidth = 3; ctx.lineCap = 'round';
      for (var n = 0; n < frame.parent.length; n++) {
        var p = frame.parent[n];
        if (p < 0 || p === n || frame.phase[n] < 1) continue;
        if (frame.phase[p] < 1) continue;
        var p1 = this.cellCenter(p), p2 = this.cellCenter(n);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      }
      ctx.restore();
    }

    /* the edge currently being traversed */
    if (frame && frame.edge) {
      var e1 = this.cellCenter(frame.edge[0]), e2 = this.cellCenter(frame.edge[1]);
      ctx.save();
      ctx.strokeStyle = frame.t === 'closed' ? 'rgba(240,119,106,.95)' : 'rgba(63,191,143,.95)';
      ctx.lineWidth = 3.4;
      ctx.setLineDash([6, 6]);
      ctx.lineDashOffset = -now / 45;
      ctx.beginPath(); ctx.moveTo(e1.x, e1.y); ctx.lineTo(e2.x, e2.y); ctx.stroke();
      ctx.restore();
    }

    /* closed airways */
    ctx.save();
    var keys = Array.from(m.closedEdges);
    for (var k = 0; k < keys.length; k++) {
      var parts = keys[k].split('|');
      var A = +parts[0], Z = +parts[1];
      if (A >= this.cols * this.rows || Z >= this.cols * this.rows) continue;
      var q1 = this.cellCenter(A), q2 = this.cellCenter(Z);
      var mx = (q1.x + q2.x) / 2, my = (q1.y + q2.y) / 2;
      ctx.strokeStyle = 'rgba(240,119,106,.9)';
      ctx.lineWidth = 3;
      ctx.setLineDash([7, 6]);
      ctx.beginPath(); ctx.moveTo(q1.x, q1.y); ctx.lineTo(q2.x, q2.y); ctx.stroke();
      ctx.setLineDash([]);
      /* barrier bar + x */
      var ang = Math.atan2(q2.y - q1.y, q2.x - q1.x) + Math.PI / 2;
      ctx.save();
      ctx.translate(mx, my); ctx.rotate(ang);
      ctx.fillStyle = 'rgba(255,255,255,.95)';
      rr(ctx, -13, -7, 26, 14, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(240,119,106,.95)'; ctx.lineWidth = 2;
      rr(ctx, -13, -7, 26, 14, 7); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-5, -4); ctx.lineTo(5, 4); ctx.moveTo(5, -4); ctx.lineTo(-5, 4);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  };

  /* ----------------------------------------------------- the route */
  Scene.prototype.drawPath = function (frame, now) {
    if (!frame || !frame.path || frame.path.length < 2) return;
    var ctx = this.ctx, pts = [];
    for (var i = 0; i < frame.path.length; i++) pts.push(this.cellCenter(frame.path[i]));

    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(79,169,222,.95)';
    ctx.shadowBlur = 22;
    ctx.strokeStyle = 'rgba(79,169,222,.95)';
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 9]);
    ctx.lineDashOffset = -now / 42;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  };

  /* ---------------------------------------------------- airports */
  Scene.prototype.drawAirports = function (now) {
    var m = this.model;
    this.drawAirport(m.start, 'DEPART', C.coral, false, now);
    this.drawAirport(m.goal, 'ARRIVE', C.gold, true, now);
  };

  Scene.prototype.drawAirport = function (id, label, color, star, now) {
    var ctx = this.ctx, c = this.cellCenter(id);
    var bob = Math.sin(now / 620 + id) * 1.4;

    ctx.save();
    ctx.translate(c.x, c.y + bob);

    if (star) {
      /* arrival pad */
      ctx.shadowColor = 'rgba(43,58,103,.3)';
      ctx.shadowBlur = 10;
      ctx.fillStyle = 'rgba(255,255,255,.97)';
      ctx.beginPath(); ctx.arc(0, 0, 13.5, 0, 7); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3.2;
      ctx.beginPath(); ctx.arc(0, 0, 13.5, 0, 7); ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      for (var i = 0; i < 10; i++) {
        var ang = -Math.PI / 2 + i * Math.PI / 5;
        var rad = i % 2 ? 3.6 : 8.4;
        ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
      }
      ctx.closePath(); ctx.fill();
    } else {
      /* departure runway — the plane parks just above it */
      ctx.fillStyle = 'rgba(43,58,103,.13)';
      ctx.beginPath(); ctx.ellipse(0, 22, 19, 4.5, 0, 0, 7); ctx.fill();

      ctx.shadowColor = 'rgba(43,58,103,.24)';
      ctx.shadowBlur = 8;
      ctx.fillStyle = 'rgba(255,255,255,.97)';
      rr(ctx, -19, 9, 38, 12, 6); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.4;
      rr(ctx, -19, 9, 38, 12, 6); ctx.stroke();

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(-14, 15); ctx.lineTo(14, 15); ctx.stroke();
      ctx.setLineDash([]);

      /* windsock */
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(-16, 9); ctx.lineTo(-16, -3); ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(-16, -3); ctx.lineTo(-7, -6); ctx.lineTo(-7, 0); ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    /* label chip under the cell */
    ctx.save();
    ctx.font = '800 9.5px ' + FONT;
    var txt = label + ' ' + B.name(id, this.cols);
    var w = ctx.measureText(txt).width + 14;
    var lx = c.x - w / 2, ly = c.y + 24;
    rr(ctx, lx, ly, w, 15, 7.5);
    ctx.fillStyle = 'rgba(43,58,103,.92)';
    ctx.fill();
    ctx.fillStyle = star ? '#FFE8A8' : '#FFD2CB';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, c.x, ly + 8);
    ctx.restore();
  };

  /* --------------------------------------------------- the plane */
  Scene.prototype.planeShape = function (ctx, x, y, ang, scale, body, flipY) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.scale(scale, scale * (flipY || 1));
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2.2;

    /* far wing — drawn first so the fuselage covers its root */
    ctx.fillStyle = '#FFCBBF';
    ctx.beginPath();
    ctx.moveTo(-7, 1); ctx.lineTo(-1, 17); ctx.lineTo(13, 13); ctx.lineTo(6, -2);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    /* tail fin */
    ctx.fillStyle = '#FF8E7E';
    ctx.beginPath();
    ctx.moveTo(-14, -1); ctx.lineTo(-17, -15); ctx.lineTo(-6, -7);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    /* rear stabiliser */
    ctx.beginPath();
    ctx.moveTo(-12, 2); ctx.lineTo(-21, 10); ctx.lineTo(-9, 9);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    /* fuselage */
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-19, 0);
    ctx.quadraticCurveTo(-17, -9, -1, -10);
    ctx.quadraticCurveTo(14, -11, 21, -3);
    ctx.quadraticCurveTo(25, 0, 21, 3);
    ctx.quadraticCurveTo(14, 10, -1, 10);
    ctx.quadraticCurveTo(-17, 9, -19, 0);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    /* nose cone */
    ctx.fillStyle = '#FF8E7E';
    ctx.beginPath();
    ctx.moveTo(17, -7); ctx.quadraticCurveTo(28, -3, 25, 0);
    ctx.quadraticCurveTo(28, 3, 17, 7);
    ctx.quadraticCurveTo(21, 0, 17, -7);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    /* near wing — chunky quad so the outline never eats the fill */
    ctx.fillStyle = '#FF9A8B';
    ctx.beginPath();
    ctx.moveTo(-7, -2); ctx.lineTo(-1, -19); ctx.lineTo(13, -15); ctx.lineTo(7, 2);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    /* cockpit window */
    ctx.fillStyle = '#EAF6FF';
    ctx.beginPath(); ctx.arc(7, -2, 5.6, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.ink;
    ctx.beginPath(); ctx.arc(7.5, -2, 2, 0, 7); ctx.fill();

    ctx.restore();
  };

  Scene.prototype.drawPlane = function (view, now) {
    var m = this.model;
    if (!m) return;
    var ctx = this.ctx;
    var path = view.frame && view.frame.path;
    var pos, ang = 0, scale = 1, flip = 1;

    if (this.plane.mode === 'fly' && path && path.length > 1) {
      var pts = [];
      for (var i = 0; i < path.length; i++) pts.push(this.cellCenter(path[i]));
      var segLens = [], total = 0;
      for (var k = 1; k < pts.length; k++) {
        var d = Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
        segLens.push(d); total += d;
      }
      var target = ease(Math.min(1, Math.max(0, this.plane.t))) * total;
      var acc = 0, idx = 0;
      for (idx = 0; idx < segLens.length; idx++) {
        if (acc + segLens[idx] >= target) break;
        acc += segLens[idx];
      }
      if (idx >= segLens.length) idx = segLens.length - 1;
      var seg = segLens[idx] || 1;
      var f = (target - acc) / seg;
      var p1 = pts[idx], p2 = pts[idx + 1] || p1;
      pos = { x: lerp(p1.x, p2.x, f), y: lerp(p1.y, p2.y, f) };
      ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      scale = 1.06;
      if (ang > Math.PI / 2 || ang < -Math.PI / 2) flip = -1;
    } else {
      pos = this.cellCenter(m.start);
      pos = { x: pos.x, y: pos.y - 13 + Math.sin(now / 560) * 3 };
      ang = Math.sin(now / 900) * .13;
      if (this.plane.mode === 'sad') ang = .3;
    }

    ctx.save();
    /* shadow */
    ctx.globalAlpha = .16;
    ctx.fillStyle = C.ink;
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y + 15, 15, 4.5, 0, 0, 7);
    ctx.fill();
    ctx.globalAlpha = 1;
    var base = this.plane.mode === 'fly' ? .84 : .58;
    this.planeShape(ctx, pos.x, pos.y, ang, base * scale, '#FFF1EC', flip);
    ctx.restore();
  };

  /* -------------------------------------------------- cursor/hover */
  Scene.prototype.drawCursor = function (view, now) {
    var ctx = this.ctx;
    if (view.hover != null && view.hover >= 0 && view.hover !== view.cursor) {
      var q = this.cellRect(view.hover);
      ctx.save();
      rr(ctx, q.x + 1, q.y + 1, q.w - 2, q.h - 2, 11);
      ctx.strokeStyle = 'rgba(43,58,103,.45)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
    if (view.cursor == null || view.cursor < 0 || !view.cursorVisible) return;
    var p = this.cellRect(view.cursor);
    ctx.save();
    var ph = 1 + Math.sin(now / 340) * .5;
    rr(ctx, p.x - 1, p.y - 1, p.w + 2, p.h + 2, 12);
    ctx.strokeStyle = 'rgba(43,58,103,.95)';
    ctx.lineWidth = 2.6;
    ctx.setLineDash([7, 5]);
    ctx.lineDashOffset = -now / 55;
    ctx.stroke();
    ctx.setLineDash([]);
    /* corner ticks */
    ctx.strokeStyle = 'rgba(255,255,255,.95)';
    ctx.lineWidth = 3;
    var m = 6, L = 9;
    [[p.x + m, p.y + m, 1, 1], [p.x + p.w - m, p.y + m, -1, 1],
     [p.x + m, p.y + p.h - m, 1, -1], [p.x + p.w - m, p.y + p.h - m, -1, -1]]
      .forEach(function (c) {
        ctx.beginPath();
        ctx.moveTo(c[0] + c[2] * L, c[1]);
        ctx.lineTo(c[0], c[1]);
        ctx.lineTo(c[0], c[1] + c[3] * L);
        ctx.stroke();
      });
    /* name chip (airports already wear their own label) */
    if (view.cursor !== this.model.start && view.cursor !== this.model.goal) {
      ctx.font = '800 11px ' + FONT;
      var txt = B.name(view.cursor, this.cols);
      var w = ctx.measureText(txt).width + 12;
      var cx = p.x + p.w / 2 - w / 2;
      var cy = Math.max(6, p.y - 9 - ph);
      rr(ctx, cx, cy, w, 16, 8);
      ctx.fillStyle = C.ink; ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, cx + w / 2, cy + 8.5);
    }
    ctx.restore();

    /* airway-tool pending selection */
    if (view.airwayFirst != null && view.airwayFirst >= 0) {
      var a = this.cellRect(view.airwayFirst);
      ctx.save();
      rr(ctx, a.x, a.y, a.w, a.h, 11);
      ctx.fillStyle = 'rgba(240,119,106,.28)';
      ctx.fill();
      ctx.strokeStyle = '#F0776A';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }
  };

  Scene.prototype.drawParticles = function () {
    var ctx = this.ctx;
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.fillStyle = p.color;
      ctx.translate(p.x, p.y);
      if (p.spin) ctx.rotate(p.spin);
      if (p.star) {
        ctx.beginPath();
        for (var k = 0; k < 8; k++) {
          var ang = k * Math.PI / 4;
          var rad = k % 2 ? p.size * .42 : p.size;
          ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
        }
        ctx.closePath(); ctx.fill();
      } else {
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * .8);
      }
      ctx.restore();
    }
  };

  /* ============================================================ draw */
  Scene.prototype.draw = function (view, now, dt) {
    var ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);
    this.drawSky(now);
    this.drawPanel();
    if (this.model) {
      this.drawTiles(view.frame, now);
      this.drawAirways(view.frame, now);
      this.drawPath(view.frame, now);
      this.drawTerrain(now);
      this.drawCursor(view, now);
      this.drawAirports(now);
      this.drawPlane(view, now);
    }
    this.updateParticles(dt);
    this.drawParticles();
  };

  root.SkyScene = Scene;
  root.SkyScene.METRICS = { W: W, H: H, OX: OX, OY: OY, CELL: CELL };
}(window));
