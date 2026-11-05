/* 装配层 · 单主循环 · 发送区 · 演示按钮 · 本地保存 · 遥测
   零后端：发出去的弹幕只留在你自己的浏览器里，重开还在。 */
(function () {
  'use strict';

  var K = { danmu: 'wwd.danmu.v1', nick: 'wwd.nick.v1', prefs: 'wwd.prefs.v1' };
  var CAP = 60;

  var SEED = [
    '这海是弹幕做的吗', '好大一条', '她刚才是不是把我吃了', '游得挺慢啊',
    '第一次看到弹幕变成水', '等等 她不吃了海就干了？', '小鱼干', '哈哈',
    '这鱼有耳机', '饱食度是认真的吗', '别挤到她', '救命', '离谱',
    '她歪头了', '我发的弹幕被吃掉了', '加油', '水好清', '这条海是我的',
    '我打了好长一段结果被她一口吞了', '上岸', '233', '她打嗝了哈哈哈哈'
  ];
  var FEED = ['小鱼干', '投喂！', '张嘴张嘴', '小鱼干小鱼干小鱼干', '这条不咸'];

  function $(id) { return document.getElementById(id); }
  function store(k, v) {
    try { if (v === undefined) { var r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; }
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function pick(a) { return a[(Math.random() * a.length) | 0]; }

  var prefs = store(K.prefs) || { autoplay: true, face: 'std' };

  var sea = window.WhaleSea.create({ host: $('stage') });
  sea.face(prefs.face);
  var whale = window.WhaleGirl.create({ el: $('whale'), say: $('say'), sea: sea });
  var drama = window.WhaleDrama.create({ sea: sea, whale: whale, badge: $('epBadge'), title: $('epTitle'), cue: $('cue'), card: $('card'), preview: $('preview') });

  var ui = {
    playing: true, autoplay: prefs.autoplay !== false, nextAt: 0, acc: 0, tickAcc: 0, sent: 0, paused: false, last: 0
  };

  /* ---------- 发送 ---------- */

  function send(text, opt) {
    opt = opt || {};
    var nick = opt.nick !== undefined ? opt.nick : $('nick').value.trim() || '游客';
    var b = sea.push({ text: text, nick: nick, style: opt.style, self: !!opt.self });
    if (!b) return null;
    if (opt.self) {
      ui.sent++;
      var arr = store(K.danmu) || [];
      arr.push({ nick: nick, text: text, style: b.el.getAttribute('data-dm-style') });
      while (arr.length > CAP) arr.shift();
      store(K.danmu, arr);
    }
    whale.react(text, b);
    return b;
  }

  function restore() {
    var arr = store(K.danmu) || [];
    if (!arr.length) return;
    $('restoreNote').textContent = '恢复了你上次的 ' + arr.length + ' 条';
    /* 回放：错开时间飘进来，看起来像连续剧接着演，而不是一屏糊上去 */
    for (var i = 0; i < arr.length; i++) {
      (function (it, delay) {
        window.setTimeout(function () {
          if (!ui.playing) return;
          sea.push({ text: it.text, nick: it.nick, style: it.style, self: true });
        }, delay);
      })(arr[i], 260 + i * 620);
    }
  }

  /* ---------- 演示按钮：不用打字也能立刻看见四种结局 ---------- */

  var PASS = ['海边的路人', '阿蓝', '弹幕工厂', '隔壁老王', '一只鱼', '深夜在线'];
  function passer() { return pick(PASS); }
  function anon(item) { return { nick: passer(), style: item || pick(window.WhaleSea.styles) }; }

  var acts = {
    feed: function () { for (var i = 0; i < 3; i++) (function (n) { window.setTimeout(function () { send(pick(FEED), anon('bubble')); }, n * 260); })(i); },
    refill: function () { for (var i = 0; i < 9; i++) (function () { window.setTimeout(function () { send(pick(SEED), anon()); }, i * 110); })(); },
    flood: function () { for (var i = 0; i < 46; i++) (function () { window.setTimeout(function () { send(pick(SEED), anon()); }, i * 45); })(); },
    drain: function () { ui.autoplay = false; syncAuto(); sea.clear(); drama.cue('你按了「断供」。海开始退。'); }
  };

  /* ---------- UI ---------- */

  function syncAuto() {
    var b = $('autoBtn');
    if (!b) return;
    b.setAttribute('aria-pressed', ui.autoplay ? 'true' : 'false');
    b.textContent = ui.autoplay ? '弹幕自播：开' : '弹幕自播：关';
    prefs.autoplay = ui.autoplay;
    store(K.prefs, prefs);
  }

  function wire() {
    var nick = $('nick');
    nick.value = store(K.nick) || '游客';

    $('sendForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = $('text').value.trim();
      if (!v) return;
      store(K.nick, nick.value.trim() || '游客');
      send(v, { self: true, style: $('styleSel').value === 'auto' ? undefined : $('styleSel').value });
      $('text').value = '';
      $('text').focus();
    });

    var btns = document.querySelectorAll('[data-act]');
    for (var i = 0; i < btns.length; i++) btns[i].addEventListener('click', function () {
      var f = acts[this.getAttribute('data-act')];
      if (f) f();
    });

    $('autoBtn').addEventListener('click', function () { ui.autoplay = !ui.autoplay; syncAuto(); });

    $('panelBtn').addEventListener('click', function () {
      var on = $('panel').classList.toggle('on');
      this.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    var faces = document.querySelectorAll('.face-btn');
    for (var j = 0; j < faces.length; j++) faces[j].addEventListener('click', function () {
      var f = this.getAttribute('data-face');
      sea.face(f);
      prefs.face = f; store(K.prefs, prefs);
      for (var k = 0; k < faces.length; k++) faces[k].setAttribute('aria-pressed', faces[k] === this ? 'true' : 'false');
      $('faceVal').textContent = f;
    });
    for (var m = 0; m < faces.length; m++) if (faces[m].getAttribute('data-face') === prefs.face) faces[m].setAttribute('aria-pressed', 'true');
    $('faceVal').textContent = prefs.face;

    $('pauseBtn').addEventListener('click', function () {
      ui.paused = !ui.paused;
      this.setAttribute('aria-pressed', ui.paused ? 'true' : 'false');
      this.textContent = ui.paused ? '继续' : '暂停';
    });

    document.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') e.target.blur();
        return;
      }
      if (e.key === ' ') { e.preventDefault(); $('pauseBtn').click(); }
      else if (e.key === 'p') $('panelBtn').click();
      else if (e.key === 'n') $('text').focus();
    });

    var t;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(function () { sea.resize(); whale.resize(); }, 140);
    });
    document.addEventListener('visibilitychange', function () { ui.last = 0; });

    restore();
    syncAuto();
  }

  /* ---------- 主循环：全场只有一个 rAF ---------- */

  function telemetry() {
    var st = whale.state(), ds = drama.state();
    var rows = [
      ['水位', Math.round(sea.water() * 100) + '%'],
      ['水深', Math.round(sea.depth()) + ' px' + (sea.depth() < sea.tune.beachDepth ? ' ← 搁浅线 96' : '')],
      ['同屏弹幕', sea.live() + ' / ' + sea.tune.maxLive + (sea.live() > sea.tune.drownAt ? ' ← 淹没' : '')],
      ['轨道', sea.lanes()],
      ['她在', st.base + (st.action ? '·' + st.action : '')],
      ['饱食度', st.full + '%（吞下 ' + st.eaten + ' 条）'],
      ['速度', st.speed + ' px/s'],
      ['本集', '第 ' + ds.ep + ' 集 ·《' + (ds.title || '待定') + '》'],
      ['累计', '吃了 ' + st.eaten + ' 条 · 你发了 ' + ui.sent + ' 条 · 游了 ' + ds.meters + ' m']
    ];
    var html = '';
    for (var i = 0; i < rows.length; i++) html += '<div class="tr-row"><b>' + rows[i][0] + '</b><span>' + rows[i][1] + '</span></div>';
    $('telemetry').innerHTML = html;
    $('flag').textContent = sea.beached() ? '搁浅' : sea.drowned() ? '被淹没' : st.base === 'fat' ? '吃撑' : '正常';
  }

  function loop(now) {
    if (!ui.playing) return;
    requestAnimationFrame(loop);
    if (ui.paused) { ui.last = 0; return; }
    if (!ui.last) ui.last = now;
    var dt = clamp((now - ui.last) / 1000, 0, 0.05);
    ui.last = now;
    if (dt <= 0) return;

    sea.step(dt);
    whale.step(dt);
    drama.step(dt);

    if (ui.autoplay) {
      ui.nextAt -= dt;
      if (ui.nextAt <= 0) {
        ui.nextAt = 0.9 + Math.random() * 1.5;
        send(pick(SEED), anon());
      }
    }

    ui.tickAcc += dt;
    if (ui.tickAcc > 0.25) { ui.tickAcc = 0; telemetry(); }
    if (Math.random() < dt * 0.09) whale.murmur();
  }

  /* ---------- 自检钩子：给浏览器取证脚本用的只读快照 ---------- */

  window.WWD = {
    version: '1.0.0',
    sea: sea, whale: whale, drama: drama,
    snapshot: function () {
      var w = whale.state(), d = drama.state();
      return {
        water: Math.round(sea.water() * 1000) / 1000, depth: Math.round(sea.depth()),
        live: sea.live(), lanes: sea.lanes(), beached: sea.beached(), drowned: sea.drowned(),
        whale: w, drama: d, sent: ui.sent, autoplay: ui.autoplay,
        seaTop: parseInt(getComputedStyle($('stage').querySelector('.sea')).getPropertyValue('--sea-top'), 10) || 0
      };
    },
    send: function (text, o) { return send(text, o || {}); },
    act: acts,
    /* 取证/自检用：不依赖 rAF，手动推进 dt 秒（每步上限 0.05s，可连续 n 步） */
    tick: function (dt, n) {
      var d = Math.min(0.05, dt || 0.016);
      for (var i = 0; i < (n || 1); i++) { sea.step(d); whale.step(d); drama.step(d); }
      telemetry();
      return window.WWD.snapshot();
    },
    start: function () { ui.playing = true; ui.last = 0; requestAnimationFrame(loop); }
  };

  wire();
  requestAnimationFrame(loop);
})();
