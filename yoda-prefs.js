/* ============================================================
   Yoda 全站閱讀偏好同步（字級 小/中/大 · 主題 深/淺 · 語言 繁中/English）
   ------------------------------------------------------------
   目的：讀者設定一次，走到任何一份報告、任何讀者頁都記得（跨報告、跨日期）。
   報告底層有四種機制並存，本檔「只統一偏好的讀寫契約」，
   不改各報告內部實作（風險最小、對已發布的舊報告也有效）：
     ① setSize('sm'|'md'|'lg')            市場觀察/台股/總經/AI泡沫/簡報/訂閱頁/會員專區…
     ② setFS('small'|'normal'|'large')    美股與較早期報告
     ③ [data-size-btn] listener           global-leverage
     ④ setTheme('dark'|'light')           主題全站一致，無方言
   共用鍵：yoda-size（sm/md/lg）、yoda-theme（dark/light）、yoda-lang（zh/en）
   - 舊鍵一次性搬家：會員專區 member-size/member-theme、訂閱頁 sub-size/sub-theme
     → 共用鍵還沒有值才搬過去；搬完（或共用鍵已有值）舊鍵一律刪掉，之後只用 yoda-*。
   - yoda-lang 與語言切換腳本（yoda-lang.js）共用：讀寫都走 YodaPrefs.getLang/setLang；
     網址 ?lang=zh|en 由語言切換腳本處理（它會寫回 yoda-lang）。
   - 頁面載入時只「套用」偏好、不寫鍵；讀者實際按了才寫（避免預設值蓋掉讀者在別頁的選擇）。
   全域：window.YodaPrefs = { get(k,d), set(k,v), getLang(), setLang(v), KEYS }
   ============================================================ */
(function () {
  var KS = 'yoda-size', KT = 'yoda-theme', KL = 'yoda-lang';
  var TO_FS = { sm: 'small', md: 'normal', lg: 'large' };   // 共用值 → setFS 方言
  var FROM_FS = { small: 'sm', normal: 'md', large: 'lg' }; // setFS 方言 → 共用值

  function get(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }
  function set(k, v) { try { if (v) localStorage.setItem(k, v); } catch (e) {} }
  function del(k) { try { localStorage.removeItem(k); } catch (e) {} }

  // ⓪ 舊鍵搬家（一次性）：共用鍵沒有值才搬；舊鍵最後一律刪
  [[KS, ['member-size', 'sub-size'], TO_FS], [KT, ['member-theme', 'sub-theme'], { dark: 1, light: 1 }]].forEach(function (p) {
    var have = get(p[0], '');
    p[1].forEach(function (old) {
      var v = get(old, '');
      if (!v) return;
      if (!have && p[2][v]) { set(p[0], v); have = v; }
      del(old);
    });
  });

  function normLang(v) {
    v = String(v || '').toLowerCase();
    if (v === 'en' || v.indexOf('en-') === 0) return 'en';
    if (v === 'zh' || v === 'tw' || v.indexOf('zh-') === 0) return 'zh';
    return null;
  }
  window.YodaPrefs = {
    KEYS: { size: KS, theme: KT, lang: KL },
    get: get,
    set: set,
    getLang: function () { return normLang(get(KL, '')); },
    setLang: function (v) { v = normLang(v); if (v) set(KL, v); }
  };

  var size = get(KS, 'md'), theme = get(KT, 'dark');
  if (!TO_FS[size]) size = 'md';
  if (theme !== 'light' && theme !== 'dark') theme = 'dark';

  // ① 解析階段先掛屬性 → data-* 驅動的報告立即套用，減少載入時的主題閃爍
  try {
    var r = document.documentElement;
    r.setAttribute('data-size', size);
    r.setAttribute('data-theme', theme);
  } catch (e) {}

  // ② 包住既有函式：原邏輯照跑，額外把偏好寫進共用鍵
  function wrap(name, key, norm) {
    var orig = window[name];
    if (typeof orig !== 'function' || orig.__yodaWrapped) return;
    var fn = function (v) {
      var out;
      try { out = orig.apply(this, arguments); } catch (e) {}
      set(key, norm ? norm(v) : v);
      return out;
    };
    fn.__yodaWrapped = true;
    window[name] = fn;
  }

  function applySize() {
    if (typeof window.setSize === 'function') { try { window.setSize(size); } catch (e) {} return; }
    if (typeof window.setFS === 'function') { try { window.setFS(TO_FS[size]); } catch (e) {} return; }
    var b = document.querySelector('[data-size-btn="' + size + '"]');
    if (b) { try { b.click(); } catch (e) {} }
  }
  function applyTheme() {
    if (typeof window.setTheme === 'function') { try { window.setTheme(theme); } catch (e) {} return; }
    var b = document.querySelector('[data-theme-btn="' + theme + '"]');
    if (b) { try { b.click(); } catch (e) {} }
  }

  function boot() {
    // 先套用、後包裝：載入時的套用不寫鍵，只有讀者按了才寫
    applySize();
    applyTheme();
    wrap('setSize', KS);
    wrap('setFS', KS, function (v) { return FROM_FS[v] || 'md'; });
    wrap('setTheme', KT);
    // ③ 沒有函式、只有按鈕的報告：點擊時也寫入共用鍵（初始套用之後才掛，避免重複寫）
    [['data-size-btn', KS], ['data-theme-btn', KT]].forEach(function (p) {
      var list = document.querySelectorAll('[' + p[0] + ']');
      Array.prototype.forEach.call(list, function (b) {
        b.addEventListener('click', function () { set(p[1], b.getAttribute(p[0])); });
      });
    });
  }

  // setSize/setFS/setTheme 定義在 body 尾端的 inline script，需等 DOM 就緒才包得到
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
