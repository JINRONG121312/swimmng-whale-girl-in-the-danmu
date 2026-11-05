/* 本地弹幕桥 · 零依赖（只用 node:http / node:crypto）
   干什么：把任何语言吐出来的 JSON 弹幕，实时推给连上来的鲸鱼娘页面。
   页面侧只要开 ?ws=ws://127.0.0.1:8788 就能收。

     node scripts/bridge.js 8788
     curl -X POST http://127.0.0.1:8788/push -d '{"nick":"阿蓝","text":"哈哈"}'
     curl -X POST http://127.0.0.1:8788/push --data-binary @danmu.ndjson   # 一行一条
     node scripts/bridge.js --stdin 8788 < danmu.ndjson                     # 管道进，广播出

   接口契约见 docs/host-api.md。这个文件不在运行路径里，删掉不影响双击游玩。 */
'use strict';

const http = require('node:http');
const crypto = require('node:crypto');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
let stdinMode = false;
const argv = process.argv.slice(2).filter(function (a) {
  if (a === '--stdin') { stdinMode = true; return false; }
  return true;
});
const PORT = +(argv[0] || 8788);
const clients = new Set();
let pushed = 0, bad = 0;

/* ---------- WebSocket 帧 ---------- */

function encode(str) {
  const p = Buffer.from(str, 'utf8');
  const n = p.length;
  let head;
  if (n < 126) { head = Buffer.alloc(2); head[1] = n; }
  else if (n < 65536) { head = Buffer.alloc(4); head[1] = 126; head.writeUInt16BE(n, 2); }
  else { head = Buffer.alloc(10); head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
  head[0] = 0x81;                       // FIN + text
  return Buffer.concat([head, p]);
}

/* 客户端帧一定是带掩码的；这里只解文本/关闭/ping，其余忽略 */
function decode(buf, onText, onClose, onPing) {
  let off = 0;
  while (buf.length - off >= 2) {
    const b0 = buf[off], b1 = buf[off + 1];
    const op = b0 & 0x0f, masked = (b1 & 0x80) !== 0, len0 = b1 & 0x7f;
    let need = 2, len = len0;
    if (len0 === 126) { if (buf.length - off < 4) break; len = buf.readUInt16BE(off + 2); need = 4; }
    else if (len0 === 127) { if (buf.length - off < 10) break; len = Number(buf.readBigUInt64BE(off + 2)); need = 10; }
    let mask = null;
    if (masked) { if (buf.length - off < need + 4) break; mask = buf.slice(off + need, off + need + 4); need += 4; }
    if (buf.length - off < need + len) break;
    const pay = buf.slice(off + need, off + need + len);
    if (mask) for (let i = 0; i < pay.length; i++) pay[i] ^= mask[i & 3];
    off += need + len;
    if (op === 0x1) onText(pay.toString('utf8'));
    else if (op === 0x8) { onClose(); break; }
    else if (op === 0x9) onPing(pay);
  }
  return buf.slice(off);
}

/* server 的 upgrade 事件按 (req, socket, head) 传参，接反了会在第一个页面接入时崩掉 */
function accept(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.end(); return; }
  const digest = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + digest + '\r\n\r\n');
  socket.setNoDelay(true);
  const c = { socket: socket, buf: Buffer.alloc(0), addr: req.socket.remoteAddress };
  clients.add(c);
  log('页面接入 ws://127.0.0.1:' + PORT + '（当前 ' + clients.size + ' 个）');

  socket.on('data', function (chunk) {
    c.buf = decode(Buffer.concat([c.buf, chunk]), function (txt) {
      let m;
      try { m = JSON.parse(txt); } catch (e) { return; }
      if (m && m.t === 'ping') socket.write(encode(JSON.stringify({ t: 'pong', name: 'whale-danmaku-sea', proto: 1 })));
      // 页面发来的其它消息（hello / event / state）桥不消费，只在 --verbose 时打印
      if (process.env.WWD_VERBOSE && m && m.t) log('← ' + m.t + (m.ev ? ':' + m.ev : ''));
    }, function () { drop(c); }, function (pay) { socket.write(Buffer.concat([Buffer.from([0x8a, pay.length]), pay])); });
  });
  socket.on('error', function () { drop(c); });
  socket.on('close', function () { drop(c); });
}

function drop(c) {
  if (!clients.delete(c)) return;
  try { c.socket.destroy(); } catch (e) { }
  log('页面断开（还剩 ' + clients.size + ' 个）');
}

/* 一律重新序列化：'\"一条字符串\"' 解析完就是普通字符串，直接发出去会丢引号，页面收到的是非法 JSON */
function broadcast(obj) {
  const frame = encode(JSON.stringify(obj));
  let sent = 0;
  clients.forEach(function (c) { try { c.socket.write(frame); sent++; } catch (e) { drop(c); } });
  return sent;
}

/* ---------- HTTP：/push 收 JSON 或 NDJSON ---------- */

const server = http.createServer(function (req, res) {
  if (req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ name: 'whale-danmaku-sea bridge', proto: 1, clients: clients.size, pushed: pushed, bad: bad }));
    return;
  }
  if (req.method !== 'POST') { res.writeHead(405).end(); return; }
  let body = '';
  req.setEncoding('utf8');
  req.on('data', function (d) { body += d; if (body.length > 1e6) req.destroy(); });
  req.on('end', function () {
    const lines = body.split('\n').filter(function (l) { return l.trim(); });
    let n = 0;
    lines.forEach(function (l) {
      let obj;
      try { obj = JSON.parse(l); } catch (e) { bad++; return; }
      n += broadcast(obj);
    });
    pushed += lines.length;
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ accepted: lines.length, deliveredTo: n, clients: clients.size, bad: bad }));
    log('/push ' + lines.length + ' 条 → ' + n + ' 个页面');
  });
});

server.on('upgrade', accept);

function log(s) { console.log('[' + new Date().toISOString().slice(11, 19) + '] ' + s); }

server.listen(PORT, '127.0.0.1', function () {
  log('桥在 http://127.0.0.1:' + PORT + ' · 页面开 ?ws=ws://127.0.0.1:' + PORT);
  log('POST /push 一条 JSON 或一行一条；GET / 看在线数');
  if (stdinMode) log('--stdin：从标准输入读 NDJSON，逐行广播');
});

if (stdinMode) {
  let rest = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', function (d) {
    rest += d;
    const lines = rest.split('\n');
    rest = lines.pop();
    lines.forEach(function (l) {
      if (!l.trim()) return;
      let obj;
      try { obj = JSON.parse(l); } catch (e) { bad++; return; }
      broadcast(obj);
      pushed++;
    });
  });
  process.stdin.on('end', function () { log('标准输入结束，桥继续开着（Ctrl-C 退）'); });
}
