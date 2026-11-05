# 弹幕导入接口 · `WWD.host`（v1，协议号 `proto: 1`）

这片海只认一种归一化消息，不认平台。任何平台、任何语言写的插件，只要能吐出这个形状，就能把弹幕实时灌进来。
运行路径零依赖、零构建：`src/host.js` 是一个 IIFE，挂在 `window.WWD.host` 上，`file://` 双击也能用。

```
平台插件 ── JSON ──▶ 本地桥 (scripts/bridge.js) ── WebSocket ──▶ 页面 ?ws=ws://127.0.0.1:8788
浏览器扩展 ── postMessage ─────────────────────────────────────▶ 页面
宿主(OBS/Electron) ── window.WWD.host.ingest(msg) ─────────────▶ 页面
```

## 1. 三条通路，挑一条就行

| 通路 | 怎么开 | 适合谁 | 一条消息长什么样 |
| --- | --- | --- | --- |
| 宿主直调 | 页面加载后直接调 `WWD.host.ingest(msg)` | OBS 浏览器源、Electron、注入脚本 | `WWD.host.ingest({nick:'阿蓝', text:'救命'})` |
| postMessage | 默认开着；要收紧来源就加 `?allow=` | 浏览器扩展 / 内容脚本 / 同页浮层 | `postMessage({name:'whale-danmaku-sea', t:'danmaku', data:{text:'哈哈'}}, '*')` |
| WebSocket 客户端 | `?ws=ws://127.0.0.1:8788` | 任何语言的本地桥；断线自己按指数退避重连 | 一条 WS 文本帧 = 一个消息或一个消息数组 |

页面打开时带的参数（全部可选）：

| 参数 | 默认 | 作用 |
| --- | --- | --- |
| `ws` | 空 | 连这个地址；连上后先发 `{t:'hello'}` |
| `rate` | `12` | 令牌桶稳态速率（条/秒），1–60 |
| `burst` | `24` | 突发额度，2–120。高能刷屏先吃 burst，再被 rate 压住 |
| `allow` | 空 = 只收同源 | postMessage 来源白名单，逗号分隔；`*` 表示全收 |
| `emit` | `post` | 往外镜像：`post` / `ws` / `both` / `none` |
| `ctl` | 关 | 加 `ctl=1` 才允许外部遥控退潮、自播、发弹幕 |

## 2. 进来的消息（ingest）

```js
{
  text: '救命啊她把我发的吃了',   // 弹幕必填，超过 60 字自动截断加省略号
  nick: '阿蓝',                  // 可选，缺省显示「观众」
  id:   '1234567',               // 可选，带去重（留最近 1024 条），数字 id 也认
  ts:   1730000000,              // 可选，秒或毫秒都认
  kind: 'dm' | 'gift' | 'enter' | 'reply',   // 也可写作 type；缺省：有 gift 字段算 gift，否则 dm
  gift: '小心心',                // kind=gift 时的礼物名，见下面的映射表
  num:  1                        // 数量，1–99，钳制
}
```

字段名不匹配也没关系，归一化会按同义词表找：
`text ← text|content|msg|message|d|body`，`nick ← nick|nickname|user|uname|from|author`，`id ← id|dmid|msgId|mid`，`ts ← ts|time|timestamp|t`。
数组也能进：`ingest([{text:'a'}, {text:'b'}])`，或者平台把弹幕压成 `['哈哈', 1, 2]` 时取第一个能当字的。
送礼和进场往往不带文案：`{kind:'gift', gift:'爱心'}` 会用礼物名顶上，`{kind:'enter', nick:'阿蓝'}` 会说「阿蓝 进来了」。

**礼物名 → buff**（认不出来就降级成一条弹幕，绝不静默丢弃）：

| 本项目 buff | 认的词 |
| --- | --- |
| 爱心 · 速度 ×1.22/层，最多 3 层 | 爱心 / 比心 / heart / love / 告白 |
| 巧克力 · 墨镜变身，最多 3 层 | 巧克力 / choco / chocolate / 可可 |
| 小鱼干 · 直接给海加水 | 小鱼干 / 鱼干 / fish / 投喂 / cat |

