# 原创声明与资产清单

## 一、素材来源

本仓库里的角色**鲸鱼娘（正身构图）**由 **公冰蓝 / JINRONG121312** 原创，绘制时间 **2026-11-05**，是同一作者在 [`whale-in-my-web`](https://github.com/JINRONG121312/whale-in-my-web) 里的大肥鱼角色（`web/assets/fat-fish.svg`）的**改画**：沿用同一条作者线上的形象（蓝色鲸身、耳机、呆毛、腮红），按「正身」重新构图。

**没有使用任何第三方素材**：没有搬运别人的鲸鱼娘同人图，没有取自任何 CC / 免版权图库的图片、字体或 SVG，没有引入任何 webfont。全部美术与前端代码都是本作者手写的矢量路径与 CSS。

前端代码（`src/*.js`、`src/ocean.css`、`index.html`）同样为本仓库原创，许可见根目录 `LICENSE`。

## 二、构图约定（防止「脸部穿模」）

正身构图相对侧身构图的改动，都是为了解决耳机带与麦克风杆在侧身视角下必然横穿眼睛和嘴的问题：

| 部件 | 约定 |
|---|---|
| 耳机带 `p-band` | 完整跨过头顶的一条弧 `M30 94C29 40 171 40 170 94`，落在脸的**上方**，不切过任何五官 |
| 耳罩 `p-cup-l` / `p-cup-r` | 左右对称，分别在 `x=18` 与 `x=161` |
| 麦克风 `p-mic` / `p-mic-tip` | **只**从左耳罩下方弯出去，终点 `(46,139)`，半径 3.4，不越过嘴（嘴在 `x=92…108`） |
| 眼睛 `p-eye` | 双眼对称 `cx=76 / cx=124`，`cy=92`；四组表情 `e-open / e-happy / e-flat / e-tear` 每组都是左右各一只 |
| 腮红 `p-blush` | 两枚，对称 `cx=56 / cx=144` |
| 嘴 | `m-smile` 居中（92→108），`m-open` 居中张口 + 舌头 `cx=100` |
| 胸鳍 | `p-fin-l` / `p-fin-r` 对称，摆动方向相反 |

因为角色**不左右翻转**，她的嘴在身体正中，弹幕从右侧流入被她吞。

## 三、资产指纹（SHA-256）

任何人拿到的文件只要哈希一致，即为本仓库发布的原始文件。

| 文件 | 字节 | SHA-256 |
|---|---|---|
| `assets/whale.svg` | 3931 | `091447cbb14e78ee7c2ff8bd01f3768a978a1cfab5be60993e11230f68113dc1` |
| `index.html` | 7834 | `979c9aa2d3b1938104375ae85e8233c5ea42b5fc57d634e062c6c5ba6c51ad00` |
| `src/ocean.css` | 16432 | `69d2c897848c0eeea00233669d6f6f810442249ade649db982cee95c53b11213` |
| `src/sea.js` | 14251 | `aea836e8e710eae7977277d11bd1569d4ef5f5dc74eb682cb9f1452e761b35f6` |
| `src/whale.js` | 12863 | `c76c62789799f8abd9bf068f765af6359176fcf3f1a8e2279f006cdb759e77e8` |
| `src/drama.js` | 6298 | `e2e6c953b8db63149d493334527e913e4f7cecf70ac7b97e5d441ebb7d3282d6` |
| `src/app.js` | 9683 | `156b7f24f293f90d751289be721f223eaa4024230d0535d70a5a7d0b1622235d` |
| `docs/design-prompt.md` | 14969 | `e151f1c6227cf7b29e6e0ca7b66415ad625a98ed6ba8a43e067b0fd1930c25a4` |
| `scripts/selfcheck.js` | 5432 | `d35e2b78d409d82a24f7be0d94b925ec5583ada5279505768e6cbd9267d9f78a` |
| `LICENSE` | 4768 | `9f9ed834314165777efabd975adcddf8577a2f2d70e5f13febe3e4c524a6a601` |

`assets/whale.svg` 与 `index.html` 内联的那份是同一套几何（前者多了 `xmlns` 与署名注释，后者少了这两项）。改角色请两边一起改，或以 `assets/whale.svg` 为准回填。

## 四、许可

PolyForm Noncommercial License 1.0.0 —— **非商业使用**。Copyright (c) 2026 公冰蓝（JINRONG121312）。
商业授权请开 issue 或经由 GitHub 联系作者。

## 五、项目背景

2026 Qoder 高校创造力大赛参赛作品，团队 **oceanplay**，作者 **公冰蓝**。
玩法设计与参数口径见 [`docs/design-prompt.md`](../docs/design-prompt.md)（v2，已按实现回填）。
