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

// 投稿ペース統計を計算
function computePostingStats(groups) {
  const byMonth = {}; // "YYYY-MM" -> count
  const byDay = {};   // "YYYY-MM-DD" -> count

  groups.forEach(g => {
    const primary = g.ja || g.en || Object.values(g)[0];
    if (!primary || !primary.date) return;
    const month = primary.date.slice(0, 7);
    const day = primary.date.slice(0, 10);
    byMonth[month] = (byMonth[month] || 0) + 1;
    byDay[day] = (byDay[day] || 0) + 1;
  });

  const now = new Date();

  // 月別: 今月から12ヶ月先まで（今月が左端、未来へ）
  const months = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const m = d.getMonth() + 1;
    const label = m === 1 ? `${d.getFullYear()}年1月` : `${m}月`;
    months.push({
      key: ym,
      count: byMonth[ym] || 0,
      label,
      isFuture: i > 0,
      isCurrent: i === 0,
    });
  }

  // 日別: 今月の1日から月末まで
  const days = [];
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  for (let day = 1; day <= lastDayOfMonth; day++) {
    const d = new Date(now.getFullYear(), now.getMonth(), day);
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isFuture = d > now && !(d.toDateString() === now.toDateString());
    const isToday = d.toDateString() === now.toDateString();
    const dayOfWeek = d.getDay();
    days.push({
      key: ymd,
      count: byDay[ymd] || 0,
      label: String(day),
      isFuture,
      isToday,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      dayOfWeek,
    });
  }

  // KPIs
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

  // 今週: 今週の月曜から今日まで（カレンダー週・月曜始まり）
  const dayOfWeek = now.getDay(); // 0=日, 1=月, ..., 6=土
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  let thisWeekCount = 0;
  for (let i = 0; i <= daysSinceMonday; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    thisWeekCount += byDay[ymd] || 0;
  }

  // 先週: 先週の月曜〜日曜
  let lastWeekCount = 0;
  for (let i = daysSinceMonday + 1; i <= daysSinceMonday + 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    lastWeekCount += byDay[ymd] || 0;
  }

  // 月平均（投稿実績のある月だけで計算）
  const activeMonths = Object.keys(byMonth).filter(k => byMonth[k] > 0);
  const totalAll = activeMonths.reduce((sum, k) => sum + byMonth[k], 0);
  const avgPerMonth = activeMonths.length > 0 ? (totalAll / activeMonths.length).toFixed(1) : '0';

  return {
    months: months,
    days: days,
    kpi: {
      thisMonth: byMonth[thisMonth] || 0,
      lastMonth: byMonth[lastMonth] || 0,
      thisWeek: thisWeekCount,
      lastWeek: lastWeekCount,
      avgPerMonth: avgPerMonth,
    }
  };
}

