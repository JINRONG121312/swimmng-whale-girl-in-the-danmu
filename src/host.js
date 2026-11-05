/* 弹幕导入接口 · 零依赖 · 平台无关
   这片海不认平台，只认一条归一化后的消息。送进来的话一律当陌生人的话处理：限流、去重、截断、转义。
   三条通路：WWD.host.ingest(msg) 宿主直调 / postMessage 扩展投喂 / ?ws= 连本地桥。
   契约、参数、消息格式见 docs/host-api.md。 */
(function () {
  'use strict';

  var V = '1.0.0';
  var PROTO = 1;                       // 接口版本：字段不兼容时才 +1
  var NAME = 'whale-danmaku-sea';

  /* 归一化取词表：不针对某个平台，只是把常见叫法收进来。新平台该改桥，不该改这里。 */
  var F = {
    text: ['text', 'content', 'msg', 'message', 'd', 'body'],
    nick: ['nick', 'nickname', 'user', 'uname', 'from', 'author'],
    id: ['id', 'dmid', 'msgId', 'mid'],
    ts: ['ts', 'time', 'timestamp', 't']
  };
  var KINDS = { dm: 1, gift: 1, enter: 1, reply: 1 };

  /* 礼物名 → 本项目认识的三种 buff。认不出来的礼物不丢，降级成一条弹幕。 */
  var GIFT_MAP = [
    { k: ['爱心', '比心', 'heart', 'love', '告白'], to: 'heart' },
    { k: ['巧克力', 'choco', 'chocolate', '可可'], to: 'choco' },
    { k: ['小鱼干', '鱼干', 'fish', '投喂', 'cat'], to: 'fish' }
  ];

  function pickField(o, names) {
    for (var i = 0; i < names.length; i++) {
      var v = o[names[i]];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
  }
  function mapGift(name) {
    var low = String(name || '').toLowerCase();
    for (var i = 0; i < GIFT_MAP.length; i++) {
      for (var j = 0; j < GIFT_MAP[i].k.length; j++) if (low.indexOf(GIFT_MAP[i].k[j].toLowerCase()) >= 0) return GIFT_MAP[i].to;
    }
    return null;
  }

  function create(WWD, q) {
    var host = {
      proto: PROTO, version: V, name: NAME,
      in: 0, drop: 0, drops: {}, last: null, lastErr: null,
      ws: { url: '', state: 'off', tries: 0 }
    };
    var cfg = {
      rate: Math.max(1, Math.min(60, +(q.rate || 12))),
      burst: Math.max(2, Math.min(120, +(q.burst || 24))),
      allow: (q.allow || '').split(',').filter(Boolean),   // postMessage 来源白名单，空 = 只收同源
      emit: q.emit || 'post',                              // post | ws | both | none
      ctl: q.ctl === '1'                                   // 默认不许外部遥控
    };
    var bag = {}, seen = [], win = 0, tokens = cfg.burst, sock = null, retry = 0, timer = 0;

    /* ---------- 归一化 ---------- */

    function norm(raw) {
      if (raw == null) return null;
      if (typeof raw === 'string' || typeof raw === 'number') raw = { text: String(raw) };
      if (Array.isArray(raw)) {                            // 有的平台把弹幕压成数组，取第一个能当字的
        for (var i = 0; i < raw.length; i++) if (typeof raw[i] === 'string' && raw[i].trim()) { raw = { text: raw[i] }; break; }
      }
      if (typeof raw !== 'object') return null;
      var giftName = typeof raw.gift === 'string' ? raw.gift : (raw.gift && raw.gift.name) || raw.giftName || '';
      var kindName = KINDS[raw.kind] === 1 ? raw.kind : (KINDS[raw.type] === 1 ? raw.type : null);
      var kind = kindName || (giftName ? 'gift' : 'dm');
      var text = pickField(raw, F.text);
      /* 送礼 / 进场常常不带文案，用礼物名或固定说法顶上；否则「某某送了爱心」会被当畸形丢掉 */
      var synth = false;
      if (!text) { text = giftName || (kind === 'enter' ? '进来了' : ''); synth = !!text; }
      if (!text) return null;
      var id = '';
      /* 文档承诺 id ← id|dmid|msgId|mid，数字 id 也算，别只认前两个 */
      for (var k = 0; k < F.id.length; k++) { var v = raw[F.id[k]]; if (v !== undefined && v !== null && v !== '') { id = String(v); break; } }
      var ts = 0;
      for (var j = 0; j < F.ts.length; j++) { var t = raw[F.ts[j]]; if (typeof t === 'number' && t > 0) { ts = t > 1e11 ? t / 1000 : t; break; } }
      return {
        text: text, nick: pickField(raw, F.nick), kind: kind, id: id, ts: ts, synth: synth,
        gift: mapGift(giftName), giftName: giftName || null,
        num: Math.max(1, Math.min(99, +(raw.num || raw.count || 1) || 1))
      };
    }

    function dup(id) {
      if (!id) return false;
      if (seen.indexOf(id) >= 0) return true;
      seen.push(id);
      if (seen.length > 1024) seen.splice(0, 512);
      return false;
    }

    /* 令牌桶：外部一秒最多灌 rate 条，突发攒 burst。超了就丢，丢多少记多少。 */
    function allow(now) {
      tokens = Math.min(cfg.burst, tokens + (now - win) / 1000 * cfg.rate);
      win = now;
      if (tokens < 1) return false;
      tokens -= 1;
      return true;
    }

    function noteDrop(from, why) {
      host.drop++;
      host.drops[from + ':' + why] = (host.drops[from + ':' + why] || 0) + 1;
    }

    /* ---------- 落到玩法上 ---------- */

    function apply(m, from) {
      if (m.kind === 'gift' && m.gift) {
        WWD.gift(m.gift);                                   // 走玩法层：礼物本身也是一条弹幕
        emit('ingest', { kind: 'gift', to: m.gift, nick: m.nick, from: from });
        return;
      }
      var text = m.text;
      if (m.kind === 'gift') text = m.synth ? '她收了个看不懂的「' + (m.giftName || '礼物') + '」' : '打赏了' + (m.giftName || '礼物') + '：' + text;
      if (m.kind === 'enter') text = m.nick ? m.nick + ' 进来了 —— ' + text : '有人进来了：' + text;
      WWD.send(text, { nick: m.nick || '观众', style: undefined, self: false, from: from });
      emit('ingest', { kind: m.kind, text: text, nick: m.nick, from: from });
    }

    function ingest(raw, from) {
      from = from || 'call';
      var list = Array.isArray(raw) ? raw : [raw];
      var got = 0, now = Date.now();
      for (var i = 0; i < list.length; i++) {
        var m = norm(list[i]);
        if (!m) { noteDrop(from, 'shape'); continue; }
        if (m.id && dup(m.id)) { noteDrop(from, 'dup'); continue; }
        if (!allow(now)) { noteDrop(from, 'rate'); continue; }
        host.in++; host.last = { from: from, kind: m.kind, text: m.text.slice(0, 24), at: now };
        apply(m, from);
        got++;
      }
      if (got) yieldLocal();                                // 真弹幕进来了，本地自播让位
      return { ok: got, in: host.in, drop: host.drop };
    }

    var yielded = false;
    function yieldLocal() {
      if (yielded || !WWD.auto) return;
      yielded = true;
      WWD.auto(false, false);   // 只让这一场，下次打开页面还要能自己演
      WWD.drama.cue('弹幕接进来了（' + (host.ws.url || host.last.from) + '）。本地自播让位，这片海只装真的话。');
    }

    /* ---------- 往外说：事件镜像 + 状态心跳 ---------- */

    function emit(name, data) {
      /* ev 是事件名，name 留给协议标识——两个都叫 name 的话，插件收到的事件永远叫 whale-danmaku-sea */
      var p = { t: 'event', ev: name, data: data, ts: Date.now(), proto: PROTO, name: NAME };
      fire(name, data);
      if (cfg.emit === 'post' || cfg.emit === 'both') post(p);
      if ((cfg.emit === 'ws' || cfg.emit === 'both') && sock && sock.readyState === 1) { try { sock.send(JSON.stringify(p)); } catch (e) { /* 发不出去不算页面的错 */ } }
    }
    function post(p) {
      p.proto = PROTO; if (!p.name) p.name = NAME;
      try {
        /* 单开在浏览器里时没有 parent，投给自己——同页扩展/浮层就是这样读到事件的 */
        if (window.parent === window) window.postMessage(p, '*');
        else if (window.parent) window.parent.postMessage(p, '*');
        if (window.opener) window.opener.postMessage(p, '*');
      } catch (e) { /* 跨域投不出去就只走回调 */ }
    }

    function on(name, fn) { (bag[name] || (bag[name] = [])).push(fn); return host; }
    function fire(name, data) {
      var l = bag[name];
      if (!l) return;
      for (var i = 0; i < l.length; i++) try { l[i](data, name); } catch (e) { /* 外部监听炸了不许带走海 */ }
    }

    /* 内部事件镜像：谁接了插件，这些就是它要画的 HUD */
    var MIRROR = ['eat', 'feed', 'gift', 'beach', 'drown', 'ebb', 'react', 'say', 'pour'];
    MIRROR.forEach(function (n) {
      if (WWD.sea.on) WWD.sea.on(n, function (p) { emit('sea:' + n, p); });
    });
    ['eat', 'feed', 'gift', 'react', 'say'].forEach(function (n) {
      WWD.whale.on(n, function (p) { emit('whale:' + n, p); });
    });

    function reply(text, nick) {
      var p = { t: 'reply', text: String(text || '').slice(0, 60), nick: nick || '鲸鱼娘', ts: Date.now(), proto: PROTO, name: NAME };
      if (!p.text) return false;
      fire('reply', p);
      if (cfg.emit !== 'none') post(p);
      if ((cfg.emit === 'ws' || cfg.emit === 'both') && sock && sock.readyState === 1) { try { sock.send(JSON.stringify(p)); } catch (e) { } }
      return true;
    }

    /* ---------- WebSocket 客户端通路 ---------- */

    function ctl(m) {
      if (!cfg.ctl) { noteDrop('ws', 'ctl-off'); return; }
      if (m.act === 'ebb') WWD.ebb(!!m.on);
      else if (m.act === 'autoplay') { yielded = !m.on; WWD.auto(!!m.on, false); }
      else if (m.act === 'reply') reply(m.text, m.nick);
      else if (m.act === 'gift') WWD.gift(m.kind);
    }

    function onData(ev) {
      var raw;
      try { raw = JSON.parse(typeof ev.data === 'string' ? ev.data : ''); } catch (e) { noteDrop('ws', 'json'); return; }
      var arr = Array.isArray(raw) ? raw : [raw];
      for (var i = 0; i < arr.length; i++) {
        var m = arr[i];
        if (m && m.t === 'ping') { if (sock && sock.readyState === 1) sock.send(JSON.stringify({ t: 'pong', proto: PROTO, name: NAME })); continue; }
        if (m && m.t === 'ctl') { ctl(m); continue; }
        ingest(m, 'ws');
      }
    }

    function connect(url) {
      if (!url || !window.WebSocket) { host.ws.state = url ? 'no-websocket' : 'off'; return host; }
      close();
      host.ws.url = url;
      try { sock = new WebSocket(url); } catch (e) { host.lastErr = e.message; host.ws.state = 'error'; return host; }
      host.ws.state = 'connecting';
      sock.onopen = function () {
        host.ws.state = 'open'; host.ws.tries = 0;
        sock.send(JSON.stringify({ t: 'hello', name: NAME, proto: PROTO, v: V }));
        fire('open', { url: url });
        WWD.drama.cue('桥接上了：' + url + '。现在往这个端口推 JSON，海就动。');
      };
      sock.onmessage = onData;
      sock.onerror = function () { host.ws.state = 'error'; fire('error', { url: url }); };
      sock.onclose = function () {
        host.ws.state = 'closed'; sock = null;
        retry = Math.min(15000, 800 * Math.pow(2, host.ws.tries++));    // 指数退避，别把桥打爆
        fire('close', { url: url, nextIn: retry });
        timer = window.setTimeout(function () { connect(url); }, retry);
      };
      return host;
    }

    function close() {
      if (timer) { window.clearTimeout(timer); timer = 0; }
      if (sock) { try { sock.onclose = null; sock.close(); } catch (e) { } sock = null; }
      host.ws.state = 'closed';
    }

    /* ---------- postMessage 通路 ---------- */

    window.addEventListener('message', function (e) {
      var d = e.data;
      if (!d || typeof d !== 'object') return;
      if (d.name && d.name !== NAME) return;                 // 别人家的消息不接
      /* 没给 allow 就只收同源（file:// 的 origin 是 "null"，自己投给自己的也算） */
      var same = e.source === window || e.origin === (location.origin || 'null');
      if (cfg.allow.length ? !(cfg.allow.indexOf('*') >= 0 || cfg.allow.indexOf(e.origin) >= 0) : !same) { noteDrop('post', 'origin'); return; }
      if (d.t === 'danmaku' || d.t === 'dm' || d.t === undefined) { ingest(d.data !== undefined ? d.data : d, 'post'); return; }
      if (d.t === 'ctl') { ctl(d); return; }
      if (d.t === 'hello') { post({ t: 'hello', name: NAME, proto: PROTO, v: V }); }
    });

    /* 状态心跳：插件侧不需要猜页面活没活 */
    window.setInterval(function () {
      if (cfg.emit === 'none') return;
      var p = { t: 'state', proto: PROTO, name: NAME, ts: Date.now(), host: status(), snap: WWD.snapshot() };
      if (cfg.emit === 'post' || cfg.emit === 'both') post(p);
      if ((cfg.emit === 'ws' || cfg.emit === 'both') && sock && sock.readyState === 1) { try { sock.send(JSON.stringify(p)); } catch (e) { } }
      fire('state', p);
    }, 2000);

    function status() {
      return {
        proto: PROTO, version: V, emit: cfg.emit, rate: cfg.rate, burst: cfg.burst,
        in: host.in, drop: host.drop, drops: host.drops, last: host.last, lastErr: host.lastErr,
        ws: host.ws, allow: cfg.allow, ctl: cfg.ctl
      };
    }

    host.ingest = ingest;
    host.on = on;
    host.reply = reply;
    host.connect = connect;
    host.close = close;
    host.status = status;
    host.emit = emit;
    if (q.ws) connect(q.ws);
    return host;
  }

  /* 挂到 WWD 上：app.js 先跑，host.js 后跑 */
  function boot() {
    var WWD = window.WWD;
    if (!WWD || !WWD.send) { window.setTimeout(boot, 120); return; }   // 装配层还没起来，等它
    var q = {};
    String(location.search || '').replace(/^\?/, '').split('&').forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf('='), k = i < 0 ? kv : kv.slice(0, i);
      q[decodeURIComponent(k)] = decodeURIComponent(i < 0 ? '1' : kv.slice(i + 1));
    });
    WWD.host = create(WWD, q);
    WWD.host.params = q;
  }

  window.WhaleHost = { version: V, proto: PROTO, name: NAME, create: create, boot: boot, giftMap: mapGift, fields: F };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
