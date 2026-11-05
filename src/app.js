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

  /* 手喂：海判定「松手时落在她身上」，她记这笔账 */
  sea.on('feed', function (item) { whale.feed(item); });

  var ui = {
    playing: true, autoplay: prefs.autoplay !== false, nextAt: 0, acc: 0, tickAcc: 0, sent: 0, gifts: 0, paused: false, last: 0,
    src: null,   // 最近一条弹幕是从哪进来的：local / post / ws / call
    frame: 0, beat: 0, revives: 0
  };

  /* ---------- 发送 ---------- */

  function send(text, opt) {
    opt = opt || {};
    var nick = opt.nick !== undefined ? opt.nick : $('nick').value.trim() || '游客';
    var b = sea.push({ text: text, nick: nick, style: opt.style, self: !!opt.self });
    if (!b) return null;
    if (opt.from) ui.src = opt.from; else if (!ui.src) ui.src = 'local';
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

  /* ---------- 打赏 ----------
     礼物的形状只有一份定义（sea.js 的 GIFT 表），按钮里的图标从那里注入，
     免得 HTML / CSS / JS 各画一遍还对不齐。注入的是本项目自己画的常量，不是用户输入。 */

  function doGift(kind, byMe) {
    var b = sea.gift(kind, { self: !!byMe });
    if (!b) return null;
    if (byMe) ui.gifts++;
    drama.cue(kind === 'fish'
      ? '你打赏了一袋小鱼干。海开始慢慢涨起来——这一袋不用她吃。'
      : '你打赏了' + (kind === 'heart' ? '一颗爱心' : '一块巧克力') + '，它正飘向她嘴边：吃下去才生效。');
    return b;
  }

  function giftBar() {
    var G = window.WhaleSea.gifts, btns = document.querySelectorAll('.gift');
    for (var i = 0; i < btns.length; i++) (function (btn) {
      var kind = btn.getAttribute('data-gift'), g = G[kind];
      if (!g) return;
      btn.querySelector('.g-ico').innerHTML = g.svg;
      btn.title = g.tip;
      btn.addEventListener('click', function () { doGift(kind, true); });
    })(btns[i]);
  }

  function syncGift(bf) {
    var btns = document.querySelectorAll('.gift');
    for (var i = 0; i < btns.length; i++) {
      var kind = btns[i].getAttribute('data-gift');
      var lv = kind === 'heart' ? bf.heartLv : kind === 'choco' ? bf.chocoLv : 0;
      var live = kind === 'heart' ? bf.heart > 0 : kind === 'choco' ? bf.choco > 0 : sea.extra() > 0;
      btns[i].classList.toggle('is-on', live);
      btns[i].querySelector('.g-lv').textContent = live ? (kind === 'fish' ? '水' + Math.round(sea.extra()) : lv > 1 ? '×' + lv : '✓') : '';
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
    drain: function () { ui.autoplay = false; syncAuto(); drama.cue('你按了「断供」。海不会自己退——她得把弹幕一口口吃掉。'); }
  };

  /* ---------- UI ---------- */

  function syncAuto(remember) {
    var b = $('autoBtn');
    if (!b) return;
    b.setAttribute('aria-pressed', ui.autoplay ? 'true' : 'false');
    b.textContent = ui.autoplay ? '弹幕自播：开' : '弹幕自播：关';
    /* 接口让位只算这一场的事，别写进偏好——不然下次打开页面海是死的 */
    if (remember === false) return;
    prefs.autoplay = ui.autoplay;
    store(K.prefs, prefs);
  }

  function wire() {
    var nick = $('nick');
    nick.value = store(K.nick) || '游客';

    giftBar();

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

    /* 强制退潮：平时这片海是闭环的（字漂出左边又回右边），只有两种出水口——她的嘴，和这个开关 */
    $('ebbBtn').addEventListener('click', function () {
      var on = sea.ebb();
      this.setAttribute('aria-pressed', on ? 'true' : 'false');
      this.textContent = on ? '强制退潮：开' : '强制退潮：关';
      drama.cue(on ? '你打开了「强制退潮」。字漂出左边就不回来了，海面开始往下走。'
                   : '你关掉了「强制退潮」。海重新变成闭环——除了她嘴里，水没有别的地方可去。');
    });

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
    });
    for (var m = 0; m < faces.length; m++) if (faces[m].getAttribute('data-face') === prefs.face) faces[m].setAttribute('aria-pressed', 'true');

    $('pauseBtn').addEventListener('click', function () {
      ui.paused = !ui.paused;
      this.setAttribute('aria-pressed', ui.paused ? 'true' : 'false');
      this.textContent = ui.paused ? '继续' : '暂停';
    });

    $('certBtn').addEventListener('click', function () {
      var show = $('cert').hidden;
      $('cert').hidden = !show;
      this.setAttribute('aria-pressed', show ? 'true' : 'false');
    });
    $('certClose').addEventListener('click', function () { $('certBtn').click(); });

    document.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') e.target.blur();
        return;
      }
      if (e.key === ' ') { e.preventDefault(); $('pauseBtn').click(); }
      else if (e.key === 'p') $('panelBtn').click();
      else if (e.key === 'c') $('certBtn').click();
      else if (e.key === 'n') $('text').focus();
      else if (e.key === 'Escape' && !$('cert').hidden) $('certBtn').click();
    });

    var t;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(function () { syncUiH(); sea.resize(); whale.resize(); }, 140);
    });
    syncUiH();
    sea.resize(); whale.resize();   /* 量完高度再撑一次：海创建时拿到的是 CSS 里那个兜底值 */
    document.addEventListener('visibilitychange', function () {
      ui.last = 0;
      if (!document.hidden) revive();
    });

    restore();
    syncAuto();
  }

  /* ---------- 主循环：全场只有一个 rAF ---------- */

  /* 窄屏发送条会折行，CSS 里那个 128px 是猜的；猜矮了海就压在控件底下，她坐在输入框上。量真实高度 */
  function syncUiH() {
    var root = document.documentElement;
    var dock = document.querySelector('.dock');
    root.style.setProperty('--ui-h', Math.round($('sendForm').getBoundingClientRect().height) + 'px');
    root.style.setProperty('--dock-h', Math.round(dock ? dock.getBoundingClientRect().height : 0) + 'px');
  }

  /* 弹幕是从哪来的：本地自播、扩展 postMessage、还是桥的 WebSocket */
  function srcLabel() {
    var h = window.WWD.host;
    if (!h) return (ui.src || 'local') + '（未装导入层）';
    var st = h.status();
    if (st.ws.state === 'open') return 'ws 已连 · 进 ' + st.in + ' 条 / 丢 ' + st.drop;
    if (st.in) return (st.last && st.last.from || 'call') + ' · 进 ' + st.in + ' 条 / 丢 ' + st.drop;
    return '本地（' + (st.ws.url ? '桥未连：' + st.ws.state : '自播 + 手输') + '）';
  }

  function telemetry() {
    var st = whale.state(), ds = drama.state(), bf = st.buffs;
    var live = [];
    if (bf.heart > 0) live.push('爱心 ×' + bf.heartLv + '（剩 ' + bf.heart + 's）');
    if (bf.choco > 0) live.push('墨镜 ×' + bf.chocoLv + '（剩 ' + bf.choco + 's）');
    if (sea.extra() > 0) live.push('小鱼干的水 ' + sea.extra());
    syncGift(bf);
    var rows = [
      ['水位', Math.round(sea.water() * 100) + '%' + (sea.ebbing() ? ' ← 退潮中' : '')],
      ['水深', Math.round(sea.depth()) + ' px' + (sea.depth() < sea.tune.beachDepth ? ' ← 搁浅线 96' : '')],
      ['同屏弹幕', sea.live() + ' / ' + sea.tune.maxLive + (sea.live() > sea.tune.drownAt ? ' ← 淹没' : '')],
      ['轨道', sea.lanes()],
      ['她在', st.base + (st.action ? '·' + st.action : '')],
      ['饱食度', st.full + '%（吞下 ' + st.eaten + ' 条）'],
      ['速度', st.speed + ' px/s'],
      ['buff', live.length ? live.join(' · ') : '空（打赏会被她吃掉才生效）'],
      ['弹幕来源', srcLabel()],
      ['本集', '第 ' + ds.ep + ' 集 ·《' + (ds.title || '待定') + '》'],
      ['累计', '吃了 ' + st.eaten + ' 条 · 你发了 ' + ui.sent + ' 条 · 打赏 ' + ui.gifts + ' 件 · 游了 ' + ds.meters + ' m']
    ];
    var html = '';
    for (var i = 0; i < rows.length; i++) html += '<div class="tr-row"><b>' + rows[i][0] + '</b><span>' + rows[i][1] + '</span></div>';
    $('telemetry').innerHTML = html;
    var hl = $('hostLine'), h = window.WWD.host;
    if (hl) {
      if (!h) hl.textContent = '没装 host.js，导入层不存在。';
      else {
        var st = h.status();
        hl.textContent = '协议 v' + st.proto + ' · 通路 ' + st.emit + ' · ws ' + st.ws.state +
          (st.ws.url ? '（' + st.ws.url + '）' : '') + ' · 进 ' + st.in + ' / 丢 ' + st.drop +
          (st.drop ? '（' + Object.keys(st.drops).slice(0, 2).join(' ') + '）' : '') +
          (st.lastErr ? ' · 最后一次错误：' + st.lastErr : '');
      }
    }
    $('flag').textContent = sea.beached() ? '搁浅' : sea.drowned() ? '被淹没' : st.base === 'fat' ? '吃撑' : '正常';
  }

  /* 后台标签页/未显示的容器里首个 rAF 可能永不投递，链条会断死在第一帧 → 用后台照样走的定时器当看门狗 */
  function ask() { ui.frame = requestAnimationFrame(loop); }

  function revive(force) {
    if (!ui.playing) return;
    if (!force && window.performance.now() - ui.beat < 1200) return;
    if (ui.frame) cancelAnimationFrame(ui.frame);
    ui.revives++;
    ui.last = 0;
    ask();
  }

  function loop(now) {
    ui.beat = now;
    if (!ui.playing) return;
    ask();
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
        extra: sea.extra(),
        live: sea.live(), lanes: sea.lanes(), beached: sea.beached(), drowned: sea.drowned(), ebb: sea.ebbing(),
        whale: w, drama: d, sent: ui.sent, gifts: ui.gifts, autoplay: ui.autoplay, src: ui.src,
        host: window.WWD.host ? window.WWD.host.status() : null,
        sinceFrame: Math.round(window.performance.now() - ui.beat), revives: ui.revives,
        seaTop: parseInt(getComputedStyle($('stage').querySelector('.sea')).getPropertyValue('--sea-top'), 10) || 0
      };
    },
    send: function (text, o) { return send(text, o || {}); },
    gift: function (kind, byMe) { return doGift(kind, byMe !== false); },
    ebb: function (v) {
      var on = sea.ebb(v);
      var b = $('ebbBtn');
      if (b) { b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.textContent = on ? '强制退潮：开' : '强制退潮：关'; }
      return on;
    },
    auto: function (v, remember) { ui.autoplay = !!v; syncAuto(remember); return ui.autoplay; },
    act: acts,
    /* 取证/自检用：不依赖 rAF，手动推进 dt 秒（每步上限 0.05s，可连续 n 步） */
    tick: function (dt, n) {
      var d = Math.min(0.05, dt || 0.016);
      for (var i = 0; i < (n || 1); i++) { sea.step(d); whale.step(d); drama.step(d); }
      telemetry();
      return window.WWD.snapshot();
    },
    start: function () { ui.playing = true; revive(true); }
  };

  /* 先把海发动，再装 UI：绑定环节出任何岔子都不该让海退干 */
  ask();
  window.setInterval(function () { revive(); }, 1000);
  /* 预览面板会把主世界定时器一起冻住，看门狗叫不醒；点击/按键是页面真在被用的证据，用它把循环接回来 */
  ['pointerdown', 'keydown', 'focus'].forEach(function (evt) {
    window.addEventListener(evt, function () { revive(); }, { passive: true });
  });

  wire();
})();
