/* ============================================================
   levels.js — handcrafted maps, level metadata and the
   free-play editor map for Sky Routes.
   Maps are plain ASCII so they are easy to read and tweak:

     .  open sky          ^  mountain (blocked)
     ~  open ocean        s  storm    (blocked)
     o  floating island   =  rope bridge (passable)
   ============================================================ */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./bfs.js'));
  else root.SkyLevels = factory(root.SkyBFS);
}(typeof self !== 'undefined' ? self : this, function (B) {
  'use strict';

  /** closed-airway helper: E(c1,r1,c2,r2) -> edge key */
  function E(c1, r1, c2, r2) {
    return B.edgeKey(B.idOf(c1, r1, 15), B.idOf(c2, r2, 15));
  }

  var LEVELS = [
    /* ------------------------------------------------------- 1 */
    {
      id: 'sunny-crossing',
      badge: 'Level 1',
      name: 'Sunny Crossing',
      brief: 'A calm hop between two sunny islands. One storm sits smack in the middle of the direct airway — watch how BFS widens outward one level at a time and finds the way around on its very first try.',
      tags: ['15 × 9 airspace', '4-way airways', '1 storm · 4 mountains'],
      start: [1, 4],
      goal: [13, 4],
      closed: [],
      map: [
        '...............',
        '..ooo.....ooo..',
        '......^^.......',
        '.o...........o.',
        '.o....s.....o..',
        '.o...........o.',
        '......^^.......',
        '...ooo....oo...',
        '...............'
      ]
    },
    /* ------------------------------------------------------- 2 */
    {
      id: 'storm-front',
      badge: 'Level 2',
      name: 'Storm Front',
      brief: 'A wall of storms and peaks stretches from edge to edge. The only crossing is the little rope bridge at G4. Find it — and notice that BFS never guesses: it simply keeps draining the queue level by level until the bridge pops out.',
      tags: ['Choke point', 'Bridge crossing', 'Edge-to-edge storm wall'],
      start: [1, 7],
      goal: [13, 1],
      closed: [],
      map: [
        '...............',
        '.o...........o.',
        '...............',
        '^^^^^^^=^^^^^^^',
        'sssssss=sssssss',
        '.....ss........',
        '...o.....o.....',
        '.o.............',
        '...............'
      ]
    },
    /* ------------------------------------------------------- 3 */
    {
      id: 'blocked-airways',
      badge: 'Level 3',
      name: 'Blocked Airways',
      brief: 'Four airways are closed for maintenance and the sky is peppered with peaks and storms, so several routes look equally tempting. Only BFS can promise the shortest of them — it explores every route of length k before any route of length k+1.',
      tags: ['4 closed airways', 'Multiple candidate routes', 'Island lattice'],
      start: [1, 1],
      goal: [13, 7],
      closed: [
        E(1, 4, 1, 5),   // left column lane
        E(9, 4, 10, 4),  // mid row shortcut
        E(13, 6, 13, 7), // northern approach to the destination
        E(7, 1, 8, 1)    // top lane past the island chain
      ],
      map: [
        '...............',
        '.o..o..o...o...',
        '..^^....^^.....',
        '.....ss........',
        '.o...o...o...o.',
        '....^^.....^^..',
        '......s...s....',
        '..o......o...o.',
        '...............'
      ]
    },
    /* ------------------------------------------------------- 4 (editor) */
    {
      id: 'free-play',
      badge: 'Free play',
      name: 'Map Editor',
      brief: 'Your own sandbox. Paint storms and mountains, close airways with the airway tool (click one cell, then an adjacent one), move the departure and destination, then run BFS and see what it makes of your sky.',
      tags: ['Editable', 'All tools unlocked', 'Unlimited replays'],
      start: [1, 1],
      goal: [13, 7],
      closed: [],
      editable: true,
      map: [
        '...............',
        '.o...........o.',
        '...............',
        '...............',
        '......o........',
        '...............',
        '...............',
        '.o...........o.',
        '...............'
      ]
    }
  ];

  /** Deep copy of a level -> plain mutable model. */
  function load(index) {
    var src = LEVELS[index];
    var cols = src.map[0].length;
    var rows = src.map.length;
    var terrain = B.parseMap(src.map);
    var start = B.idOf(src.start[0], src.start[1], cols);
    var goal = B.idOf(src.goal[0], src.goal[1], cols);
    var closed = new Set(src.closed.slice());
    return {
      index: index,
      id: src.id,
      badge: src.badge,
      name: src.name,
      brief: src.brief,
      tags: src.tags.slice(),
      cols: cols,
      rows: rows,
      terrain: terrain,
      start: start,
      goal: goal,
      closedEdges: closed,
      original: {
        terrain: Uint8Array.from(terrain),
        start: start,
        goal: goal,
        closedEdges: new Set(closed)
      }
    };
  }

  function restore(model) {
    model.terrain = Uint8Array.from(model.original.terrain);
    model.start = model.original.start;
    model.goal = model.original.goal;
    model.closedEdges = new Set(model.original.closedEdges);
  }

  function clearObstacles(model) {
    var T = B.TERRAIN;
    for (var i = 0; i < model.terrain.length; i++) {
      if (model.terrain[i] === T.MOUNTAIN || model.terrain[i] === T.STORM) model.terrain[i] = T.SKY;
    }
    model.closedEdges = new Set();
  }

  return { LEVELS: LEVELS, load: load, restore: restore, clearObstacles: clearObstacles, E: E };
}));
