/* 弹幕海 kernel · 零依赖 · 单文件 · file:// 直接可跑
   立意：弹幕不是飘在画面上的字，弹幕就是水。没人在说话，海就干了。
   接口契约：JS 只写 --x/--y/--rot/--s 四个变量，transform 的组装全交给 CSS。 */
(function () {
  'use strict';

  var V = '1.0.0';

  /* 这些数字全部来自 docs/design-prompt.md 的「可调数字」一节 */
  var TUNE = {
    volUnit: 1.6,        // 一条弹幕贡献的水体积
    fullVol: 26,         // 满海需要的体积，≈16 条弹幕常驻
    riseRate: 0.9,       // 水位上涨速率 /s
    fallRate: 0.16,      // 海水蒸发速率 /s（来得快去得慢？反过来：涨得快退得慢）
    topPad: 78,          // 水位上限时，海面离屏幕顶的距离
    floorH: 46,          // 海床高度
    beachDepth: 96,      // 水深低于这个数 → 搁浅
    beachBack: 112,      // 水深处回这个数才解除搁浅（迟滞）
    drownAt: 42,         // 同屏弹幕超过 → 淹没
    drownOff: 28,        // 回落到这个数才浮起来
    speed: 62,           // 弹幕恒定速度 px/s
    rowK: 2.1,           // 轨道行高 = 字号 × 2.1
    maxDisp: 26,         // 被鲸鱼身体挤开的位移上限 px
    maxRot: 7,           // 被水流带的倾角上限 deg
    stiff: 0.11,         // 回弹弹簧 stiffness
    damp: 0.78,          // damping
    bubblePer: 6,        // 常态尾迹气泡 /s
    bubbleDrown: 14,     // 被淹没时气泡 /s
    biteN: 3,            // 一口吞几条
    maxLive: 64,         // 同屏弹幕上限
    maxChars: 60,        // 单条最长字符，超出截断
    face: { compact: 12, std: 14, cozy: 17 }
  };

  var STACK = 'system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif';
  var KIND = ['plain', 'bubble', 'spark', 'torn'];
  var ctx = null;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function textW(s, px) {
    if (!ctx) { var c = document.createElement('canvas'); ctx = c.getContext && c.getContext('2d'); }
    if (ctx) { ctx.font = px + 'px ' + STACK; return ctx.measureText(s).width; }
    return s.length * px * 0.62;
  }

  function createSea(opts) {
    opts = opts || {};
    var host = opts.host || document.body;
    var bag = {};

    var layer = document.createElement('div');
    layer.className = 'sea';
    layer.innerHTML =
      '<div class="sea-sky"></div>' +
      '<div class="sea-water"></div>' +
      '<div class="sea-surface"><i></i><i></i></div>' +
      '<div class="sea-bed"></div>' +
      '<div class="sea-field"></div>';
    host.appendChild(layer);
    var field = layer.querySelector('.sea-field');

    var W = 0, H = 0;
    var water = 0.55;              // 0..1，海面在 [topPad, 屏底-海床] 之间的位置
    var live = [];                 // 活跃弹幕
    var bubbles = [];
    var pool = [];                 // 复用的气泡节点
    var ob = null;                 // 鲸鱼碰撞体 {x,y,rx,ry,on}
    var beached = false;
    var drowned = false;
    var emitAcc = 0;
    var face = 'std';
    var reduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    var seedSeq = 0;

    function fontPx() { return TUNE.face[face] || TUNE.face.std; }
    function rowH() { return fontPx() * TUNE.rowK; }
    function seabedY() { return H - TUNE.floorH; }
    function surfaceY() {
      var span = seabedY() - TUNE.topPad;
      return TUNE.topPad + (1 - water) * span;
    }
    function depth() { return seabedY() - surfaceY(); }

    /* 轨道：贴着海面往下排，水退了就一起退 */
    function laneCount() { return Math.max(0, Math.floor((depth() - 10) / rowH())); }
    function laneY(i) { return surfaceY() + 8 + i * rowH() + rowH() / 2; }

    function setVar(el, k, v) { el.style.setProperty(k, v); }

    /* ---------- 弹幕 ---------- */

    function mkBullet(item) {
      var el = document.createElement('div');
      var style = item.style || pick(KIND);
      el.className = 'dm' + (item.self ? ' dm--self' : '') + (item.spark ? ' dm--spark' : '');
      el.setAttribute('data-dm-style', style);
      var nick = item.nick ? '<span class="dm-nick">' + esc(item.nick) + '</span>' : '';
      el.innerHTML = nick + '<span class="dm-text">' + esc(item.text) + '</span>';
      field.appendChild(el);

      var px = fontPx();
      var w = textW(item.text, px) + 22 + (item.nick ? textW(item.nick, px) * 0.78 + 8 : 0);
      var b = {
        id: ++seedSeq, el: el, text: item.text, nick: item.nick || '', self: !!item.self,
        w: w, h: px * 1.5, x: W + 12, lane: (Math.random() * Math.max(1, laneCount())) | 0,
        oy: 0, vy: 0, rot: 0, s: 1, dying: 0, phase: rnd(0, 6.28), v: TUNE.speed * rnd(0.9, 1.15)
      };
      live.push(b);
      /* 同屏超载时挤掉最老的一条，但绝不用观众自己发的那条垫背 */
      if (live.length > TUNE.maxLive) {
        var kill = 0;
        for (var i = 0; i < live.length - 1; i++) if (!live[i].self) { kill = i; break; }
        drop(live[kill]);
      }
      return b;
    }

    function drop(b) {
      if (!b || b.dead) return;
      b.dead = true;
      if (b.el.parentNode) b.el.parentNode.removeChild(b.el);
      var k = live.indexOf(b);
      if (k >= 0) live.splice(k, 1);
    }

    function push(item) {
      var text = String(item == null ? '' : (item.text || item)).replace(/\s+/g, ' ').trim();
      if (!text) return null;
      if (text.length > TUNE.maxChars) text = text.slice(0, TUNE.maxChars) + '…';
      water = clamp(water + TUNE.volUnit / TUNE.fullVol, 0, 1);
      var b = mkBullet({ text: text, nick: item.nick, style: item.style, self: item.self, spark: item.spark });
      return b;
    }

    /* 鲸鱼张嘴：把嘴范围内最近的几条吸进来 */
    function bite(x, y, r) {
      var hits = [];
      for (var i = 0; i < live.length; i++) {
        var b = live[i];
        if (b.dying) continue;
        var cx = b.x + b.w / 2, cy = laneY(clamp(b.lane, 0, Math.max(0, laneCount() - 1))) + b.oy;
        var dx = cx - x, dy = cy - y;
        if (dx * dx + dy * dy <= r * r) hits.push({ b: b, d: dx * dx + dy * dy });
      }
      hits.sort(function (a, c) { return a.d - c.d; });
      var out = [];
      for (var k = 0; k < Math.min(TUNE.biteN, hits.length); k++) {
        var h = hits[k].b;
        h.dying = 0.001;
        h.tx = x; h.ty = y;
        out.push({ text: h.text, nick: h.nick, self: h.self });
      }
      return out;
    }

    function stepBullets(dt) {
      var lanes = laneCount();
      for (var i = live.length - 1; i >= 0; i--) {
        var b = live[i];
        b.x -= b.v * dt;

        /* 被鲸鱼身体挤开：椭圆外的部分算 overlap，径向推出去，靠弹簧回弹 */
        var target = 0;
        if (ob && ob.on && !reduced) {
          var lc = clamp(b.lane, 0, Math.max(0, lanes - 1));
          var by = laneY(lc) + b.oy;
          var dx = (b.x + b.w / 2 - ob.x) / (ob.rx + b.w * 0.34);
          var dy = (by - ob.y) / (ob.ry + b.h * 0.5);
          var rr = dx * dx + dy * dy;
          if (rr < 1.6) {
            var over = 1 - Math.sqrt(rr);
            var dir = dy >= 0 ? 1 : -1;
            if (Math.abs(dy) < 0.06) dir = by > H / 2 ? 1 : -1;
            target = dir * over * (ob.ry * 0.9);
            if (Math.abs(target) > TUNE.maxDisp) target = target > 0 ? TUNE.maxDisp : -TUNE.maxDisp;
          }
        }
        b.vy = (b.vy + (target - b.oy) * TUNE.stiff) * TUNE.damp;
        b.oy += b.vy;
        b.rot = clamp(b.vy * 1.6, -TUNE.maxRot, TUNE.maxRot);

        if (b.dying) {                      // 正在被吞进嘴
          b.dying += dt * 4.2;
          if (b.dying >= 1) { drop(b); continue; }
          b.s = 1 - b.dying;
          var lc2 = clamp(b.lane, 0, Math.max(0, lanes - 1));
          b.oy = b.oy + ((b.ty == null ? 0 : b.ty - laneY(lc2) - b.oy) * 0.28);
          b.x = b.x + ((b.tx == null ? b.x : b.tx - b.w / 2 - b.x) * 0.28);
        }

        if (b.x + b.w < -20) { drop(b); continue; }

        var base = b.dying ? 0 : (reduced ? 0 : Math.sin(performance.now() / 1000 * 1.6 + b.phase) * 1.6);
        setVar(b.el, '--x', Math.round(b.x * 10) / 10 + 'px');
        setVar(b.el, '--y', Math.round((laneY(clamp(b.lane, 0, Math.max(0, lanes - 1))) - b.h / 2 + b.oy + base) * 10) / 10 + 'px');
        setVar(b.el, '--rot', (Math.round(b.rot * 10) / 10) + 'deg');
        setVar(b.el, '--s', (Math.round(b.s * 100) / 100));
        if (lanes < 1) { drop(b); }
      }
    }

    /* ---------- 气泡尾迹 ---------- */

    function bubble(x, y, r) {
      var el = pool.pop() || document.createElement('i');
      el.className = 'dm-bub';
      el.style.setProperty('--r', (r || rnd(3, 8)) + 'px');
      el.style.setProperty('--x', x + 'px');
      el.style.setProperty('--y', y + 'px');
      el.style.setProperty('--drift', rnd(-14, 14).toFixed(1) + 'px');
      field.appendChild(el);
      bubbles.push({ el: el, x: x, y: y, vy: rnd(-52, -26), vx: rnd(-8, 8), life: 0, top: surfaceY() + 4 });
    }

    function stepBubbles(dt) {
      for (var i = bubbles.length - 1; i >= 0; i--) {
        var p = bubbles[i];
        p.life += dt;
        p.y += p.vy * dt;
        p.x += p.vx * dt;
        if (p.y <= p.top || p.life > 3.2) {
          if (p.el.parentNode) p.el.parentNode.removeChild(p.el);
          if (pool.length < 40) pool.push(p.el);
          bubbles.splice(i, 1);
          continue;
        }
        setVar(p.el, '--x', (Math.round(p.x * 10) / 10) + 'px');
        setVar(p.el, '--y', (Math.round(p.y * 10) / 10) + 'px');
      }
    }

    /* ---------- 水位 / 搁浅 / 淹没 ---------- */

    function stepWater(dt) {
      var target = clamp(live.length * TUNE.volUnit / TUNE.fullVol, 0, 1);
      var rate = target > water ? TUNE.riseRate : TUNE.fallRate;
      water = clamp(water + (target - water) * Math.min(1, rate * dt), 0, 1);
      layer.style.setProperty('--sea-top', Math.round(surfaceY()) + 'px');

      var d = depth();
      if (!beached && d < TUNE.beachDepth) { beached = true; fire('beach', { on: true, depth: d }); }
      else if (beached && d > TUNE.beachBack) { beached = false; fire('beach', { on: false, depth: d }); }

      if (!drowned && live.length > TUNE.drownAt) { drowned = true; fire('drown', { on: true, n: live.length }); }
      else if (drowned && live.length < TUNE.drownOff) { drowned = false; fire('drown', { on: false, n: live.length }); }
    }

    function lanes() { return laneCount(); }

    function step(dt) {
      if (!W || !H) measure();
      stepWater(dt);
      stepBullets(dt);
      stepBubbles(dt);
      if (!reduced && ob && ob.on && !beached) {
        var per = drowned ? TUNE.bubbleDrown : TUNE.bubblePer;
        emitAcc += per * dt;
        while (emitAcc >= 1) {
          emitAcc -= 1;
          bubble(ob.x + (Math.random() < .5 ? -1 : 1) * ob.rx * rnd(0.4, 0.9), ob.y + rnd(-ob.ry * 0.4, ob.ry * 0.5));
        }
      } else emitAcc = 0;
    }

    function measure() {
      W = layer.clientWidth || window.innerWidth;
      H = layer.clientHeight || window.innerHeight;
      layer.style.setProperty('--sea-top', Math.round(surfaceY()) + 'px');
    }

    /* ---------- 事件 ---------- */

    function on(name, fn) { (bag[name] || (bag[name] = [])).push(fn); return api; }
    function fire(name, payload) {
      var l = bag[name];
      if (!l) return;
      for (var i = 0; i < l.length; i++) try { l[i](payload); } catch (e) { /* 单个监听炸了不许带走整片海 */ }
    }

    var api = {
      version: V,
      push: push,
      step: step,
      bite: bite,
      bubble: bubble,
      setObstacle: function (o) { ob = o; },
      obstacle: function () { return ob; },
      on: on,
      face: function (f) { if (TUNE.face[f]) { face = f; layer.style.setProperty('--dm-font', fontPx() + 'px'); for (var i = 0; i < live.length; i++) live[i].lane = (Math.random() * Math.max(1, laneCount())) | 0; } return api; },
      resize: measure,
      water: function () { return water; },
      depth: depth,
      surfaceY: surfaceY,
      laneY: function (i) { return laneY(clamp(i, 0, Math.max(0, laneCount() - 1))); },
      layerWidth: function () { return W; },
      seabedY: seabedY,
      lanes: lanes,
      beached: function () { return beached; },
      drowned: function () { return drowned; },
      reduced: function () { return reduced; },
      live: function () { return live.length; },
      nearestBullet: function (x, y, dir, fwd, win) {
        var best = null, bd = Infinity;
        for (var i = 0; i < live.length; i++) {
          var b = live[i];
          if (b.dying) continue;
          var bx = b.x + b.w / 2, by = laneY(clamp(b.lane, 0, Math.max(0, laneCount() - 1))) + b.oy;
          var dx = (bx - x) * dir, dy = by - y;
          if (dx < 10 || dx > fwd || Math.abs(dy) > win) continue;
          var d = dx + Math.abs(dy) * 1.8;
          if (d < bd) { bd = d; best = { x: bx, y: by, text: b.text }; }
        }
        return best;
      },
      probe: function () {
        var out = [];
        for (var i = 0; i < live.length; i++) {
          var b = live[i];
          out.push({
            x: Math.round(b.x), lane: b.lane, oy: Math.round(b.oy * 10) / 10,
            rot: Math.round(b.rot * 10) / 10, w: Math.round(b.w), dying: !!b.dying, self: b.self
          });
        }
        return out;
      },
      tune: TUNE,
      clear: function () { while (live.length) drop(live[0]); },
      destroy: function () { api.clear(); if (layer.parentNode) layer.parentNode.removeChild(layer); }
    };

    measure();
    layer.style.setProperty('--dm-font', fontPx() + 'px');
    layer.style.setProperty('--sea-floor', TUNE.floorH + 'px');
    layer.style.setProperty('--sea-top', Math.round(surfaceY()) + 'px');
    return api;
  }

  window.WhaleSea = { version: V, create: createSea, tune: TUNE, styles: KIND.slice() };
})();
