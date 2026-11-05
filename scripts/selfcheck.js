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
var FILES = ['index.html', 'src/ocean.css', 'src/sea.js', 'src/whale.js', 'src/drama.js', 'src/app.js',
  'docs/design-prompt.md', 'assets/whale.svg', 'assets/NOTICE.md', 'README.md', 'LICENSE'];
FILES.forEach(function (f) {
  var p = path.join(ROOT, f);
  check(f, fs.existsSync(p) && fs.statSync(p).size > 0, fs.existsSync(p) ? fs.statSync(p).size + ' B' : '缺失');
});

/* 2. 语法 */
console.log('\n[2] node --check');
['src/sea.js', 'src/whale.js', 'src/drama.js', 'src/app.js'].forEach(function (f) {
  var r = cp.spawnSync(process.execPath, ['--check', path.join(ROOT, f)], { encoding: 'utf8' });
  check(f, r.status === 0, r.status === 0 ? 'ok' : (r.stderr || '').trim().split('\n')[0]);
});

/* 3. 零依赖：不许有外链、不许有 webfont */
console.log('\n[3] 零依赖');
['index.html', 'src/ocean.css', 'src/sea.js', 'src/whale.js', 'src/drama.js', 'src/app.js'].forEach(function (f) {
  var urls = (read(f).match(/https?:\/\/[^\s"'<>)]+/g) || []).filter(function (u) {
    return u.indexOf('www.w3.org') < 0;
  });
  check(f + ' 无外部 URL', urls.length === 0, urls.join(' '));
});
check('无 @font-face', ['index.html', 'src/ocean.css'].every(function (f) { return !has(f, '@font-face'); }));
check('无 import / require', !['src/sea.js', 'src/whale.js', 'src/drama.js', 'src/app.js'].some(function (f) {
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
check('弹幕层不吃点击', css.slice(css.indexOf('.sea {'), css.indexOf('.sea {') + 200).indexOf('pointer-events: none') >= 0);
check('片头遮罩不吃点击', /\.card\s*\{[^}]*pointer-events:\s*none/.test(css));
check('HTML 转义防注入', has('src/sea.js', 'function esc'));

/* 7. 角色素材原创 */
console.log('\n[7] 素材');
check('独立角色 SVG', has('assets/whale.svg', 'viewBox="0 0 200 190"'));
check('正身构图（对称耳罩）', has('assets/whale.svg', 'p-cup-l') && has('assets/whale.svg', 'p-cup-r'));
check('麦克风不穿脸', has('assets/whale.svg', 'cx="46" cy="139"'));
check('NOTICE 有作者与来源声明', /JINRONG121312/.test(read('assets/NOTICE.md')) && /原创/.test(read('assets/NOTICE.md')));

/* 8. 体积 */
console.log('\n[8] 体积');
var runFiles = ['index.html', 'src/ocean.css', 'src/sea.js', 'src/whale.js', 'src/drama.js', 'src/app.js'];
var raw = 0, gz = 0;
runFiles.forEach(function (f) {
  var b = fs.readFileSync(path.join(ROOT, f));
  var g = zlib.gzipSync(b, { level: 9 }).length;
  raw += b.length; gz += g;
  console.log('        ' + f.padEnd(16) + (b.length / 1024).toFixed(1) + ' KB  →  ' + (g / 1024).toFixed(1) + ' KB gz');
});
console.log('        ' + '合计'.padEnd(15) + (raw / 1024).toFixed(1) + ' KB  →  ' + (gz / 1024).toFixed(1) + ' KB gz');
check('gzip 总量 < 40 KB', gz < 40 * 1024, (gz / 1024).toFixed(1) + ' KB');

console.log('\n' + '='.repeat(45));
console.log(fail === 0 ? '全部通过。双击 index.html 就能演。' : fail + ' 项没通过。');
process.exit(fail ? 1 : 0);