function renderHtml(groups, langs, stats) {
  const postingStats = computePostingStats(groups);
  const maxMonth = Math.max(1, ...postingStats.months.map(m => m.count));
  const maxDay = Math.max(1, ...postingStats.days.map(d => d.count));

  const monthBars = postingStats.months.map(m => {
    const cls = [m.isCurrent ? 'current' : '', m.isFuture ? 'future' : ''].filter(Boolean).join(' ');
    return `
    <div class="chart-bar-item ${cls}" title="${m.key}: ${m.count}本${m.isFuture ? '（予定）' : ''}">
      <div class="chart-bar-wrap">
        <div class="chart-bar-value">${m.count || (m.isFuture ? '' : '0')}</div>
        <div class="chart-bar ${m.count === 0 ? 'empty' : ''}" style="height: ${m.count / maxMonth * 100}%"></div>
      </div>
      <div class="chart-bar-label ${m.isCurrent ? 'current' : ''}">${m.label}</div>
    </div>`;
  }).join('');

  // 日別投稿数: カレンダーグリッド形式
  const weekHeaders = ['日', '月', '火', '水', '木', '金', '土'];
  const dayCalHeader = weekHeaders.map((w, i) => {
    const cls = i === 0 ? 'weekend-sun' : i === 6 ? 'weekend-sat' : '';
    return `<div class="day-cal-head ${cls}">${w}</div>`;
  }).join('');
  const startWeekday = postingStats.days[0] ? postingStats.days[0].dayOfWeek : 0;
  const leadingEmpties = Array(startWeekday).fill('<div class="day-cal-cell empty-cell"></div>').join('');
  const dayCalCells = postingStats.days.map(d => {
    const hasPosts = d.count > 0;
    const cls = [
      'day-cal-cell',
      d.isToday ? 'today' : '',
      d.isFuture ? 'future' : '',
      hasPosts ? 'has-posts' : '',
      hasPosts ? 'clickable' : '',
    ].filter(Boolean).join(' ');
    const dayNumCls = d.dayOfWeek === 0 ? 'weekend-sun' : d.dayOfWeek === 6 ? 'weekend-sat' : '';
    const titleAttr = hasPosts
      ? `${d.key}: ${d.count}本${d.isFuture ? '（予定）' : ''} — クリックで記事一覧表示`
      : `${d.key}: ${d.count}本${d.isFuture ? '（予定/未来）' : ''}`;
    return `<div class="${cls}" data-date="${d.key}" title="${titleAttr}">
      <div class="day-num ${dayNumCls}">${d.label}</div>
      <div class="day-count">${hasPosts ? d.count : ''}</div>
    </div>`;
  }).join('');
  const dayCalendar = `
    <div class="day-calendar">${dayCalHeader}${leadingEmpties}${dayCalCells}</div>
  `;

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
      <tr class="cat-clickable" data-category="${escapeHtml(info.name)}" title="クリックでこのカテゴリの記事一覧を表示">
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
<link rel="icon" type="image/png" href="assets/favicon.ico">
<link rel="shortcut icon" type="image/png" href="assets/favicon.ico">
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Helvetica Neue", Arial, sans-serif;
    margin: 0; padding: 32px 24px;
    background: #f1f3f4; color: #202124;
    line-height: 1.5;
  }
  .container { max-width: 1600px; margin: 0 auto; }
  .site-header { display: flex; align-items: center; gap: 16px; margin: 0 0 24px; padding-bottom: 16px; border-bottom: 1px solid #e0e0e0; }
  .site-logo { height: 36px; width: auto; flex-shrink: 0; }
  .site-header-text { flex: 1; min-width: 0; }
  h1 { font-size: 22px; margin: 0 0 2px; color: #202124; font-weight: 600; }
  .subtitle { color: #5f6368; font-size: 12px; margin: 0; }

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
  .cat-table tbody tr.cat-clickable { cursor: pointer; transition: background 0.15s; }
  .cat-table tbody tr.cat-clickable:hover { background: #e8f0fe; }
  .cat-table tbody tr.cat-clickable td:first-child { color: #1a73e8; text-decoration: underline; }
  .cat-filter-chip { display: none; align-items: center; gap: 6px; padding: 4px 10px; background: #e8f0fe; color: #1a73e8; border-radius: 12px; font-size: 12px; font-weight: 500; }
  .cat-filter-chip.active { display: inline-flex; }
  .cat-filter-chip .clear { cursor: pointer; font-weight: bold; padding: 0 2px; }
  .cat-filter-chip .clear:hover { color: #d33; }

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

  /* ===== Posting Pace Charts ===== */
  .chart-section {
    background: #fff; border-radius: 8px; padding: 24px;
    margin-bottom: 20px; border: 1px solid #e0e0e0;
  }
  .chart-section h2 {
    font-size: 16px; margin: 0 0 4px; color: #202124;
  }
  .chart-section .chart-sub {
    font-size: 12px; color: #5f6368; margin: 0 0 16px;
  }
  .chart-bar-container {
    display: flex; align-items: flex-end; gap: 6px;
    height: 220px; margin: 12px 0;
    padding: 0 4px;
  }
  .chart-bar-container.daily { gap: 3px; height: 160px; }
  .chart-bar-item {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; gap: 4px; min-width: 0;
  }
  .chart-bar-wrap {
    flex: 1; width: 100%; display: flex; flex-direction: column;
    justify-content: flex-end; align-items: center; position: relative;
  }
  .chart-bar {
    width: 80%; background: linear-gradient(180deg, #4285f4 0%, #1a73e8 100%);
    border-radius: 3px 3px 0 0; min-height: 3px;
    transition: opacity 0.15s;
  }
  .chart-bar-item:hover .chart-bar { opacity: 0.7; }
  .chart-bar.empty { background: #e8eaed; opacity: 0.6; min-height: 2px; }
  .chart-bar.future-bar { background: #f1f3f4; }
  .chart-bar-value {
    font-size: 11px; font-weight: 700; color: #1a73e8;
    margin-bottom: 2px; min-height: 14px;
  }
  .chart-bar-value-small {
    font-size: 9px; font-weight: 700; color: #1a73e8;
    min-height: 12px;
  }
  .chart-bar-label {
    font-size: 10px; color: #5f6368; white-space: nowrap;
  }
  .chart-bar-label.current { color: #1a73e8; font-weight: 700; }
  /* 今月の強調 */
  .chart-bar-item.current .chart-bar {
    background: linear-gradient(180deg, #ff8a65 0%, #f4511e 100%);
  }
  /* 未来の月 */
  .chart-bar-item.future .chart-bar { background: #e8eaed; opacity: 0.4; }
  .chart-bar-item.future .chart-bar-label { color: #b0b0b0; }
  /* ===== Day Calendar ===== */
  .day-calendar { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
  .day-cal-head { font-size: 11px; color: #5f6368; text-align: center; padding: 6px 0 4px; font-weight: 600; }
  .day-cal-head.weekend-sun { color: #d33; }
  .day-cal-head.weekend-sat { color: #1a73e8; }
  .day-cal-cell {
    background: #fff; border: 1px solid #e8eaed; border-radius: 6px;
    min-height: 64px; padding: 6px 8px;
    display: flex; flex-direction: column; gap: 2px;
    transition: transform 0.1s, box-shadow 0.1s;
  }
  .day-cal-cell:hover { transform: translateY(-1px); box-shadow: 0 2px 6px rgba(0,0,0,0.08); }
  .day-cal-cell.empty-cell { background: transparent; border: none; min-height: 0; }
  .day-cal-cell.empty-cell:hover { transform: none; box-shadow: none; }
  .day-cal-cell.future { background: #fafbfc; }
  .day-cal-cell.today { border: 2px solid #f4511e; background: #fff7f3; padding: 5px 7px; }
  .day-cal-cell .day-num { font-size: 11px; color: #5f6368; font-weight: 500; }
  .day-cal-cell .day-num.weekend-sun { color: #d33; }
  .day-cal-cell .day-num.weekend-sat { color: #1a73e8; }
  .day-cal-cell.today .day-num { color: #f4511e; font-weight: 700; }
  .day-cal-cell.future .day-num { color: #b0b0b0; }
  .day-cal-cell .day-count {
    font-size: 22px; font-weight: 700; color: #1a73e8;
    text-align: center; line-height: 1; margin-top: auto;
  }
  .day-cal-cell.has-posts { background: linear-gradient(180deg, #e8f0fe 0%, #fff 60%); border-color: #aecbfa; }
  .day-cal-cell.future.has-posts { background: linear-gradient(180deg, #fef7e0 0%, #fff 60%); border-color: #fcd34d; }
  .day-cal-cell.future.has-posts .day-count { color: #b06000; }
  .day-cal-cell.today.has-posts .day-count { color: #f4511e; }
  .day-cal-cell.clickable { cursor: pointer; }
  .day-cal-cell.clickable:hover { transform: translateY(-2px); box-shadow: 0 4px 10px rgba(26,115,232,0.18); border-color: #1a73e8; }
  .date-filter-chip { display: none; align-items: center; gap: 6px; padding: 4px 10px; background: #fef7e0; color: #b06000; border-radius: 12px; font-size: 12px; font-weight: 500; }
  .date-filter-chip.active { display: inline-flex; }
  .date-filter-chip .clear { cursor: pointer; font-weight: bold; padding: 0 2px; }
  .date-filter-chip .clear:hover { color: #d33; }

  /* 日別 (旧棒グラフ用、互換) */
  .day-bar .chart-bar { width: 95%; }
  .day-bar.weekend .chart-bar-label { color: #d33; }
  .day-bar.today .chart-bar {
    background: linear-gradient(180deg, #ff8a65 0%, #f4511e 100%);
    min-height: 4px;
  }
  .day-bar.today .chart-bar-label {
    color: #f4511e; font-weight: 700;
  }
  .day-bar.future .chart-bar { background: #f1f3f4; opacity: 0.5; }
  .day-bar.future .chart-bar-label { color: #c0c0c0; }

  /* ===== Search ===== */
  .search-bar {
    margin-bottom: 16px; padding: 12px 16px;
    background: #fff; border: 1px solid #d0d7de; border-radius: 8px;
    display: flex; gap: 12px; align-items: center;
  }
  .search-bar input[type="text"] {
    flex: 1; padding: 8px 12px; border: 1px solid #d0d7de;
    border-radius: 4px; font-size: 14px;
  }
  .search-bar input[type="date"] {
    padding: 7px 10px; border: 1px solid #d0d7de;
    border-radius: 4px; font-size: 13px; background: #fff; color: #202124;
    font-family: inherit;
  }
  .search-bar select {
    padding: 8px 12px; border: 1px solid #d0d7de;
    border-radius: 4px; font-size: 14px; background: #fff;
  }
  .date-range { display: inline-flex; align-items: center; gap: 6px; }
  .date-sep { color: #5f6368; font-size: 12px; }
  .date-reset-btn {
    padding: 4px 10px; border: 1px solid #d0d7de;
    border-radius: 4px; font-size: 14px; background: #fff;
    cursor: pointer; color: #5f6368; line-height: 1;
  }
  .date-reset-btn:hover { background: #f1f3f4; color: #d33; border-color: #d33; }
  .row-count { color: #5f6368; font-size: 12px; }
</style>
</head>
<body>
<div class="container">
  <div class="site-header">
    <img src="assets/logo.svg" alt="YOLO MEDIA" class="site-logo">
    <div class="site-header-text">
      <h1>記事管理ダッシュボード</h1>
      <p class="subtitle">WordPress と自動同期 / ${generatedAt} 時点</p>
    </div>
  </div>

  <div class="tabs">
    <div class="tab active" data-panel="dash">ダッシュボード</div>
    <div class="tab" data-panel="pace">投稿ペース</div>
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

  <!-- ===== Posting Pace ===== -->
  <div id="pace" class="panel">
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">今月の投稿</div>
        <div class="kpi-value" style="color:#1a73e8">${postingStats.kpi.thisMonth}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">先月の投稿</div>
        <div class="kpi-value" style="color:#5f6368">${postingStats.kpi.lastMonth}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">今週の投稿（月〜今日）</div>
        <div class="kpi-value" style="color:#137333">${postingStats.kpi.thisWeek}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">先週の投稿</div>
        <div class="kpi-value" style="color:#137333">${postingStats.kpi.lastWeek}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">月平均（実績ある月）</div>
        <div class="kpi-value" style="color:#b06000">${postingStats.kpi.avgPerMonth}</div>
      </div>
    </div>

    <div class="chart-section">
      <h2>📅 月別投稿数</h2>
      <p class="chart-sub">今月から12ヶ月先までの予定（オレンジ=今月）</p>
      <div class="chart-bar-container">${monthBars}
      </div>
    </div>

    <div class="chart-section">
      <h2>📆 日別投稿数（今月）</h2>
      <p class="chart-sub">${(() => { const [y, m] = postingStats.days[0].key.split('-'); return `${y}年${parseInt(m, 10)}月`; })()}（オレンジ枠=今日 / 青=投稿済 / 黄=予定）</p>
      ${dayCalendar}
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
      <select id="categoryFilterSelect">
        <option value="">全カテゴリ</option>
      </select>
      <span class="date-range">
        <input type="date" id="dateFromInput" title="公開日: From">
        <span class="date-sep">〜</span>
        <input type="date" id="dateToInput" title="公開日: To">
        <button type="button" id="dateFilterReset" class="date-reset-btn" title="日付クリア">×</button>
      </span>
      <span class="cat-filter-chip" id="catFilterChip">カテゴリ: <span id="catFilterLabel"></span><span class="clear" id="catFilterClear" title="クリア">×</span></span>
      <span class="date-filter-chip" id="dateFilterChip">📆 公開日: <span id="dateFilterLabel"></span><span class="clear" id="dateFilterClear" title="クリア">×</span></span>
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
  const catFilterChip = document.getElementById('catFilterChip');
  const catFilterLabel = document.getElementById('catFilterLabel');
  const catFilterClear = document.getElementById('catFilterClear');
  const categoryFilterSelect = document.getElementById('categoryFilterSelect');
  const dateFilterChip = document.getElementById('dateFilterChip');
  const dateFilterLabel = document.getElementById('dateFilterLabel');
  const dateFilterClear = document.getElementById('dateFilterClear');
  const dateFromInput = document.getElementById('dateFromInput');
  const dateToInput = document.getElementById('dateToInput');
  const dateFilterReset = document.getElementById('dateFilterReset');
  const rows = Array.from(document.querySelectorAll('#dataBody tr'));
  let categoryFilter = '';
  let dateFrom = '';
  let dateTo = '';

  // 記事一覧のカテゴリ列からユニーク値を抽出してドロップダウンに投入
  const uniqueCats = Array.from(new Set(rows.map(r => r.cells[3] ? r.cells[3].textContent.trim() : '').filter(Boolean))).sort();
  uniqueCats.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    categoryFilterSelect.appendChild(opt);
  });

  function applyFilter() {
    const q = searchInput.value.toLowerCase();
    const s = statusFilter.value;
    let visible = 0;
    rows.forEach(row => {
      const text = row.textContent.toLowerCase();
      const catCell = row.cells[3] ? row.cells[3].textContent.trim() : '';
      const dateCell = row.cells[0] ? row.cells[0].textContent.trim() : '';
      const matchQ = !q || text.includes(q);
      const matchS = !s || row.textContent.includes(s);
      const matchC = !categoryFilter || catCell === categoryFilter;
      const matchFrom = !dateFrom || (dateCell && dateCell >= dateFrom);
      const matchTo = !dateTo || (dateCell && dateCell <= dateTo);
      const show = matchQ && matchS && matchC && matchFrom && matchTo;
      row.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    rowCount.textContent = visible + ' / ' + rows.length + ' 件';
    if (categoryFilter) {
      catFilterLabel.textContent = categoryFilter;
      catFilterChip.classList.add('active');
      if (categoryFilterSelect.value !== categoryFilter) categoryFilterSelect.value = categoryFilter;
    } else {
      catFilterChip.classList.remove('active');
      if (categoryFilterSelect.value !== '') categoryFilterSelect.value = '';
    }
    if (dateFrom || dateTo) {
      let label;
      if (dateFrom && dateTo) label = dateFrom === dateTo ? dateFrom : (dateFrom + ' 〜 ' + dateTo);
      else if (dateFrom) label = dateFrom + ' 以降';
      else label = dateTo + ' 以前';
      dateFilterLabel.textContent = label;
      dateFilterChip.classList.add('active');
    } else {
      dateFilterChip.classList.remove('active');
    }
    if (dateFromInput.value !== dateFrom) dateFromInput.value = dateFrom;
    if (dateToInput.value !== dateTo) dateToInput.value = dateTo;
  }

  searchInput.addEventListener('input', applyFilter);
  statusFilter.addEventListener('change', applyFilter);
  categoryFilterSelect.addEventListener('change', () => {
    categoryFilter = categoryFilterSelect.value;
    applyFilter();
  });
  catFilterClear.addEventListener('click', () => {
    categoryFilter = '';
    applyFilter();
  });
  dateFilterClear.addEventListener('click', () => {
    dateFrom = ''; dateTo = '';
    applyFilter();
  });
  dateFromInput.addEventListener('change', () => {
    dateFrom = dateFromInput.value;
    applyFilter();
  });
  dateToInput.addEventListener('change', () => {
    dateTo = dateToInput.value;
    applyFilter();
  });
  dateFilterReset.addEventListener('click', () => {
    dateFrom = ''; dateTo = '';
    applyFilter();
  });

  // カレンダーセルクリック → 記事一覧タブへ切替＋その日付の単日範囲で絞り込み
  document.querySelectorAll('.day-cal-cell.clickable').forEach(cell => {
    cell.addEventListener('click', () => {
      const date = cell.dataset.date || '';
      dateFrom = date;
      dateTo = date;
      categoryFilter = ''; // 日付フィルタを優先（カテゴリは解除）
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      document.querySelector('.tab[data-panel="data"]').classList.add('active');
      document.getElementById('data').classList.add('active');
      applyFilter();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  // カテゴリ行クリック → 記事一覧タブへ切替＋カテゴリで絞り込み
  document.querySelectorAll('.cat-table tr.cat-clickable').forEach(tr => {
    tr.addEventListener('click', () => {
      const raw = tr.dataset.category || '';
      const tmp = document.createElement('textarea');
      tmp.innerHTML = raw;
      categoryFilter = tmp.value;
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      document.querySelector('.tab[data-panel="data"]').classList.add('active');
      document.getElementById('data').classList.add('active');
      applyFilter();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

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
