/* 鲸鱼娘 · 零依赖 · 状态机 + 在水里游的物理
   她的存在条件只有一个：海面以下还有 96px 深的水。 */
(function () {
  'use strict';

  var V = '1.0.0';

  var T = {
    rx: 96, ry: 66,            // 身体椭圆基准（px，会随 --whale-w 缩放）
    swimSpeed: 78, fatSpeed: 40,
    turnRate: 2.6,
    fullPerBite: 14, digest: 2.4, fatAt: 78, maxFull: 100,
    fatScale: 0.34,
    burpEvery: 6.2,
    biteR: 70,
    bobA: 9, bobT: 3.4,
    rethink: 3.1,
    sayTtl: 2.6
  };

  /* 她只听得懂这 6 组词，其余一律歪头 */
  var LEX = [
    { k: ['哈哈', '233', 'xswl', '笑死'], a: 'belly', line: '哈哈哈哈哈哈' },
    { k: ['救命', 'sos', '捞捞', '别沉'], a: 'rescue', line: '我来了！抓紧我的鳍！' },
    { k: ['小鱼干', '投喂', '饿', '吃'], a: 'chase', line: '哪儿呢哪儿呢哪儿呢' },
    { k: ['加油', '冲鸭', '你可以'], a: 'boost', line: '好！(๑•̀ㅂ•́)و✧' },
    { k: ['上岸', '搁浅', '走走'], a: 'surf', line: '上面没有 wifi。' },
    { k: ['离谱', '绷不住', '无语'], a: 'freeze', line: '……' }
  ];
  var UNKNOWN = ['这是什么意思', '嗯？', '听不懂但我大受震撼', '你说话好复杂', '？'];
  var MURMUR = ['水好舒服', '今天也是摸鱼的一天', '我尾巴酸', '再发一条嘛', '咕噜噜噜', '我是这条海的房东', '别挤别挤', '游完这条就休息'];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function pick(a) { return a[(Math.random() * a.length) | 0]; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function createWhale(opts) {
    var el = opts.el;
    var sea = opts.sea;
    var sayEl = opts.say;
    var bag = {}, reduced = sea.reduced();

    var s = {
      x: 0, y: 0, vx: 0, vy: 0, heading: -1, pitch: 0,
      full: 0, fat: 0, eaten: 0, burped: 0,
      base: 'swim', action: null, ttl: 0,
      tx: 0, ty: 0, think: 0, bob: 0, hunt: 0,
      W: 0, H: 0, rx: T.rx, ry: T.ry
    };

    function place() {
      s.W = sea.layerWidth() || window.innerWidth;
      s.H = window.innerHeight;
      var w = el.offsetWidth || T.rx * 2, h = el.offsetHeight || T.ry * 2;
      s.rx = w / 2 * 0.84;
      s.ry = h / 2 * 0.78;
      if (!s.x) { s.x = s.W * 0.42; }
      s.y = clamp(s.y, 0, s.H);
    }

    /* 水面以下的可游区间 */
    function band() {
      var top = sea.surfaceY() + s.ry * 0.62;
      var bottom = sea.seabedY() - s.ry * 0.6;
      if (bottom < top) { var m = (top + bottom) / 2; top = bottom = m; }
      return { top: top, bottom: bottom };
    }

    function setCls(state, face) {
      if (el.className.baseVal !== undefined) el.className.baseVal = 'whale is-' + state;
      else el.setAttribute('class', 'whale is-' + state);
      if (face) el.setAttribute('data-face', face);
      else el.removeAttribute('data-face');
    }

    function fire(n, p) {
      var l = bag[n];
      if (!l) return;
      for (var i = 0; i < l.length; i++) try { l[i](p); } catch (e) { /* 别让一句台词捅死主循环 */ }
    }

    function say(text, ttl, kind) {
      if (!sayEl || !text) return;
      var dur = ttl === undefined ? T.sayTtl : ttl;
      sayEl.textContent = text;
      sayEl.setAttribute('data-kind', kind || 'talk');
      sayEl.style.setProperty('--say-ttl', dur + 's');
      sayEl.classList.remove('on');
      void sayEl.offsetWidth;
      sayEl.classList.add('on');
      fire('say', { text: text, kind: kind || 'talk' });
      if (dur > 0) window.setTimeout(function () { sayEl.classList.remove('on'); }, dur * 1000);
    }

    function act(name, ttl, face) {
      s.action = name; s.ttl = ttl; s.face = face || null;
    }

    function speedNow() {
      var sp = lerp(T.swimSpeed, T.fatSpeed, s.fat);
      if (s.action === 'boost') sp *= 1.85;
      if (s.action === 'chase') sp *= 1.5;
      if (s.action === 'freeze') sp = 0;
      return sp;
    }

    function rethink(dt) {
      if (s.action === 'rescue' || s.action === 'chase') return;   // 这两种由目标弹幕接管
      if (Math.abs(s.tx - s.x) > 40) return;                        // 没到对岸就一路游到底
      s.think -= dt;
      if (s.think > 0) return;                                      // 到岸歇一口气再出发
      s.think = T.rethink * (0.3 + Math.random() * 0.5);
      var b = band();
      var toLeft = s.x > s.W * 0.5;
      s.tx = toLeft ? s.W * (0.06 + Math.random() * 0.1) : s.W * (0.84 + Math.random() * 0.1);
      s.ty = b.top + Math.random() * Math.max(1, b.bottom - b.top);
    }

    function drive(dt) {
      var sp = speedNow();
      var b = band();
      if (s.action === 'rescue' || s.action === 'chase') {
        var t = s.markTarget;
        if (!t || t.dead) { act(null, 0, null); s.markTarget = null; }
        else { s.tx = t.x + t.w / 2; s.ty = sea.laneY(t.lane) + (t.oy || 0); }
      }
      s.ty = clamp(s.ty, b.top, b.bottom);
      s.tx = clamp(s.tx, s.rx, s.W - s.rx);
      if (sp <= 0) { s.vx *= 0.6; s.vy *= 0.6; }
      else {
        var dx = s.tx - s.x, dy = s.ty - s.y;
        var d = Math.sqrt(dx * dx + dy * dy) || 1;
        var want = { x: dx / d * sp, y: dy / d * sp * 0.75 };
        var k = Math.min(1, T.turnRate * dt);
        s.vx = lerp(s.vx, want.x, k);
        s.vy = lerp(s.vy, want.y, k);
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.x = clamp(s.x, s.rx, s.W - s.rx);
      s.y = clamp(s.y, b.top, b.bottom);
      if (Math.abs(s.vx) > 6) s.heading = s.vx > 0 ? 1 : -1;
      s.pitch = clamp(s.vy * 0.09 + s.heading * 4, -13, 13);
    }

    /* 张嘴吞弹幕。有动作在演的时候不抢戏，免得关键词反应被一口吞打断 */
    function munch() {
      if (s.base === 'drown' || s.base === 'beach') return;
      /* 有动作在演的时候不抢戏；但 chase 的收尾就是一口吞，不能把自己锁死 */
      if (s.action && s.action !== 'eat' && s.action !== 'boost' && s.action !== 'chase') return;
      var mx = s.x;                    // 正身：嘴在身体正中，弹幕从右边流进来
      var my = s.y + s.ry * 0.22;
      var got = sea.bite(mx, my, T.biteR * (1 + s.fat * T.fatScale));
      if (got.length) {
        s.eaten += got.length;
        s.full = clamp(s.full + T.fullPerBite * got.length, 0, T.maxFull);
        act('eat', 0.42, 'open');
        for (var i = 0; i < got.length; i++) fire('eat', got[i]);
        return;
      }
      /* 一口没咬着就凑过去追：她是真的在追弹幕，不是随机散步 */
      s.hunt -= 1;
      if (s.hunt > 0) return;
      var f = sea.nearestBullet(mx, my, 1, 220, 150);   // 弹幕永远从右往左流，所以她只看右手边
      if (!f) return;
      var b = band();
      s.hunt = 14;
      s.ty = clamp(f.y, b.top, b.bottom);
      if (Math.abs(f.x - s.x) < 260) s.tx = clamp(f.x - s.heading * 26, s.rx, s.W - s.rx);
    }

    function body(dt) {
      var prevFat = s.fat;
      s.full = clamp(s.full - T.digest * dt, 0, T.maxFull);
      if (s.full >= T.fatAt) s.fat = clamp((s.full - T.fatAt) / (T.maxFull - T.fatAt), 0, 1);
      else s.fat = Math.max(0, s.fat - dt * 0.6);
      s.base = s.fat > 0.02 ? 'fat' : 'swim';
      if (prevFat < 0.5 && s.fat >= 0.5) { say('嗝。我吃撑了。', 2.4, 'burp'); s.burped++; }
      if (s.fat > 0.35) {
        s.burpT = (s.burpT || T.burpEvery) - dt;
        if (s.burpT <= 0) {
          s.burpT = T.burpEvery;
          for (var i = 0; i < 7; i++) sea.bubble(s.x + (i % 2 ? 1 : -1) * s.rx * 0.5, s.y + s.ry * 0.2, 5 + i * 1.4);
          s.burped++;
        }
      }
    }

    function render() {
      var sc = 1 + s.fat * T.fatScale;
      el.style.setProperty('--wx', Math.round(s.x) + 'px');
      el.style.setProperty('--wy', Math.round(s.y + (reduced ? 0 : Math.sin(s.bob) * T.bobA)) + 'px');
      el.style.setProperty('--rot', Math.round(s.pitch * 10) / 10 + 'deg');
      el.style.setProperty('--sc', Math.round(sc * 1000) / 1000);

      var st = s.base;
      var fc = s.face;
      if (s.base === 'swim' || s.base === 'fat') {
        if (s.action === 'belly') { st = 'belly'; fc = fc || 'happy'; }
        else if (s.action === 'freeze' || s.action === 'tilt' || s.action === 'surf') { st = 'tilt'; fc = fc || 'flat'; }
        else if (s.action === 'eat' || s.action === 'chase' || s.action === 'rescue') { st = 'eat'; fc = fc || 'open'; }
        else if (s.action === 'boost') fc = fc || 'happy';
      } else {
        fc = fc || 'worried';
      }
      setCls(st, fc);
      sea.setObstacle({ x: s.x, y: s.y - (reduced ? 0 : Math.sin(s.bob) * T.bobA), rx: s.rx * (1 + s.fat * T.fatScale), ry: s.ry * (1 + s.fat * T.fatScale), on: s.base !== 'beach' });
    }

    function step(dt) {
      if (!s.W) place();
      s.bob += dt * (6.283 / T.bobT);

      /* 外部大事件优先：淹没 > 搁浅 */
      if (sea.drowned()) s.base = 'drown';
      else if (sea.beached()) s.base = 'beach';
      else if (s.base === 'drown' || s.base === 'beach') {
        body(0);
        s.base = s.fat > 0.02 ? 'fat' : 'swim';
      }

      if (s.base === 'drown') {
        s.y = clamp(sea.seabedY() - s.ry * 0.55, 0, s.H);
        s.vx *= 0.7; s.vy = 0; s.pitch = 0;
        if (!s.drownLineAt || performance.now() - s.drownLineAt > 4200) {
          s.drownLineAt = performance.now();
          say(pick(['弹幕太密了 我看不见路', '有人吗 我被淹在弹幕里了', '你们能不能 稍微 冷静一点']), 3.4, 'sos');
        }
      } else if (s.base === 'beach') {
        s.y = sea.seabedY() - s.ry * 0.42;
        s.x = clamp(s.x, s.rx, s.W - s.rx);
        s.pitch = 14; s.vx = 0; s.vy = 0;
        if (!s.beachLineAt || performance.now() - s.beachLineAt > 3600) {
          s.beachLineAt = performance.now();
          s.beachN = (s.beachN || 0) + 1;
          say(pick(['水…… 谁来给点水……', '海干了。是你们把海弄干的。', '发一条弹幕。就一条。求你了。', '我要变成标本了。第 ' + s.beachN + ' 次。']), 3.6, 'sos');
        }
      } else {
        if (s.ttl > 0) { s.ttl -= dt; if (s.ttl <= 0) { s.action = null; s.face = null; } }
        rethink(dt);
        drive(dt);
        body(dt);
        munch();
      }
      render();
    }

    /* 关键词反应：app.js 每发一条弹幕调一次 */
    function react(text, bullet) {
      if (s.base === 'drown' || s.base === 'beach') return null;
      var low = String(text).toLowerCase();
      var hit = null;
      for (var i = 0; i < LEX.length; i++) {
        for (var j = 0; j < LEX[i].k.length; j++) if (low.indexOf(LEX[i].k[j].toLowerCase()) >= 0) { hit = LEX[i]; break; }
        if (hit) break;
      }
      if (!hit) {
        if (Math.random() < 0.5) return null;                 // 听不懂也不每次都歪头，不然累
        act('tilt', 0.9, 'flat');
        say(pick(UNKNOWN), 1.8, 'q');
        return 'tilt';
      }
      if (hit.a === 'rescue' || hit.a === 'chase') {
        s.markTarget = bullet || null;
        act(hit.a, hit.a === 'rescue' ? 3.4 : 2.6, 'open');
        if (bullet) bullet.vy = -190;                          // 把那条弹幕顶起来
        say(hit.line, 2.6, 'talk');
        fire('react', { a: hit.a, text: text });
        return hit.a;
      }
      if (hit.a === 'boost') { act('boost', 2.2, 'happy'); s.think = 0; say(hit.line, 2.2, 'talk'); }
      else if (hit.a === 'belly') { act('belly', 2.8, 'happy'); say(hit.line, 2.4, 'talk'); }
      else if (hit.a === 'freeze') { act('freeze', 0.9, 'flat'); say(hit.line, 1.6, 'talk'); }
      else if (hit.a === 'surf') {
        act('surf', 2.4, 'flat');
        s.ty = sea.surfaceY() + s.ry * 0.7;
        say(hit.line, 2.6, 'talk');
      }
      fire('react', { a: hit.a, text: text });
      return hit.a;
    }

    function murmur() {
      if (s.base === 'drown' || s.base === 'beach' || s.action) return;
      if (Math.random() < 0.65) say(pick(MURMUR), 2.2, 'mumble');
    }

    setCls('swim');
    place();
    s.x = s.W * 0.42;
    s.y = sea.surfaceY() + sea.depth() * 0.48;
    s.tx = s.W * 0.3; s.ty = s.y;

    var api = {
      version: V,
      step: step,
      react: react,
      murmur: murmur,
      resize: function () { place(); },
      on: function (n, fn) { (bag[n] || (bag[n] = [])).push(fn); return api; },
      state: function () {
        return {
          x: Math.round(s.x), y: Math.round(s.y), vx: Math.round(s.vx), vy: Math.round(s.vy),
          base: s.base, action: s.action || null, full: Math.round(s.full), fat: Math.round(s.fat * 100) / 100,
          eaten: s.eaten, burped: s.burped, speed: Math.round(Math.abs(s.vx)), heading: s.heading,
          rx: Math.round(s.rx), ry: Math.round(s.ry)
        };
      },
      tune: T,
      lex: LEX
    };
    return api;
  }

  window.WhaleGirl = { version: V, create: createWhale, tune: T, lex: LEX };
})();
