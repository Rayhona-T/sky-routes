/* ============================================================
   bfs.js — Breadth-First Search engine for Sky Routes
   Pure logic: FIFO queue, visited set, level-by-level walk,
   parent tracking, shortest-path reconstruction and a full
   step-by-step trace used by both Step and Autoplay modes.
   Works in the browser (window.SkyBFS) and in Node (tests).
   ============================================================ */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SkyBFS = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- terrain ---------- */
  var TERRAIN = {
    SKY: 0,      // open air        (passable)
    SEA: 1,      // open ocean      (passable — planes fly over water)
    ISLAND: 2,   // floating island (passable, airports live here)
    MOUNTAIN: 3, // mountain range  (blocked)
    STORM: 4,    // storm cloud     (blocked)
    BRIDGE: 5    // rope bridge     (passable, scenic choke point)
  };
  var TERRAIN_CHAR = { '.': TERRAIN.SKY, '~': TERRAIN.SEA, 'o': TERRAIN.ISLAND,
                       '^': TERRAIN.MOUNTAIN, 's': TERRAIN.STORM, '=': TERRAIN.BRIDGE };
  var CHAR_TERRAIN = ['.', '~', 'o', '^', 's', '='];
  var BLOCKED_TERRAIN = new Uint8Array(6);
  BLOCKED_TERRAIN[TERRAIN.MOUNTAIN] = 1;
  BLOCKED_TERRAIN[TERRAIN.STORM] = 1;

  /* 4-neighbourhood: N, E, S, W */
  var DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

  /* cell id <-> grid helpers --------------------------------- */
  function idOf(c, r, cols) { return r * cols + c; }
  function colOf(id, cols) { return id % cols; }
  function rowOf(id, cols) { return (id / cols) | 0; }
  /** Human readable cell name, e.g. "B7" */
  function name(id, cols) {
    if (id < 0) return '—';
    return String.fromCharCode(65 + colOf(id, cols)) + (rowOf(id, cols) + 1);
  }
  /** canonical undirected edge key */
  function edgeKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }

  function isBlockedCell(terrain, id) { return !!BLOCKED_TERRAIN[terrain[id]]; }

  /** All in-bounds neighbours of a cell (terrain/edge filtering done by caller). */
  function rawNeighbours(id, cols, rows) {
    var c = colOf(id, cols), r = rowOf(id, cols), out = [];
    for (var d = 0; d < 4; d++) {
      var nc = c + DIRS[d][0], nr = r + DIRS[d][1];
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      out.push(idOf(nc, nr, cols));
    }
    return out;
  }

  /** Rebuild a shortest path from the parent map (goal -> start). */
  function reconstruct(parent, goal) {
    var path = [], node = goal, guard = parent.length + 2;
    while (node >= 0 && guard-- > 0) {
      path.push(node);
      if (parent[node] === node) break;          // origin points at itself
      node = parent[node];
    }
    path.reverse();
    return path;
  }

  /* ============================================================
     run(model) -> { frames, path, found, ... }
     model = { cols, rows, start, goal, terrain:Uint8Array|Array,
               closedEdges: Set|Array of edgeKey strings }
     ============================================================ */
  function run(model) {
    var cols = model.cols, rows = model.rows, N = cols * rows;
    var terrain = model.terrain;
    var start = model.start, goal = model.goal;
    var closed = (model.closedEdges instanceof Set)
      ? model.closedEdges
      : new Set(model.closedEdges || []);

    var nm = function (id) { return name(id, cols); };

    /* ---- state ---- */
    var visited = new Uint8Array(N);      // discovered (enqueued) set
    var expanded = new Uint8Array(N);     // dequeued + expanded
    var parent = new Int32Array(N);
    var depth = new Int32Array(N);
    var i;
    for (i = 0; i < N; i++) { parent[i] = -1; depth[i] = -1; }

    var queue = [];                        // *** genuine FIFO queue ***
    var frames = [];
    var discovered = 0, expandedCount = 0, peakQueue = 0;
    var reportedClosed = new Set();
    var found = false, path = null;

    /* phase: 0 unexplored · 1 frontier (in queue) · 2 visited/expanded · 3 final path */
    var phase = new Uint8Array(N);

    function snapshot(extra) {
      var f = {
        t: extra.t,
        current: extra.current === undefined ? -1 : extra.current,
        focus: extra.focus === undefined ? -1 : extra.focus,
        edge: extra.edge || null,
        queue: queue.slice(),
        phase: Uint8Array.from(phase),
        depth: Int32Array.from(depth),
        parent: Int32Array.from(parent),
        path: path ? path.slice() : null,
        discovered: discovered,
        expanded: expandedCount,
        level: extra.level === undefined ? -1 : extra.level,
        text: extra.text
      };
      frames.push(f);
      return f;
    }

    /* ---- 0. seed the queue with the departure airport ---- */
    queue.push(start);
    visited[start] = 1;
    depth[start] = 0;
    parent[start] = start;
    phase[start] = 1;
    discovered = 1;
    peakQueue = 1;
    snapshot({
      t: 'init', current: -1, focus: start, level: 0,
      text: 'Ready at <b>' + nm(start) + '</b>. The queue holds just the origin — level 0 — and every other cell is unexplored.'
    });

    /* ---- main loop: level by level ---- */
    while (queue.length > 0) {
      var node = queue.shift();          // FIFO: front of the queue
      if (expanded[node]) continue;
      expanded[node] = 1;
      expandedCount++;
      phase[node] = 2;

      snapshot({
        t: 'dequeue', current: node, focus: node, level: depth[node],
        text: depth[node] === 0
          ? 'Departing from <b>' + nm(node) + '</b> (level 0) — expanding its open airways.'
          : 'Pulled <b>' + nm(node) + '</b> from the <em>front</em> of the queue (level ' + depth[node] + ') and expanding its open airways.'
      });

      if (node === goal) {
        found = true;
        path = reconstruct(parent, goal);
        for (i = 0; i < path.length; i++) phase[path[i]] = 3;
        snapshot({
          t: 'found', current: node, focus: node, level: depth[node],
          text: 'Destination <b>' + nm(goal) + '</b> popped out at level <span class="hl">' + depth[node] + '</span> hops — the fewest possible. Reversing the chain of parent pointers now.'
        });
        break;
      }

      var nbrs = rawNeighbours(node, cols, rows);
      var added = 0, blockedCount = 0, closedCount = 0, seenCount = 0;

      for (var k = 0; k < nbrs.length; k++) {
        var nb = nbrs[k];

        if (isBlockedCell(terrain, nb)) { blockedCount++; continue; }

        var ek = edgeKey(node, nb);
        if (closed.has(ek)) {
          closedCount++;
          if (!reportedClosed.has(ek)) {
            reportedClosed.add(ek);
            snapshot({
              t: 'closed', current: node, focus: nb, edge: [node, nb],
              text: 'The airway <b>' + nm(node) + '–' + nm(nb) + '</b> is closed, so that neighbour is skipped.'
            });
          }
          continue;
        }

        if (visited[nb]) { seenCount++; continue; }

        /* discover a brand new node */
        visited[nb] = 1;
        parent[nb] = node;
        depth[nb] = depth[node] + 1;
        queue.push(nb);                   // appended to the BACK of the queue
        phase[nb] = 1;
        discovered++;
        added++;
        if (queue.length > peakQueue) peakQueue = queue.length;

        snapshot({
          t: 'enqueue', current: node, focus: nb, level: depth[nb],
          text: 'Found <b>' + nm(nb) + '</b> unvisited → level <span class="hl">' + depth[nb] + '</span> (via ' + nm(node) + '). Pushed to the <em>back</em> of the queue — ' + queue.length + ' waiting.'
        });
      }

      if (added === 0 && (blockedCount + closedCount + seenCount) > 0) {
        var bits = [];
        if (blockedCount) bits.push(blockedCount + ' blocked by storms or mountains');
        if (closedCount) bits.push(closedCount + ' on closed airways');
        if (seenCount) bits.push(seenCount + ' already visited');
        snapshot({
          t: 'blocked', current: node, focus: -1,
          text: 'From <b>' + nm(node) + '</b>: ' + bits.join(', ') + '. Nothing new to add — the queue keeps draining in order.'
        });
      }
    }

    if (!found) {
      snapshot({
        t: 'exhausted', current: -1, level: -1,
        text: 'The queue is empty and <b>' + nm(goal) + '</b> was never reached — storms and closed airways have cut the destination off completely.'
      });
    }

    return {
      frames: frames,
      path: path,
      found: found,
      steps: frames.length - 1,
      discovered: discovered,
      expanded: expandedCount,
      peakQueue: peakQueue,
      cols: cols,
      rows: rows,
      start: start,
      goal: goal
    };
  }

  /* ------------------------------------------------------------
     Reference implementation used by the test-suite: a plain
     BFS returning only the hop distance (or -1 when unreachable).
     ------------------------------------------------------------ */
  function distance(model) {
    var cols = model.cols, rows = model.rows, N = cols * rows;
    var terrain = model.terrain;
    var closed = (model.closedEdges instanceof Set) ? model.closedEdges : new Set(model.closedEdges || []);
    if (model.start === model.goal) return 0;
    var vis = new Uint8Array(N), q = [model.start], dist = new Int32Array(N);
    vis[model.start] = 1; dist[model.start] = 0;
    while (q.length) {
      var n = q.shift();
      var nbrs = rawNeighbours(n, cols, rows);
      for (var i = 0; i < nbrs.length; i++) {
        var b = nbrs[i];
        if (vis[b] || isBlockedCell(terrain, b)) continue;
        if (closed.has(edgeKey(n, b))) continue;
        vis[b] = 1; dist[b] = dist[n] + 1;
        if (b === model.goal) return dist[b];
        q.push(b);
      }
    }
    return -1;
  }

  /** Parse a readable ASCII map into a terrain array. */
  function parseMap(map) {
    var rows = map.length, cols = map[0].length, terrain = new Uint8Array(cols * rows);
    for (var r = 0; r < rows; r++) {
      if (map[r].length !== cols) {
        throw new Error('Map row ' + r + ' has length ' + map[r].length + ', expected ' + cols);
      }
      for (var c = 0; c < cols; c++) {
        var ch = map[r][c];
        if (TERRAIN_CHAR[ch] === undefined) throw new Error('Unknown terrain char "' + ch + '"');
        terrain[idOf(c, r, cols)] = TERRAIN_CHAR[ch];
      }
    }
    return terrain;
  }

  return {
    TERRAIN: TERRAIN,
    TERRAIN_CHAR: TERRAIN_CHAR,
    CHAR_TERRAIN: CHAR_TERRAIN,
    DIRS: DIRS,
    idOf: idOf,
    colOf: colOf,
    rowOf: rowOf,
    name: name,
    edgeKey: edgeKey,
    isBlockedCell: isBlockedCell,
    rawNeighbours: rawNeighbours,
    reconstruct: reconstruct,
    run: run,
    distance: distance,
    parseMap: parseMap
  };
}));