进来以后发生什么：弹幕变成水（水位慢慢涨），同时她听得懂关键词就演一下；礼物是一条会飘向她嘴边的弹幕，**被她吃下去才加 buff**（小鱼干例外，落地即加水）。外部来源永远不算「你自己发的」，不进本地存档。

## 3. 出去的事件（给插件画 HUD 用）

`emit=post|both` 时向 `window.parent` 投；页面单开（没有父窗口）时投给自己，同页扩展 `addEventListener('message')` 就能读到。`emit=ws|both` 且连着时发 WS 文本帧。

```js
{ t:'event', ev:'whale:eat', name:'whale-danmaku-sea', proto:1, data:{ text:'小鱼干', gift:'heart' }, ts:1730000000000 }
{ t:'state', name:'whale-danmaku-sea', proto:1, ts:…, host:{ in:128, drop:3, ws:{state:'open'} }, snap:{ water:0.62, live:23, whale:{base:'swim',buffs:{…}} } }  // 每 2 秒一次心跳
```

`ev` 是事件名（`name` 固定是协议标识，别混用）：`ingest`、`sea:eat|feed|gift|beach|drown|ebb|react|say|pour`、`whale:eat|feed|gift|react|say`，以及 `open` / `close` / `error` / `state` / `reply`。
页面内订阅不走网络：`WWD.host.on('whale:eat', fn)`。

`WWD.snapshot()` 里可以直接读的玩法状态：`water` `depth` `extra` `live` `lanes` `beached` `drowned` `ebb` `whale.{base,action,full,eaten,speed,buffs,gifts}` `drama.{ep,title,eaten,gifts,meters}` `host`（本接口自己的计数）。

## 4. 反向互动

```js
WWD.host.reply('她刚把这条吃掉了', '鲸鱼娘')   // → {t:'reply', text, nick}
```
发到桥 / 扩展那边，**由平台侧决定要不要真的发进直播间**——页面自己绝不碰平台账号，也不存任何 token。
想读回观众说的话：`WWD.host.on('reply', fn)`；想直接看形状：`WWD.host.status()`。

## 5. 外部遥控（默认关，`?ctl=1` 才生效）

```js
{ t:'ctl', act:'ebb',      on:true }        // 强制退潮开关
{ t:'ctl', act:'autoplay', on:false }       // 本地自播开关
{ t:'ctl', act:'gift',     kind:'heart' }   // 直接打赏（等价于有人在页面点了按钮）
{ t:'ctl', act:'reply',    text:'……' }
```
`{t:'ping'}` 无论开关状态都会回 `{t:'pong'}`，用来探活。

## 6. 真弹幕进来时，本地自播自动让位

第一条外部消息落地后，`autoplay` 自动关掉并打一条提要——不然「真弹幕」和「演示弹幕」混在一片海里，水位就不诚实了。
要同时保留自播就调 `WWD.auto(true)`（之后不会再自动让位）。
让位和 `ctl` 遥控都**不写进本地偏好**：下一次普通打开页面，自播照旧，不会留着插件按下的开关。

## 7. 本地桥（可选，测试 / 演示用）

```
node scripts/bridge.js 8788
curl -X POST http://127.0.0.1:8788/push -d '{"nick":"阿蓝","text":"哈哈"}'
echo '{"text":"救命","kind":"gift","gift":"巧克力"}' | node scripts/bridge.js --stdin 8788
```
零依赖：HTTP `POST /push` 收 JSON（一行一条也行），转发给所有连着的页面；`GET /` 返回在线连接数。
任何语言的插件只要能发这个 HTTP 请求，就能驱动这片海。

## 8. 接平台时要注意的三件事

1. **限流是页面侧兜底，不是平台侧的礼貌。** 高能刷屏会被 `rate/burst` 丢掉并计入 `drop`，插件侧该看到 `host.drop` 在涨——那说明你灌太快，不是接口坏了。
2. **不要把平台 token 传进这个页面。** 页面零后端、`file://` 可跑，任何密钥都不该出现在它的运行时里；发送权限留在你的插件/服务端。
3. **弹幕文本是不可信输入。** 页面已经做了转义 + 60 字截断，插件侧别再拼 HTML；要展示就取 `text` 纯文本。
