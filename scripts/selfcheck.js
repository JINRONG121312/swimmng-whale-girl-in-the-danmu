/* 交回来的东西对不对 —— 开发期自检，不进运行路径。
   用法：node scripts/selfcheck.js
   浏览器里的那份实时遥测面板（按 P 打开）才是给观众看的。 */
var fs = require('fs');
var path = require('path');
var zlib = require('zlib');
var cp = require('child_process');

var ROOT = path.resolve(__dirname, '..');
var fail = 0;

function ok(name, detail) { console.log('  PASS  ' + name + (detail ? '  — ' + detail : '')); }
function bad(name, detail) { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
function check(name, cond, detail) { cond ? ok(name, detail) : bad(name, detail); }

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function has(rel, needle) { return read(rel).indexOf(needle) >= 0; }

console.log('\n鲸鱼娘在弹幕群中游泳 · 自检\n' + '='.repeat(38));

/* 1. 该在的文件都在 */
console.log('\n[1] 文件');
var FILES = ['index.html', 'src/ocean.css', 'src/sea.js', 'src/whale.js', 'src/drama.js', 'src/app.js', 'src/host.js',
  'docs/design-prompt.md', 'docs/host-api.md', 'docs/submission.md', 'assets/whale.svg', 'assets/NOTICE.md', 'README.md', 'LICENSE'];
FILES.forEach(function (f) {
  var p = path.join(ROOT, f);
  check(f, fs.existsSync(p) && fs.statSync(p).size > 0, fs.existsSync(p) ? fs.statSync(p).size + ' B' : '缺失');
});

/* 2. 语法 */
console.log('\n[2] node --check');
['src/sea.js', 'src/whale.js', 'src/drama.js', 'src/app.js', 'src/host.js', 'scripts/bridge.js'].forEach(function (f) {
  var r = cp.spawnSync(process.execPath, ['--check', path.join(ROOT, f)], { encoding: 'utf8' });
  check(f, r.status === 0, r.status === 0 ? 'ok' : (r.stderr || '').trim().split('\n')[0]);
});

/* 2b. 启动链上的 id：app.js 里 $('x') 引用了页面没有的元素，会在 wire() 中途抛错，
       把主循环、暂停、快捷键、本地回放一起切掉 —— 语法没错，海却是死的 */
var pageIds = {};
(read('index.html').match(/id="[^"]+"/g) || []).forEach(function (m) { pageIds[m.slice(4, -1)] = 1; });
var wantIds = (read('src/app.js').match(/\$\('[^']+'\)/g) || []).map(function (m) { return m.slice(3, -2); });
var orphan = wantIds.filter(function (id, i, a) { return !pageIds[id] && a.indexOf(id) === i; });
check("app.js 引用的 id 都在 index.html 里", orphan.length === 0, orphan.length ? '页面缺 ' + orphan.join(' ') : wantIds.length + ' 个引用全部命中');

/* 3. 零依赖：不许引用外部资源、不许有 webfont。<a href> 是跳转链接，离线也不影响运行，不算依赖 */
console.log('\n[3] 零依赖');
['index.html', 'src/ocean.css', 'src/sea.js', 'src/whale.js', 'src/drama.js', 'src/app.js', 'src/host.js'].forEach(function (f) {
  var t = read(f);
  var res = (t.match(/<(link|script|img|iframe)[^>]*?(?:href|src)="https?:\/\/[^"]*"/g) || [])
    .concat(t.match(/url\(\s*['"]?https?:\/\/[^)]*\)/g) || [])
    .concat(t.match(/@import[^;]*https?:\/\/[^;]*/g) || [])
    .filter(function (u) { return u.indexOf('www.w3.org') < 0; });
  check(f + ' 无外部资源引用', res.length === 0, res.join(' | '));
});
check('无 @font-face', ['index.html', 'src/ocean.css'].every(function (f) { return !has(f, '@font-face'); }));
check('无 import / require', !['src/sea.js', 'src/whale.js', 'src/drama.js', 'src/app.js', 'src/host.js'].some(function (f) {
  return /(^|\n)\s*(import|require)\s[(*]/m.test(read(f));
}));

/* 4. JS 与 CSS 的变量契约 */
console.log('\n[4] 变量契约');
var sea = read('src/sea.js'), whale = read('src/whale.js'), css = read('src/ocean.css');
[
  ['弹幕 --x', sea, "'--x'"], ['弹幕 --y', sea, "'--y'"], ['弹幕 --rot', sea, "'--rot'"], ['弹幕 --s', sea, "'--s'"],
  ['水位 --sea-top', sea, "'--sea-top'"], ['海床 --sea-floor', sea, "'--sea-floor'"], ['字号 --dm-font', sea, "'--dm-font'"],
  ['鲸鱼 --wx', whale, "'--wx'"], ['鲸鱼 --wy', whale, "'--wy'"], ['鲸鱼 --sc', whale, "'--sc'"]
].forEach(function (t) { check(t[0], t[1].indexOf(t[2]) >= 0); });
[
  'var(--x', 'var(--y', 'var(--rot', 'var(--s,', 'var(--sea-top',
  'var(--sea-floor', 'var(--dm-font', 'var(--wx', 'var(--wy', 'var(--sc)'
].forEach(function (v) { check('CSS 消费 ' + v.replace('var(', ''), css.indexOf(v) >= 0); });
check('CSS 没有读不写的变量', sea.indexOf("'--sea-depth'") < 0 && sea.indexOf("'--lanes'") < 0);

/* 5. 弹幕字号只准 JS 下发 */
console.log('\n[5] 弹幕字号');
var dmBlock = css.slice(css.indexOf('.dm {'), css.indexOf('.dm {') + 700);
check('.dm 用 var(--dm-font)', dmBlock.indexOf('var(--dm-font') >= 0);
check('.dm 里没有硬编码 font-size', !/\bfont-size\s*:\s*\d/.test(dmBlock));

/* 6. 无障碍与点击穿透 */
console.log('\n[6] 可达性');
check('prefers-reduced-motion', has('src/ocean.css', 'prefers-reduced-motion'));
check('forced-colors', has('src/ocean.css', 'forced-colors'));
check('窄屏断点', has('src/ocean.css', 'max-width: 720px'));
check('海层不吃点击（整片海不挡手）', /\.sea\s*\{[^}]*pointer-events:\s*none/.test(css));
check('单条弹幕吃手（拖得动才喂得了鱼）', /\.dm\s*\{[^}]*pointer-events:\s*auto/.test(css) && has('src/sea.js', "addEventListener('pointerdown'"));
check('强制退潮是开关不是按钮一次性', has('src/sea.js', 'ebb: function') && has('index.html', 'id="ebbBtn"'));
check('常态弹幕不蒸发（飘出左边就绕回来）', has('src/sea.js', '环流') && sea.indexOf('if (b.x + b.w < -20) { drop(b); continue; }') < 0);
check('手喂走 whale.feed 而不是偷偷删节点', has('src/whale.js', 'function feed') && has('src/app.js', "sea.on('feed'"));
check('片头遮罩不吃点击', /\.card\s*\{[^}]*pointer-events:\s*none/.test(css));
check('HTML 转义防注入', has('src/sea.js', 'function esc'));
check('提要和按钮是一体，不靠猜高度（不会上下重叠）',
  has('index.html', 'class="dock"') && css.indexOf('--cue-lift') < 0 && /\.cue\s*\{[^}]*position/.test(css) === false);

/* 6b. 打赏 */
console.log('\n[6b] 打赏与 buff');
var gif = sea.slice(sea.indexOf('var GIFT = {'), sea.indexOf('var GIFT = {') + 2600);
['heart', 'choco', 'fish'].forEach(function (k) {
  var m = gif.match(new RegExp(k + ':\\s*\\{[\\s\\S]*?w:\\s*(\\d+),\\s*h:\\s*(\\d+)'));
  var c = css.match(new RegExp('\\[data-gift="' + k + '"\\]\\s*\\{[^}]*width:\\s*(\\d+)px[^}]*height:\\s*(\\d+)px'));
  check('礼物 ' + k + ' 形状 + 尺寸', !!m && !!c, m ? m[1] + '×' + m[2] : 'sea.js 缺');
  if (m && c) check('礼物 ' + k + ' 的 JS/CSS 尺寸对齐', m[1] === c[1] && m[2] === c[2], 'JS ' + m[1] + '×' + m[2] + ' / CSS ' + c[1] + '×' + c[2]);
});
check('礼物是内联 SVG，没有外链素材', /svg viewBox=/.test(gif) && gif.indexOf('http') < 0);
check('buff 有叠加上限', /heartLvMax/.test(whale) && /chocoLvMax/.test(whale));
check('buff 由「吃下去」触发，不是点一下就白给', has('src/whale.js', 'if (got[i].gift) giftHit') && has('src/sea.js', 'gift: h.gift'));
check('爱心真的改速度', /s\.buffs\.heart > 0/.test(whale) && /heartStep/.test(whale));
check('墨镜默认收起', /\.whale \.p-shades\s*\{\s*display:\s*none/.test(css) && /data-cool="1"/.test(css));
check('小鱼干走海的水位，不走她的肚子', has('src/sea.js', "if (kind === 'fish') pour"));
check('打赏不抢本集标题、不冒充「吞了几条弹幕」', /if \(item\.gift\) return;/.test(read('src/drama.js')));

/* 6c. 弹幕导入接口 */
console.log('\n[6c] 导入接口');
var host = read('src/host.js');
check('host.js 在 app.js 之后加载', read('index.html').indexOf('src/app.js') < read('index.html').indexOf('src/host.js'));
check('三条通路都在', /ingest = ingest/.test(host) && /addEventListener\('message'/.test(host) && /new WebSocket/.test(host));
check('进来的文本走玩法层，不自己塞 DOM', /WWD\.send\(text/.test(host) && host.indexOf('createElement') < 0);
check('外部弹幕不许冒充观众自己发的', /self: false/.test(host) && host.indexOf('self: true') < 0);
check('有令牌桶限流', /tokens \+ \(now - win\) \/ 1000 \* cfg\.rate/.test(host));
check('按 id 去重', /function dup\(id\)/.test(host));
check('postMessage 给了白名单只收白名单，没给就只收同源',
  /cfg\.allow\.length \?/.test(host) && /e\.source === window/.test(host) && /noteDrop\('post', 'origin'\)/.test(host));
check('认不出的礼物降级成弹幕，不静默丢', /看不懂的/.test(host));
check('送礼不带文案也不当畸形丢', /text = giftName \|\|/.test(host) && /也可写作 type/.test(read('docs/host-api.md')));
check('外部遥控默认关', /ctl: q\.ctl === '1'/.test(host) && /noteDrop\('ws', 'ctl-off'\)/.test(host));
check('真弹幕进来时本地自播让位', /yieldLocal/.test(host) && /WWD\.auto\(false/.test(host));
check('让位不写进偏好（下次打开页面海不该是死的）', /WWD\.auto\(false, false\)/.test(host) && /remember === false/.test(read('src/app.js')));
check('事件能镜像出去', /MIRROR\.forEach/.test(host) && /t: 'event'/.test(host));
check('镜像带事件名 ev，不被协议名覆盖', /t: 'event', ev: name/.test(host) && /if \(!p\.name\) p\.name = NAME/.test(host));
check('单开页面也把事件投给自己（同页扩展才读得到）', /window\.parent === window/.test(host));
check('反向互动只是投递，不碰平台', /t: 'reply'/.test(host) && !/fetch\(|XMLHttpRequest/.test(host));
check('契约文档写了三条通路和参数', /WWD\.host\.ingest/.test(read('docs/host-api.md')) && /rate/.test(read('docs/host-api.md')));
check('本地桥零依赖', !/require\(['"](?!(node:))/.test(read('scripts/bridge.js')));
check('本地桥 upgrade 参数顺序对（接反了第一个页面就把它打崩）', /function accept\(req, socket\)/.test(read('scripts/bridge.js')));
check('本地桥发帧一律重新序列化（裸字符串会丢引号）', /encode\(JSON\.stringify\(obj\)\)/.test(read('scripts/bridge.js')));

/* 6d. 窄屏：控件占掉的那一条不是海，尺寸变化不许瞬移 */
console.log('\n[6d] 窄屏与尺寸变化');
var css = read('src/ocean.css'), wl = read('src/whale.js'), ap = read('src/app.js');
check('海停在控件上面（stage 底边让给 ui-h + dock-h）', /stage \{ bottom: calc\(var\(--ui-h\) \+ var\(--dock-h\)\); \}/.test(css));
check('发送条和打赏栏的高度是量出来的，不是 CSS 里猜的', /setProperty\('--ui-h'/.test(ap) && /setProperty\('--dock-h'/.test(ap));
check('resize 里也重量（折行行数会变）', /setTimeout\(function \(\) \{ syncUiH\(\); sea\.resize\(\); whale\.resize\(\); \}/.test(ap));
check('开机量完高度补测一次（CSS 兜底值不该当事实用）', /sea\.resize\(\); whale\.resize\(\);/.test(ap));
check('窄屏发送条折成两行：内容独占一行', /\.f-text \{ order: -1;/.test(css));
check('鲸鱼用海的层高，不用 window.innerHeight', /sea\.layerHeight\(\)/.test(wl) && /layerHeight: function/.test(read('src/sea.js')));
check('尺寸变了按比例搬位置', /var kx = w \/ s\.W;/.test(wl) && /s\.x \*= kx;/.test(wl));
check('搁浅是滑下去的，不是一帧砸到底', /s\.y = lerp\(s\.y, sea\.seabedY\(\)/.test(wl) && !/s\.y = sea\.seabedY\(\) - s\.ry \* 0\.42;/.test(wl));
check('resize 之后立刻重画，不留一帧旧位置', /resize: function \(\) \{ place\(\); render\(\); \}/.test(wl));

/* 7. 角色素材原创 */
console.log('\n[7] 素材');
check('独立角色 SVG', has('assets/whale.svg', 'viewBox="0 0 200 190"'));
check('正身构图（对称耳罩）', has('assets/whale.svg', 'p-cup-l') && has('assets/whale.svg', 'p-cup-r'));
check('麦克风不穿脸', has('assets/whale.svg', 'cx="46" cy="139"'));
check('NOTICE 有作者与来源声明', /JINRONG121312/.test(read('assets/NOTICE.md')) && /原创/.test(read('assets/NOTICE.md')));

/* 8. 体积 */
console.log('\n[8] 体积');
var runFiles = ['index.html', 'src/ocean.css', 'src/sea.js', 'src/whale.js', 'src/drama.js', 'src/app.js', 'src/host.js'];
var raw = 0, gz = 0;
runFiles.forEach(function (f) {
  var b = fs.readFileSync(path.join(ROOT, f));
  var g = zlib.gzipSync(b, { level: 9 }).length;
  raw += b.length; gz += g;
  console.log('        ' + f.padEnd(16) + (b.length / 1024).toFixed(1) + ' KB  →  ' + (g / 1024).toFixed(1) + ' KB gz');
});
console.log('        ' + '合计'.padEnd(15) + (raw / 1024).toFixed(1) + ' KB  →  ' + (gz / 1024).toFixed(1) + ' KB gz');
check('gzip 总量 < 45 KB', gz < 45 * 1024, (gz / 1024).toFixed(1) + ' KB');

/* 证书卡上那两组数字不许烂在家里 —— 和实测对不上就报错，别让观众读到上个版本的体积 */
var jsRaw = 0, jsGz = 0;
runFiles.slice(1).forEach(function (f) {
  var b = fs.readFileSync(path.join(ROOT, f));
  jsRaw += b.length; jsGz += zlib.gzipSync(b, { level: 9 }).length;
});
var certHtml = read('index.html');
check('证书卡的体积字段是实测值', certHtml.indexOf((jsRaw / 1024).toFixed(1) + ' KB') >= 0 && certHtml.indexOf((jsGz / 1024).toFixed(1) + ' KB') >= 0,
  (jsRaw / 1024).toFixed(1) + ' KB / ' + (jsGz / 1024).toFixed(1) + ' KB');
check('README 的体积口径是实测值', read('README.md').indexOf((raw / 1024).toFixed(1) + ' KB') >= 0 && read('README.md').indexOf((gz / 1024).toFixed(1) + ' KB') >= 0,
  (raw / 1024).toFixed(1) + ' KB / ' + (gz / 1024).toFixed(1) + ' KB');

console.log('\n' + '='.repeat(45));
console.log(fail === 0 ? '全部通过。双击 index.html 就能演。' : fail + ' 项没通过。');
process.exit(fail ? 1 : 0);
