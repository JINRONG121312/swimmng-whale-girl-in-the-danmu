/* 连续剧壳 · 集数、本集标题、剧情提要、下集预告
   她吃掉的第一条弹幕，就是这一集的标题。这一集的剧情，是今天真实发生过的事。 */
(function () {
  'use strict';

  var V = '1.0.0';

  var T = { episode: 45, maxCue: 3 };

  var FALLBACK = ['她吃了三条弹幕', '海干的下午', '救命声里的哈哈', '嗝', '歪头', '第 108 次搁浅', '别挤别挤', '这条海是我的'];
  var NEXT = [
    '一条弹幕引发的血案', '她把小鱼干弄丢了', '海干的那一天（上）', '鲸鱼娘的自我介绍，共 0 句',
    '救命和哈哈同时到达', '吃饱之后，她陷入了沉思', '第 42 条弹幕', '她学会了读弹幕，但只学了 6 个词'
  ];
  var OPEN = [
    '大型连续剧',
    '《鲸鱼娘在弹幕群中游泳》',
    '本剧由观众口述生成 · 一集 45 秒 · 全剧预计 4000 集'
  ];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function pick(a) { return a[(Math.random() * a.length) | 0]; }
  function cut(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; }

  function createDrama(opts) {
    var badge = opts.badge, titleEl = opts.title, cueEl = opts.cue, cardEl = opts.card, previewEl = opts.preview;
    var sea = opts.sea, whale = opts.whale;

    var d = {
      ep: 1, t: 0, eaten: 0, selfEaten: 0, laughs: 0, saves: 0, freezes: 0, gifts: 0,
      beachN: 0, drownN: 0, dist: 0, title: null, cues: [], cardT: 0, lastNext: null
    };
    var prevPos = null;

    function renderBadge() {
      if (badge) badge.textContent = '第 ' + d.ep + ' 集';
    }
    function renderTitle() {
      if (!titleEl) return;
      var t = d.title || pick(FALLBACK);
      titleEl.textContent = '本集：《' + t + '》';
    }

    function cue(line) {
      d.cues.push(line);
      while (d.cues.length > T.maxCue) d.cues.shift();
      if (!cueEl) return;
      cueEl.innerHTML = '';
      for (var i = 0; i < d.cues.length; i++) {
        var p = document.createElement('p');
        p.textContent = d.cues[i];
        if (i === d.cues.length - 1) p.className = 'on';
        cueEl.appendChild(p);
      }
    }

    function showCard(lines, ttl) {
      if (!cardEl) return;
      cardEl.innerHTML = '';
      for (var i = 0; i < lines.length; i++) {
        var p = document.createElement('span');
        p.textContent = lines[i];
        p.style.animationDelay = (i * 0.34) + 's';
        cardEl.appendChild(p);
      }
      cardEl.style.setProperty('--card-ttl', ttl + 's');
      cardEl.classList.remove('on');
      void cardEl.offsetWidth;
      cardEl.classList.add('on');
      d.cardT = ttl;
      if (previewEl) previewEl.hidden = true;
    }

    /* 每一集的真实剧情，由这一集实际发生的事拼出来 */
    function recap() {
      var out = [];
      out.push('她吞了 ' + d.eaten + ' 条弹幕' + (d.selfEaten ? '，其中 ' + d.selfEaten + ' 条是你自己发的' : '，一条不是你发的也不奇怪'));
      if (d.laughs || d.saves) out.push('有人笑了 ' + d.laughs + ' 次，喊了 ' + d.saves + ' 次救命');
      if (d.beachN) out.push('海干了 ' + d.beachN + ' 次，是她上岸的理由');
      if (d.drownN) out.push('她被弹幕淹没 ' + d.drownN + ' 次，只冒泡');
      if (d.gifts) out.push('收到 ' + d.gifts + ' 件打赏，她当场吃掉了');
      out.push('在水里游过 ' + (d.dist / 100).toFixed(2) + ' 米，深度停在 ' + Math.round(sea.depth()) + ' px');
      return out.slice(-T.maxCue);
    }

    function roll(toNext) {
      var lines = recap();
      d.ep = toNext ? d.ep + 1 : d.ep;
      d.t = 0; d.eaten = 0; d.selfEaten = 0; d.laughs = 0; d.saves = 0; d.gifts = 0;
      d.beachN = 0; d.drownN = 0; d.dist = 0; d.title = null;
      renderBadge();
      if (toNext) {
        var next = pick(NEXT.filter(function (n) { return n !== d.lastNext; }));
        d.lastNext = next;
        if (previewEl) { previewEl.textContent = '下集预告：《' + next + '》'; previewEl.hidden = false; }
        showCard(['第 ' + d.ep + ' 集', '（上一集：' + (lines[lines.length - 1] || '什么都没发生') + '）', '本集标题将在她开口吃掉第一条弹幕后确定'], 3.2);
      }
      for (var i = 0; i < lines.length; i++) cue(lines[i]);
      renderTitle();
    }

    sea.on('beach', function (p) {
      if (p.on) { d.beachN++; cue('第 ' + d.ep + ' 集 ' + Math.round(d.t) + ' 秒：海开始退，她的肚子擦到了沙'); }
      else cue('水回来了。她深吸一口气，装作什么都没发生。');
    });
    sea.on('drown', function (p) {
      if (p.on) { d.drownN++; cue('同屏 ' + p.n + ' 条弹幕，她看不见了'); }
      else cue('她浮起来了，第一件事是继续吃');
    });

    whale.on('eat', function (item) {
      /* 打赏由 gift 事件单独记账：混进来的话，「吞了几条弹幕」会虚高，本集标题还会变成《巧克力》 */
      if (item.gift) return;
      d.eaten++;
      if (item.self) d.selfEaten++;
      if (!d.title && item.text) { d.title = cut(item.text, 12); renderTitle(); }
    });
    whale.on('react', function (p) {
      if (p.a === 'belly') { d.laughs++; cue('有人说了「' + cut(p.text, 8) + '」，她翻了一下肚皮'); }
      if (p.a === 'rescue') { d.saves++; cue('她冲过去把「' + cut(p.text, 8) + '」顶出了水面'); }
      if (p.a === 'freeze') d.freezes++;
    });
    whale.on('gift', function (p) {
      d.gifts++;
      if (p.kind === 'heart') cue('她把爱心吞了下去。第 ' + p.lv + ' 层，尾巴立刻摆急了。');
      if (p.kind === 'choco') cue('她把巧克力吞了下去。墨镜戴上，第 ' + p.lv + ' 层。');
      if (p.kind === 'fish') cue('她把小鱼干吞了下去——水其实是打赏那一刻涨的。');
    });

    function step(dt) {
      d.t += dt;
      if (d.cardT > 0) {
        d.cardT -= dt;
        if (d.cardT <= 0 && cardEl) cardEl.classList.remove('on');
      }
      var st = whale.state();
      if (prevPos != null) d.dist += Math.abs(st.x - prevPos);
      prevPos = st.x;
      if (st.base === 'fat' && !d.fatCued) { d.fatCued = 1; cue('饱食度 ' + st.full + '，她的肚子把三条弹幕挤到了轨道外'); }
      if (st.base !== 'fat') d.fatCued = 0;
      if (d.t >= T.episode) roll(true);
    }

    renderBadge();
    renderTitle();
    showCard(OPEN, 4.4);
    cue('开机。海是空的，弹幕也是。');

    return {
      version: V,
      step: step,
      cue: cue,
      roll: function () { roll(true); },
      forceCard: function () { showCard(OPEN, 4.4); },
      state: function () {
        return { ep: d.ep, inEp: Math.round(d.t), eaten: d.eaten, selfEaten: d.selfEaten, laughs: d.laughs, saves: d.saves, gifts: d.gifts, title: d.title, cues: d.cues.slice(), meters: Math.round(d.dist / 100) };
      },
      tune: T
    };
  }

  window.WhaleDrama = { version: V, create: createDrama, tune: T };
})();
