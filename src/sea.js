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
    riseRate: 0.3,       // 水位上涨速率 /s：海面是慢慢涨起来的，不是一句话顶上去
    fallRate: 0.14,      // 海水退速 /s：涨得快退得慢？这里反过来——退得更慢
    floatK: [2.0, 4.6], // 每条弹幕跟水位的缓动速率 /s（区间内随机，所以不是一片齐步走）
    floatMax: 150,     // 但每秒最多挪这么多 px：水塌了也是滑下去，不是砸下去
    ebbSpeed: 2.6,     // 强制退潮时弹幕漂走的速度倍数
    ebbRate: 0.55,     // 强制退潮时的水位下降速率 /s
    giftVol: 5,        // 一条小鱼干直接倒进海里的体积，单位同「一条弹幕」
    extraMax: 14,      // 打赏攒出来的「额外水」上限，免得点两下就洪灾
    extraMelt: 0.9,    // 额外水每 /s 化掉多少，打赏是水不是永动机
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

  /* 打赏物品：形状全部是这里现画的内联 SVG（原创，无外链、无字体图标）
     w/h 必须和 CSS 里 .dm--gift 的尺寸对齐，否则碰撞与吞食半径会算歪 */
  var GIFT = {
    heart: {
      label: '爱心', w: 28, h: 26, tip: '爱心：她吃下去以后跑得更快，可叠三层',
      svg: '<svg viewBox="0 0 28 26" aria-hidden="true"><path d="M14 24.4C6.4 18.9 1.4 14.4 1.4 9.5 1.4 5.4 4.6 2.2 8.5 2.2c2.4 0 4.5 1.2 5.5 3.1 1-1.9 3.1-3.1 5.5-3.1 3.9 0 7.1 3.2 7.1 7.3 0 4.9-5 9.4-12.6 14.9z" fill="#ffb3c7" stroke="#17304b" stroke-width="2" stroke-linejoin="round"/><path d="M6.6 6.4C5 7.7 4 9.4 3.9 11.3" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".85"/></svg>'
    },
    choco: {
      label: '巧克力', w: 30, h: 24, tip: '巧克力：她吃下去以后戴上墨镜，可叠三层',
      svg: '<svg viewBox="0 0 30 24" aria-hidden="true"><rect x="2" y="3" width="26" height="18" rx="3" fill="#9b5f33" stroke="#17304b" stroke-width="2"/><rect x="4" y="5" width="22" height="4" rx="2" fill="#b8784a" opacity=".9"/><path d="M11 3v18M20 3v18M2 13h26" stroke="#17304b" stroke-width="1.3" opacity=".45"/><path d="M25.5 6.5l2 2-2 2" fill="none" stroke="#17304b" stroke-width="1.6" stroke-linecap="round" opacity=".55"/></svg>'
    },
    fish: {
      label: '小鱼干', w: 34, h: 20, tip: '小鱼干：不用等她张嘴，海直接涨水',
      svg: '<svg viewBox="0 0 34 20" aria-hidden="true"><path d="M2.5 10c3-5 9.5-7.2 15.5-6.2 4 .7 7.2 2.8 8.5 6.2-1.3 3.4-4.5 5.5-8.5 6.2C12 17.2 5.5 15 2.5 10z" fill="#e6c78d" stroke="#17304b" stroke-width="2" stroke-linejoin="round"/><path d="M26.6 10l6-5.4c-.8 3.6-.8 7.2 0 10.8z" fill="#d9b375" stroke="#17304b" stroke-width="2" stroke-linejoin="round"/><circle cx="8" cy="8.6" r="1.5" fill="#17304b"/><path d="M13.5 5.6l2.4 8.8M18.6 5.6L21 14.4" stroke="#17304b" stroke-width="1.3" stroke-linecap="round" opacity=".4"/></svg>'
    }
  };
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
    var extra = 0;                 // 打赏倒进来的额外水（按「条」计），会自己化掉
    var live = [];                 // 活跃弹幕
    var bubbles = [];
    var pool = [];                 // 复用的气泡节点
    var ob = null;                 // 鲸鱼碰撞体 {x,y,rx,ry,on}
    var beached = false;
    var drowned = false;
    var ebbing = false;              // 强制退潮开关：开了就不环流，字真的漂走
    var drag = null;                 // 正在被手指捏着的那条弹幕 {b, dx, dy, id}
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

    /* 落轨：不许叠在同一条轨道上排成一串糖葫芦。
       找一条「右端最空」的轨道，排在它队尾；队伍还没进屏就从屏幕右边接着排。
       水面慢慢涨的时候轨道数很少，随机分配会把一整批弹幕糊成一行，所以必须排队。 */
    function placeInLane(b) {
      var lanes = laneCount();
      var right = [], i;
      for (i = 0; i < lanes; i++) right[i] = -Infinity;
      for (i = 0; i < live.length; i++) {
        var o = live[i];
        if (o === b || o.dying) continue;
        var lc = clamp(o.lane, 0, Math.max(0, lanes - 1));
        if (o.x + o.w > right[lc]) right[lc] = o.x + o.w;
      }
      var best = 0, bestRight = Infinity;
      for (i = 0; i < lanes; i++) if (right[i] < bestRight) { bestRight = right[i]; best = i; }
      if (lanes < 1) { best = 0; bestRight = -Infinity; }
      b.lane = best;
      b.x = Math.max(W + 12, (bestRight === -Infinity ? 0 : bestRight) + 26);
      b.fy = laneY(best) - b.h / 2;
      return b;
    }

    /* ---------- 弹幕 ---------- */

    function mkBullet(item) {
      var el = document.createElement('div');
      var g = item.gift ? GIFT[item.gift] : null;
      var style = item.style || pick(KIND);
      el.className = 'dm' + (item.self ? ' dm--self' : '') + (item.spark ? ' dm--spark' : '') + (g ? ' dm--gift' : '');
      el.setAttribute('data-dm-style', g ? 'gift' : style);
      if (g) el.setAttribute('data-gift', item.gift);
      var nick = item.nick ? '<span class="dm-nick">' + esc(item.nick) + '</span>' : '';
      el.innerHTML = g ? g.svg : nick + '<span class="dm-text">' + esc(item.text) + '</span>';
      field.appendChild(el);

      var px = fontPx();
      var w = g ? g.w : textW(item.text, px) + 22 + (item.nick ? textW(item.nick, px) * 0.78 + 8 : 0);
      var b = {
        id: ++seedSeq, el: el, text: item.text, nick: item.nick || '', self: !!item.self,
        gift: item.gift || null,
        w: w, h: g ? g.h : px * 1.5, x: W + 12, lane: 0,
        fy: 0, fk: rnd(TUNE.floatK[0], TUNE.floatK[1]),
        oy: 0, vy: 0, rot: 0, s: 1, dying: 0, phase: rnd(0, 6.28), v: TUNE.speed * rnd(0.9, 1.15)
      };
      placeInLane(b);
      live.push(b);
      /* 同屏超载时挤掉最老的一条，但绝不用观众自己发的那条、也不用你正捏着的那条垫背 */
      if (live.length > TUNE.maxLive) {
        var kill = -1;
        for (var i = 0; i < live.length - 1; i++) if (!live[i].self && !live[i].held) { kill = i; break; }
        if (kill >= 0) drop(live[kill]);
      }
      return b;
    }

    function drop(b) {
      if (!b || b.dead) return;
      if (drag && drag.b === b) drag = null;
      b.held = false;
      b.dead = true;
      if (b.el.parentNode) b.el.parentNode.removeChild(b.el);
      var k = live.indexOf(b);
      if (k >= 0) live.splice(k, 1);
    }

    function push(item) {
      var text = String(item == null ? '' : (item.text || item)).replace(/\s+/g, ' ').trim();
      if (!text) return null;
      if (text.length > TUNE.maxChars) text = text.slice(0, TUNE.maxChars) + '…';
      /* 水位不在这里跳：一条弹幕只是往账上记一笔，海面由 stepWater 慢慢追上去 */
      var b = mkBullet({ text: text, nick: item.nick, style: item.style, self: item.self, spark: item.spark });
      return b;
    }

    /* ---------- 打赏 ----------
       礼物本身也是一条弹幕（形状见 GIFT），飘进她嘴里才算送到；
       只有小鱼干例外：它是直接倒进海里的水，不用等她张口。 */

    function pour(units) {
      extra = clamp(extra + (units || 0), 0, TUNE.extraMax);
      fire('pour', { extra: Math.round(extra * 10) / 10 });
      return extra;
    }

    /* 递到她眼前：落在她嘴边那条轨道、她右手边——弹幕从右往左流，所以她一定撞得上去 */
    function aimAtMouth(b) {
      if (!ob || !ob.on) return b;
      var lanes = laneCount(), best = b.lane, bd = Infinity;
      for (var i = 0; i < lanes; i++) {
        var d = Math.abs(laneY(i) - (ob.y + ob.ry * 0.22));
        if (d < bd) { bd = d; best = i; }
      }
      b.lane = best;
      b.x = Math.min(W + 12, ob.x + Math.max(ob.rx, 60) + 46);
      b.fy = laneY(best) - b.h / 2;
      return b;
    }

    function gift(kind, opts) {
      var g = GIFT[kind];
      if (!g) return null;
      opts = opts || {};
      var b = aimAtMouth(mkBullet({ text: g.label, gift: kind, self: !!opts.self }));
      if (kind === 'fish') pour(TUNE.giftVol);
      fire('gift', { kind: kind, label: g.label, self: !!opts.self });
      return b;
    }

    /* 鲸鱼张嘴：把嘴范围内最近的几条吸进来 */
    function bite(x, y, r) {
      var hits = [];
      for (var i = 0; i < live.length; i++) {
        var b = live[i];
        if (b.dying || b.held) continue;   // 被你捏着的那条不算她吃的，得等你松手
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
        out.push({ text: h.text, nick: h.nick, self: h.self, gift: h.gift });
      }
      return out;
    }

    function stepBullets(dt) {
      var lanes = laneCount();
      for (var i = live.length - 1; i >= 0; i--) {
        var b = live[i];
        if (b.held) continue;               // 被人用手指捏着，水流暂时管不着她
        b.x -= b.v * (ebbing ? TUNE.ebbSpeed : 1) * dt;

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

        if (b.x + b.w < -20) {
          if (ebbing) { drop(b); continue; }   // 强制退潮：开片的字真的走掉，不再回流
          placeInLane(b);                       // 环流：飘出左边就从右边排回队伍。没被吃掉的弹幕不许消失
          b.phase = rnd(0, 6.28);
          b.oy = 0; b.vy = 0; b.rot = 0;
        }

        var base = b.dying ? 0 : (reduced ? 0 : Math.sin(performance.now() / 1000 * 1.6 + b.phase) * 1.6);
        var wantY = laneY(clamp(b.lane, 0, Math.max(0, lanes - 1))) - b.h / 2 + b.oy + base;
        /* 水位动了，字不是被整片抬上去：每条按自己的缓动浮过去，看着才像泡在水里 */
        if (b.dying) b.fy = wantY;
        else {
          var dy0 = (wantY - b.fy) * (1 - Math.exp(-b.fk * dt));
          var cap = TUNE.floatMax * dt;
          b.fy += dy0 > cap ? cap : dy0 < -cap ? -cap : dy0;
        }
        setVar(b.el, '--x', Math.round(b.x * 10) / 10 + 'px');
        setVar(b.el, '--y', Math.round(b.fy * 10) / 10 + 'px');
        setVar(b.el, '--rot', (Math.round(b.rot * 10) / 10) + 'deg');
        setVar(b.el, '--s', (Math.round(b.s * 100) / 100));
        /* 水退干了也不删节点：laneY(0) 落在海床那条沙上，字就摊在滩上，等下一场水 */
      }
    }

    /* ---------- 用手把一条弹幕拖进她嘴里 ---------- */

    function bulletByEl(el) {
      for (var i = 0; i < live.length; i++) if (live[i].el === el) return live[i];
      return null;
    }

    function onDown(e) {
      var el = e.target && e.target.closest ? e.target.closest('.dm') : null;
      if (!el) return;
      var b = bulletByEl(el);
      if (!b || b.dying) return;
      var r = field.getBoundingClientRect();
      drag = { b: b, id: e.pointerId, dx: e.clientX - r.left - b.x, dy: e.clientY - r.top - b.fy };
      b.held = true;
      b.el.classList.add('dm--held');
      try { field.setPointerCapture(e.pointerId); } catch (err) { /* 老浏览器不捕获也能拖 */ }
      fire('grab', { text: b.text });
      e.preventDefault();
    }

    function onMove(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var r = field.getBoundingClientRect(), b = drag.b;
      b.x = e.clientX - r.left - drag.dx;
      b.fy = e.clientY - r.top - drag.dy;
      b.oy = 0; b.vy = 0; b.rot = 0; b.s = 1;
      setVar(b.el, '--x', Math.round(b.x * 10) / 10 + 'px');
      setVar(b.el, '--y', Math.round(b.fy * 10) / 10 + 'px');
      setVar(b.el, '--rot', '0deg');
      e.preventDefault();
    }

    function onUp(e) {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      var b = drag.b;
      drag = null;
      b.held = false;
      b.el.classList.remove('dm--held');
      var fed = false;
      if (ob && ob.on) {                       // 落在她身上就算喂：这游戏不该要求你瞄得准
        var cx = b.x + b.w / 2, cy = b.fy + b.h / 2;
        var dx = (cx - ob.x) / (ob.rx * 0.92), dy = (cy - (ob.y + ob.ry * 0.14)) / (ob.ry * 0.92);
        fed = dx * dx + dy * dy <= 1;
      }
      if (fed) {
        b.dying = 0.001; b.tx = ob.x; b.ty = ob.y + ob.ry * 0.22;
        fire('feed', { text: b.text, nick: b.nick, self: b.self, gift: b.gift });
      } else {
        b.lane = clamp(Math.round((b.fy + b.h / 2 - surfaceY() - 8) / rowH() - 0.5), 0, Math.max(0, laneCount() - 1));
      }
      e.preventDefault();
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
      if (extra > 0) extra = Math.max(0, extra - TUNE.extraMelt * dt);   // 打赏倒的水会自己渗掉
      var target = clamp((live.length + extra) * TUNE.volUnit / TUNE.fullVol, 0, 1);
      var rate = ebbing ? TUNE.ebbRate : (target > water ? TUNE.riseRate : TUNE.fallRate);
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

    field.addEventListener('pointerdown', onDown);
    field.addEventListener('pointermove', onMove);
    field.addEventListener('pointerup', onUp);
    field.addEventListener('pointercancel', onUp);

    var api = {
      version: V,
      push: push,
      gift: gift,
      pour: pour,
      extra: function () { return Math.round(extra * 10) / 10; },
      step: step,
      bite: bite,
      bubble: bubble,
      ebb: function (v) { ebbing = v === undefined ? !ebbing : !!v; fire('ebb', { on: ebbing }); return ebbing; },
      ebbing: function () { return ebbing; },
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
      layerHeight: function () { return H; },
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
          if (b.dying || b.held) continue;
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
            rot: Math.round(b.rot * 10) / 10, w: Math.round(b.w), dying: !!b.dying, self: b.self, gift: b.gift
          });
        }
        return out;
      },
      tune: TUNE,
      clear: function () { extra = 0; while (live.length) drop(live[0]); },
      destroy: function () { api.clear(); if (layer.parentNode) layer.parentNode.removeChild(layer); }
    };

    measure();
    layer.style.setProperty('--dm-font', fontPx() + 'px');
    layer.style.setProperty('--sea-floor', TUNE.floorH + 'px');
    layer.style.setProperty('--sea-top', Math.round(surfaceY()) + 'px');
    return api;
  }

  window.WhaleSea = { version: V, create: createSea, tune: TUNE, styles: KIND.slice(), gifts: GIFT, giftKinds: ['heart', 'choco', 'fish'] };
})();
