#!/usr/bin/env node
/**
 * YOLO MEDIA 記事管理ダッシュボード HTMLジェネレーター
 *
 * WordPress REST API から記事一覧を取得し、自己完結型の HTML を生成。
 * 出力: docs/dashboard.html
 *
 * 使い方:
 *   npm run dashboard           # HTML生成
 *   open docs/dashboard.html    # ブラウザで開く
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// 設定
// ---------------------------------------------------------------------------

const LANG_CONFIG = {
  ja:        { label: '日本語',                emoji: '🇯🇵', priority: 1 },
  en:        { label: '英語',                  emoji: '🇬🇧', priority: 2 },
  'zh-hans': { label: '中国語(簡体)',          emoji: '🇨🇳', priority: 3 },
  'zh-hant': { label: '中国語(繁体・台湾)',    emoji: '🇹🇼', priority: 4 },
  'zh-hk':   { label: '中国語(繁体・香港)',    emoji: '🇭🇰', priority: 5 },
  ko:        { label: '韓国語',                emoji: '🇰🇷', priority: 6 },
  vi:        { label: 'ベトナム語',            emoji: '🇻🇳', priority: 7 },
  pt:        { label: 'ポルトガル語',          emoji: '🇧🇷', priority: 8 },
  ne:        { label: 'ネパール語',            emoji: '🇳🇵', priority: 9 },
  es:        { label: 'スペイン語',            emoji: '🇪🇸', priority: 10 },
  id:        { label: 'インドネシア語',        emoji: '🇮🇩', priority: 11 },
  my:        { label: 'ミャンマー語',          emoji: '🇲🇲', priority: 12 },
  fr:        { label: 'フランス語',            emoji: '🇫🇷', priority: 13 },
};

const CANVA_DESIGN_MAP = {
  635:  'DAHFgaUFgsk',
  1430: 'DAHIB6_lxjY',
  1428: 'DAHIBuXugAI',
  1419: 'DAHHuWggikM',
  1387: 'DAHHeJ5o8tA',
  1386: 'DAHHd1bUUy8',
  1383: 'DAHHdhWgLL8',
  1369: 'DAHFtkB-LNA',
  1353: 'DAHHcFimkOs',
  642:  'DAHFgd-hJtk',
  627:  'DAHFgaAOmIc',
  1268: 'DAHHYXCjK2o',
  1258: 'DAHHYAlgq0g',
  1130: 'DAHG_9OGEV4',
  1134: 'DAHG-mJiG1I',
  1132: 'DAHG_pkblt4',
  1126: 'DAHHEJTtruE',
  1124: 'DAHHECvytRg',
  1114: 'DAHGPkjXO44',
  616:  'DAHFgCPp7zs',
  600:  'DAHFf9Bk_OQ',
  562:  'DAHFgDd1YLk',
  553:  'DAHFfnojigE',
  545:  'DAHFfcUS5Jw',
  474:  'DAHE9-QF9-o',
  517:  'DAHE9rXvmnY',
};

const STALE_DAYS = 180;
const OUTPUT_DIR = path.join(__dirname, '..', 'docs');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'dashboard.html');
const INDEX_FILE = path.join(OUTPUT_DIR, 'index.html'); // GitHub Pages用

// ---------------------------------------------------------------------------
// .env 読み込み
// ---------------------------------------------------------------------------

function loadEnv() {
  // GitHub Actions では process.env に既にセットされてるので .env は不要
  if (process.env.WP_URL && process.env.WP_USER && process.env.WP_APP_PASSWORD) {
    return;
  }
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error('.env が見つからず、環境変数も未設定です');
  }
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) return;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  });
}

// ---------------------------------------------------------------------------
// WordPress 取得
// ---------------------------------------------------------------------------

async function fetchAllPosts() {
  const wpUrl = (process.env.WP_URL || '').replace(/\/+$/, '');
  const wpUser = process.env.WP_USER;
  const wpPass = process.env.WP_APP_PASSWORD;
  if (!wpUrl || !wpUser || !wpPass) {
    throw new Error('.env に WP_URL / WP_USER / WP_APP_PASSWORD が設定されていません');
  }
  const auth = Buffer.from(`${wpUser}:${wpPass}`).toString('base64');
  const headers = {
    Authorization: `Basic ${auth}`,
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
  };
  const allPosts = [];
  for (let page = 1; page <= 50; page++) {
    const url = `${wpUrl}/wp-json/wp/v2/posts?per_page=100&page=${page}` +
      `&status=publish,draft,pending,future,private&_embed=wp:term`;
    const res = await fetch(url, { headers });
    if (res.status === 400 || res.status === 404) break;
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`WP API error ${res.status}: ${body.slice(0, 300)}`);
    }
    const posts = await res.json();
    if (!posts.length) break;
    allPosts.push(...posts);
    if (posts.length < 100) break;
  }
  return allPosts;
}

// ---------------------------------------------------------------------------
// グルーピング・整形
// ---------------------------------------------------------------------------

function groupByTranslations(posts) {
  const groups = {};
  posts.forEach(p => {
    let key;
    if (p.translations && Object.keys(p.translations).length > 0) {
      key = Object.values(p.translations).sort((a, b) => a - b).join('-');
    } else {
      key = `solo-${p.id}`;
    }
    if (!groups[key]) groups[key] = {};
    const lang = String(p.lang || 'ja').toLowerCase();
    groups[key][lang] = p;
  });
  return Object.values(groups);
}

function detectLanguages(posts) {
  const set = new Set();
  posts.forEach(p => { if (p.lang) set.add(String(p.lang).toLowerCase()); });
  if (set.size === 0) set.add('ja');
  return Array.from(set).sort((a, b) => {
    const pa = LANG_CONFIG[a] ? LANG_CONFIG[a].priority : 999;
    const pb = LANG_CONFIG[b] ? LANG_CONFIG[b].priority : 999;
    return pa - pb;
  });
}

function decodeHtml(s) {
  if (!s) return '';
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'")
    .replace(/&#8211;/g, '–').replace(/&#8212;/g, '—')
    .replace(/&#8216;|&#8217;/g, "'").replace(/&#8220;|&#8221;/g, '"')
    .replace(/&nbsp;/g, ' ');
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function extractCategoryFolder(post) {
  if (!post || !post._embedded || !post._embedded['wp:term']) return '';
  const terms = [].concat(...post._embedded['wp:term']);
  const cat = terms.find(t => t.taxonomy === 'category');
  if (!cat) return '';
  return (cat.slug || '').replace(/-en$/, '');
}

function extractCategoryName(post) {
  if (!post || !post._embedded || !post._embedded['wp:term']) return '';
  const terms = [].concat(...post._embedded['wp:term']);
  const cat = terms.find(t => t.taxonomy === 'category');
  if (!cat) return '';
  return decodeHtml(cat.name || '');
}

function extractFeaturedImage(post) {
  if (!post || !post._embedded || !post._embedded['wp:featuredmedia']) return '';
  const m = post._embedded['wp:featuredmedia'][0];
  return m && m.source_url ? m.source_url : '';
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function combinedStatus(g) {
  const langs = Object.keys(g);
  const statuses = langs.map(l => g[l] && g[l].status).filter(Boolean);
  if (statuses.length === 0) return { label: '', cls: '' };
  const allPublish = statuses.every(s => s === 'publish');
  const noPublish = statuses.every(s => s !== 'publish');
  const hasFuture = statuses.some(s => s === 'future');
  if (allPublish) return { label: '✅ 公開', cls: 'b-pub' };
  if (noPublish) {
    return hasFuture
      ? { label: '⏰ 予約投稿', cls: 'b-future' }
      : { label: '📝 下書き', cls: 'b-draft' };
  }
  const publishedLangs = langs.filter(l => g[l] && g[l].status === 'publish').map(l => l.toUpperCase());
  return { label: `⚠️ 部分公開 (${publishedLangs.join(',')}のみ)`, cls: 'b-partial' };
}

function latestModified(g) {
  const dates = Object.values(g).map(p => p && p.modified).filter(Boolean);
  if (!dates.length) return '';
  dates.sort();
  return formatDate(dates[dates.length - 1]);
}

function buildCanvaUrl(g) {
  for (const lang of Object.keys(g)) {
    const post = g[lang];
    if (post && CANVA_DESIGN_MAP[post.id]) {
      return `https://www.canva.com/design/${CANVA_DESIGN_MAP[post.id]}/view`;
    }
  }
  return '';
}

// ファイル列用：言語別にスラッグだけ抽出（HTML生成時に整形）
function buildFileItems(folder, g) {
  if (!folder) return [];
  const items = [];
  Object.keys(g).forEach(lang => {
    const p = g[lang];
    if (!p || !p.slug) return;
    const filename = (lang === 'en') ? `${p.slug}.md` : `${p.slug}-${lang}.md`;
    items.push({
      lang: lang,
      filename: filename,
      fullPath: `${folder}/${filename}`,
      copyPath: `YOLO Media/${folder}/${filename}`,
    });
  });
  return items;
}

function isStale(g) {
  const dates = Object.values(g).map(p => p && p.modified).filter(Boolean);
  if (!dates.length) return false;
  const latest = Math.max(...dates.map(d => new Date(d).getTime()));
  const staleMs = STALE_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() - latest > staleMs;
}

// ---------------------------------------------------------------------------
// 統計
// ---------------------------------------------------------------------------

function computeStats(groups, langs) {
  const stats = {
    total: groups.length,
    fullPublished: 0,
    partial: 0,
    allDraft: 0,
    stale: 0,
    byLang: {},
    byCategory: {},
  };
  langs.forEach(l => stats.byLang[l] = 0);
  groups.forEach(g => {
    const langPosts = langs.map(l => g[l]).filter(Boolean);
    const publishedCount = langPosts.filter(p => p.status === 'publish').length;
    if (langPosts.length > 0 && publishedCount === langPosts.length) stats.fullPublished++;
    else if (publishedCount > 0) stats.partial++;
    else stats.allDraft++;
    langs.forEach(l => { if (g[l]) stats.byLang[l]++; });
    if (isStale(g)) stats.stale++;
    const primary = langPosts[0];
    const folder = extractCategoryFolder(primary);
    const catName = extractCategoryName(primary);
    if (folder) {
      if (!stats.byCategory[folder]) stats.byCategory[folder] = { name: catName, count: 0 };
      stats.byCategory[folder].count++;
    }
  });
  return stats;
}

// ---------------------------------------------------------------------------
// HTML生成
// ---------------------------------------------------------------------------

function renderHtml(groups, langs, stats) {
  const langKpis = langs.map(lang => {
    const cfg = LANG_CONFIG[lang] || { label: lang, emoji: '🌐' };
    return { label: `${cfg.emoji} ${cfg.label}`, value: stats.byLang[lang] || 0, color: '#1565c0' };
  });

  const baseKpis = [
    { label: '合計記事',  value: stats.total,         color: '#1a73e8' },
    { label: '完全公開',  value: stats.fullPublished, color: '#137333' },
    { label: '部分公開',  value: stats.partial,       color: '#b06000' },
    { label: '全下書き',  value: stats.allDraft,      color: '#5f6368' },
    { label: '古記事 🟡', value: stats.stale,         color: '#f57f17' },
  ];

  const kpiCards = [...baseKpis, ...langKpis].map(k => `
    <div class="kpi-card">
      <div class="kpi-label">${escapeHtml(k.label)}</div>
      <div class="kpi-value" style="color:${k.color}">${k.value}</div>
    </div>`).join('');

  const catRows = Object.entries(stats.byCategory)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([folder, info]) => `
      <tr>
        <td>${escapeHtml(info.name)}</td>
        <td><code>${escapeHtml(folder)}</code></td>
        <td class="num">${info.count}</td>
      </tr>`).join('');

  // 公開日降順でソート
  const sortedGroups = groups.slice().sort((a, b) => {
    const aDate = (a.ja || a.en || Object.values(a)[0]).date || '';
    const bDate = (b.ja || b.en || Object.values(b)[0]).date || '';
    return bDate.localeCompare(aDate);
  });

  const dataRows = sortedGroups.map(g => {
    const primary = g.ja || g.en || Object.values(g)[0];
    const folder = extractCategoryFolder(primary);
    const titleSource = g.ja || g.en || Object.values(g)[0];
    const title = decodeHtml(titleSource && titleSource.title.rendered || '');
    const category = extractCategoryName(primary) || folder;
    const fileItems = buildFileItems(folder, g);
    const date = primary && primary.date ? formatDate(primary.date) : '';
    const modified = latestModified(g);
    const status = combinedStatus(g);
    const canva = buildCanvaUrl(g);
    const stale = isStale(g);

    // 言語別URLセル
    const langCells = langs.map(lang => {
      const post = g[lang];
      if (!post) return '<td class="lang-cell empty">—</td>';
      const cfg = LANG_CONFIG[lang] || { label: lang, emoji: '🌐' };
      return `<td class="lang-cell"><a href="${escapeHtml(post.link)}" target="_blank" rel="noopener">${cfg.emoji} ${escapeHtml(cfg.label)}</a></td>`;
    }).join('');

    const canvaCell = canva
      ? `<td><a href="${escapeHtml(canva)}" target="_blank" rel="noopener" class="canva-link">🎨 Canvaで開く</a></td>`
      : '<td class="empty">—</td>';

    const filePathHtml = fileItems.length === 0
      ? '<span class="empty">—</span>'
      : fileItems.map(it => {
          const cfg = LANG_CONFIG[it.lang] || { emoji: '🌐' };
          return `<div class="file-item" data-copy="${escapeHtml(it.copyPath)}" title="クリックでコピー: ${escapeHtml(it.copyPath)}"><span class="file-flag">${cfg.emoji}</span><span class="file-name">${escapeHtml(it.filename)}</span><span class="file-copy-icon">📋</span></div>`;
        }).join('');

    return `
      <tr>
        <td class="date">${escapeHtml(date)}</td>
        <td class="date">${escapeHtml(modified)}</td>
        <td class="title-cell">${escapeHtml(title)}${stale ? ' <span class="stale" title="半年以上更新なし">🟡</span>' : ''}</td>
        <td>${escapeHtml(category)}</td>
        <td><span class="badge ${status.cls}">${escapeHtml(status.label)}</span></td>
        ${langCells}
        <td class="filepath">${filePathHtml}</td>
        ${canvaCell}
      </tr>`;
  }).join('');

  const langHeaders = langs.map(lang => {
    const cfg = LANG_CONFIG[lang] || { label: lang, emoji: '🌐' };
    return `<th>${cfg.emoji} ${escapeHtml(cfg.label)}</th>`;
  }).join('');

  const now = new Date();
  const generatedAt = now.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>YOLO MEDIA 記事管理ダッシュボード</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Helvetica Neue", Arial, sans-serif;
    margin: 0; padding: 32px 24px;
    background: #f1f3f4; color: #202124;
    line-height: 1.5;
  }
  .container { max-width: 1600px; margin: 0 auto; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  .subtitle { color: #5f6368; font-size: 13px; margin: 0 0 24px; }

  /* ===== Tabs ===== */
  .tabs { display: flex; border-bottom: 2px solid #d0d7de; margin: 24px 0 0; }
  .tab {
    padding: 10px 20px; cursor: pointer; font-size: 14px; font-weight: 500;
    color: #5f6368; border-bottom: 3px solid transparent; margin-bottom: -2px;
  }
  .tab.active { color: #1a73e8; border-bottom-color: #1a73e8; }
  .panel { display: none; padding-top: 24px; }
  .panel.active { display: block; }

  /* ===== Dashboard ===== */
  .kpi-grid {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px; margin-bottom: 32px;
  }
  .kpi-card {
    background: #fff; border: 1px solid #e0e0e0; border-radius: 8px;
    padding: 16px 12px; text-align: center;
  }
  .kpi-label {
    font-size: 11px; color: #5f6368; text-transform: uppercase;
    letter-spacing: 0.5px; margin-bottom: 6px;
  }
  .kpi-value { font-size: 32px; font-weight: 700; line-height: 1; }
  .cat-section { background: #fff; border-radius: 8px; padding: 20px; }
  .cat-section h2 { font-size: 16px; margin: 0 0 12px; }
  .cat-table { width: 100%; max-width: 600px; border-collapse: collapse; }
  .cat-table th, .cat-table td { padding: 10px 14px; text-align: left; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
  .cat-table th { background: #1a73e8; color: #fff; font-weight: 600; }
  .cat-table td.num { text-align: right; font-weight: 600; }
  .cat-table code { background: #f1f3f4; padding: 2px 6px; border-radius: 3px; font-size: 12px; }

  /* ===== Data Table ===== */
  .data-wrap {
    background: #fff; border: 1px solid #d0d7de; border-radius: 8px;
    overflow: auto; max-height: calc(100vh - 200px);
  }
  table.data { width: 100%; border-collapse: collapse; font-size: 13px; }
  table.data th, table.data td {
    padding: 10px 12px; border-bottom: 1px solid #e0e0e0;
    text-align: left; vertical-align: middle; white-space: nowrap;
  }
  table.data th {
    background: #1a73e8; color: #fff; font-weight: 600; font-size: 12px;
    position: sticky; top: 0; z-index: 1; text-align: center;
  }
  table.data tbody tr:nth-child(even) { background: #f8f9fa; }
  table.data tbody tr:hover { background: #e8f0fe; }
  td.title-cell {
    font-weight: 500; max-width: 380px; overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap;
  }
  td.filepath {
    width: 260px; max-width: 260px; padding: 6px 10px;
  }
  .file-item {
    display: flex; align-items: center; gap: 6px;
    font-family: Menlo, Monaco, monospace; font-size: 10px; color: #5f6368;
    line-height: 1.5; padding: 3px 6px;
    border-radius: 4px;
    cursor: pointer;
    overflow: hidden;
    transition: background 0.15s;
  }
  .file-item:hover { background: #e8f0fe; color: #1a73e8; }
  .file-item.copied { background: #e6f4ea !important; color: #137333 !important; }
  .file-item.copied .file-copy-icon::after { content: "✓ コピー済"; margin-left: 2px; font-family: -apple-system, sans-serif; font-size: 10px; }
  .file-item.copied .file-copy-icon { font-size: 0; }
  .file-flag { flex-shrink: 0; font-size: 11px; }
  .file-name {
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    flex: 1;
  }
  .file-copy-icon {
    flex-shrink: 0; font-size: 11px; opacity: 0.4;
    transition: opacity 0.15s;
  }
  .file-item:hover .file-copy-icon { opacity: 1; }
  td.date { color: #5f6368; font-size: 12px; }
  td a { color: #1a73e8; text-decoration: none; }
  td a:hover { text-decoration: underline; }
  .lang-cell { text-align: center; }
  .lang-cell.empty, td.empty { color: #c0c0c0; text-align: center; }
  .canva-link { color: #00c4cc !important; font-weight: 500; }
  td:last-child { min-width: 130px; text-align: center; }

  /* ===== Status badges ===== */
  .badge {
    display: inline-block; padding: 3px 10px; border-radius: 12px;
    font-size: 11px; font-weight: 600; white-space: nowrap;
  }
  .b-pub { background: #e6f4ea; color: #137333; }
  .b-draft { background: #f1f3f4; color: #5f6368; }
  .b-partial { background: #fef7e0; color: #b06000; }
  .b-future { background: #e8f0fe; color: #1967d2; }
  .stale { color: #f57f17; margin-left: 4px; }

  /* ===== Footer ===== */
  .footer {
    margin-top: 24px; text-align: right; font-size: 11px;
    color: #5f6368; font-style: italic;
  }

  /* ===== Search ===== */
  .search-bar {
    margin-bottom: 16px; padding: 12px 16px;
    background: #fff; border: 1px solid #d0d7de; border-radius: 8px;
    display: flex; gap: 12px; align-items: center;
  }
  .search-bar input {
    flex: 1; padding: 8px 12px; border: 1px solid #d0d7de;
    border-radius: 4px; font-size: 14px;
  }
  .search-bar select {
    padding: 8px 12px; border: 1px solid #d0d7de;
    border-radius: 4px; font-size: 14px; background: #fff;
  }
  .row-count { color: #5f6368; font-size: 12px; }
</style>
</head>
<body>
<div class="container">
  <h1>YOLO MEDIA 記事管理ダッシュボード</h1>
  <p class="subtitle">WordPress と自動同期 / ${generatedAt} 時点</p>

  <div class="tabs">
    <div class="tab active" data-panel="dash">ダッシュボード</div>
    <div class="tab" data-panel="data">記事一覧</div>
  </div>

  <!-- ===== Dashboard ===== -->
  <div id="dash" class="panel active">
    <div class="kpi-grid">${kpiCards}
    </div>
    <div class="cat-section">
      <h2>カテゴリ別記事数</h2>
      <table class="cat-table">
        <thead><tr><th>カテゴリ</th><th>フォルダ名</th><th class="num">記事数</th></tr></thead>
        <tbody>${catRows}
        </tbody>
      </table>
    </div>
  </div>

  <!-- ===== Data Table ===== -->
  <div id="data" class="panel">
    <div class="search-bar">
      <input type="text" id="searchInput" placeholder="🔍 タイトル・カテゴリで検索...">
      <select id="statusFilter">
        <option value="">全ステータス</option>
        <option value="✅ 公開">✅ 公開</option>
        <option value="⚠️ 部分公開">⚠️ 部分公開</option>
        <option value="📝 下書き">📝 下書き</option>
        <option value="⏰ 予約投稿">⏰ 予約投稿</option>
      </select>
      <span class="row-count" id="rowCount"></span>
    </div>
    <div class="data-wrap">
      <table class="data">
        <thead>
          <tr>
            <th>公開日</th>
            <th>更新日</th>
            <th>タイトル</th>
            <th>カテゴリ</th>
            <th>ステータス</th>
            ${langHeaders}
            <th>ファイル</th>
            <th>Canva</th>
          </tr>
        </thead>
        <tbody id="dataBody">${dataRows}
        </tbody>
      </table>
    </div>
  </div>

  <p class="footer">最終更新: ${generatedAt} (Asia/Tokyo)</p>
</div>

<script>
  // タブ切替
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.panel).classList.add('active');
    });
  });

  // 検索・フィルタ
  const searchInput = document.getElementById('searchInput');
  const statusFilter = document.getElementById('statusFilter');
  const rowCount = document.getElementById('rowCount');
  const rows = Array.from(document.querySelectorAll('#dataBody tr'));

  function applyFilter() {
    const q = searchInput.value.toLowerCase();
    const s = statusFilter.value;
    let visible = 0;
    rows.forEach(row => {
      const text = row.textContent.toLowerCase();
      const matchQ = !q || text.includes(q);
      const matchS = !s || row.textContent.includes(s);
      const show = matchQ && matchS;
      row.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    rowCount.textContent = visible + ' / ' + rows.length + ' 件';
  }

  searchInput.addEventListener('input', applyFilter);
  statusFilter.addEventListener('change', applyFilter);
  applyFilter();

  // ファイルパス クリックでコピー
  document.addEventListener('click', e => {
    const item = e.target.closest('.file-item');
    if (!item) return;
    const path = item.dataset.copy;
    if (!path) return;
    navigator.clipboard.writeText(path).then(() => {
      item.classList.add('copied');
      setTimeout(() => item.classList.remove('copied'), 1500);
    }).catch(() => {
      // フォールバック: 古いブラウザ用
      const ta = document.createElement('textarea');
      ta.value = path;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (_) {}
      document.body.removeChild(ta);
      item.classList.add('copied');
      setTimeout(() => item.classList.remove('copied'), 1500);
    });
  });
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------

async function main() {
  loadEnv();
  console.log('[1/3] WordPress から記事取得中…');
  const posts = await fetchAllPosts();
  console.log(`  → ${posts.length}件取得`);

  console.log('[2/3] データ整形中…');
  const groups = groupByTranslations(posts);
  const langs = detectLanguages(posts);
  const stats = computeStats(groups, langs);
  console.log(`  → ${groups.length}記事グループ / 言語: ${langs.join(', ')}`);

  console.log('[3/3] HTML生成中…');
  const html = renderHtml(groups, langs, stats);
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, html, 'utf-8');
  fs.writeFileSync(INDEX_FILE, html, 'utf-8');
  console.log(`  → ${OUTPUT_FILE}`);
  console.log(`  → ${INDEX_FILE} (GitHub Pages用)`);
  console.log(`\n✅ 完了。次のコマンドでブラウザで開けます:`);
  console.log(`   open ${OUTPUT_FILE}`);
}

main().catch(err => {
  console.error('❌ エラー:', err.message);
  process.exit(1);
});
