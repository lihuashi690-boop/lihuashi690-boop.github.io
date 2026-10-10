"use strict";
// BOARD: category pages share a reader, while source updates and daily picks are separate views.
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const STATIC_CONFIG = window.JIANWEI_STATIC || null;
const BASE_PATH = STATIC_CONFIG?.basePath || '/';
const sitePath = path => BASE_PATH + path.replace(/^\/+/, '');
function appPath() { const prefix=BASE_PATH==='/'?'':BASE_PATH.replace(/\/$/,'');return (location.pathname.startsWith(prefix+'/')?location.pathname.slice(prefix.length):location.pathname).replace(/\/+$/,'') || '/'; }
const e = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const icons = {
  'arrow-right':'<path d="M4 12h16m-6-6 6 6-6 6"/>', 'arrow-up-right':'<path d="M6 18 18 6M6 6h12v12"/>',
  left:'<path d="m15 6-6 6 6 6"/>',right:'<path d="m9 6 6 6-6 6"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',
  refresh:'<path d="M20 4v6h-6M4 20v-6h6M5 8a8 8 0 0 1 14-2M19 16a8 8 0 0 1-14 2"/>',
  settings:'<path d="m9 3-1 3-3 1-2 3 2 3v3l3 2 1 3h5l1-3 3-1 3-3-2-3V8l-3-2-1-3Z"/><circle cx="11.5" cy="12" r="3"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  list:'<path d="M8 6h12M8 12h12M8 18h12M3 6h.01M3 12h.01M3 18h.01"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  chart:'<path d="M4 3v18h18M9 16v-5M14 16V6M19 16v-8"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  rss:'<circle cx="5" cy="19" r="1"/><path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.info}</svg>`;
const safeURL = value => { try { const u = new URL(value); return ['http:','https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
const external = (url, label, cls = '') => safeURL(url) ? `<a class="${cls}" href="${e(safeURL(url))}" target="_blank" rel="noopener noreferrer">${label}</a>` : `<span class="${cls}">${label}</span>`;
const brief = (value, limit = 170) => { const str = String(value || '').replace(/\s+/g,' ').trim(); return str.length > limit ? str.slice(0, limit) + '…' : str; };
const number = value => Number(value || 0).toLocaleString('zh-CN');
let catalog, route, renderVersion = 0, readerVersion = 0, toastTimer, fetchTimer;
const articleCache = new Map(), sourceCache = new Map();
function timestamp(value, short = false) {
  if (!value) return '尚未检查';
  try { return new Intl.DateTimeFormat('zh-CN', {timeZone:catalog?.timezone || 'Asia/Shanghai', ...(short ? {} : {month:'2-digit',day:'2-digit'}),hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value)); } catch { return '时间待核验'; }
}
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 4500); }
async function api(url, options) {
  if (STATIC_CONFIG) return window.jianweiStaticAPI.request(url,options);
  const response = await fetch(url, options && {...options,headers:{'Content-Type':'application/json',...options.headers}});
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : `请求未完成（${response.status}）`);
  return data;
}
function readRoute() {
  const p = new URLSearchParams(location.search);
  const category = appPath().split('/')[2] || 'ai';
  return {insights:appPath() === '/insights',category, date:p.get('date') || catalog.date, subcategory:p.get('subcategory') || '',q:p.get('q') || '',view:p.get('view') === 'picks' ? 'picks' : 'bloggers', updated:p.get('updated_only') !== 'false', page:Math.max(1,parseInt(p.get('page') || '1',10) || 1),days:[1,7,30].includes(Number(p.get('days'))) ? Number(p.get('days')) : 7, scope:p.get('category') || ''};
}
function changeRoute(changes = {}, path = location.pathname) {
  const p = new URLSearchParams(location.search);
  for (const [key,value] of Object.entries(changes)) { if (value === '' || value === null || value === false) p.delete(key); else p.set(key,String(value)); }
  history.pushState({},'',path + (p.size ? '?' + p : ''));
  render();
}
async function goToday() {
  try { catalog = STATIC_CONFIG ? await window.jianweiStaticAPI.refresh() : await api('/api/board/catalog'); changeRoute({date:null,page:null}); }
  catch(error) { toast(error.message); }
}
function categoryURL(id) { const p = new URLSearchParams(); if (route.date !== catalog.date) p.set('date',route.date); return sitePath('/category/' + id) + (p.size ? '?' + p : ''); }
function renderNav() {
  $('#category-nav').innerHTML = catalog.categories.map(c => `<a data-route class="category-link ${!route.insights && route.category===c.id?'active':''}" href="${e(categoryURL(c.id))}" ${!route.insights && route.category===c.id?'aria-current="page"':''}>${e(c.name)}<span class="nav-count">${number(c.count)}</span></a>`).join('') + `<a data-route class="category-link summary-nav ${route.insights?'active':''}" href="${sitePath('/insights')}${route.date!==catalog.date?'?date='+e(route.date):''}" ${route.insights?'aria-current="page"':''}>${icon('chart')}综合总结</a>`;
  $('#header-status').textContent = STATIC_CONFIG ? `数据生成 ${timestamp(catalog.generated_at)}` : catalog.last_fetch ? `最近检查 ${timestamp(catalog.last_fetch)}` : '等待首次采集';
}
function dateControl() { return `<div class="date-control"><button class="icon-button" data-day="-1" aria-label="前一天" ${catalog.min_date&&route.date<=catalog.min_date?'disabled':''}>${icon('left')}</button><input id="board-date" type="date" aria-label="阅读日期" value="${e(route.date)}" ${catalog.min_date?`min="${e(catalog.min_date)}"`:''} max="${e(catalog.date)}"><button class="icon-button" data-day="1" aria-label="后一天" ${route.date>=catalog.date?'disabled':''}>${icon('right')}</button><button class="today-button" data-today>${STATIC_CONFIG?'最新':'今天'}</button></div>`; }
function heading(title, description, stats) { return `<div class="page-heading"><div><h1>${e(title)}</h1><p class="page-description">${e(description)}</p></div><div class="heading-meta">${stats.map(([count,label])=>`<div class="heading-stat"><strong>${number(count)}</strong><span>${e(label)}</span></div>`).join('')}</div></div>`; }
function cacheArticles(items) { items.forEach(a => articleCache.set(String(a.id),a)); }
function articleEntry(a) {
  const revised = a.change_kind === 'revised', discovered = a.change_kind === 'discovered';
  return `<article class="article-entry" data-article-id="${e(a.id)}"><div class="article-entry-top"><h3 class="article-entry-title"><button data-read="${e(a.id)}">${e(a.title || '未命名文章')}</button></h3><time class="article-entry-time" title="${e(a.change_at || a.published_at || '')}">${timestamp(a.change_at || a.published_at, true)}</time></div><p class="article-brief">${e(brief(a.summary) || '订阅未提供摘要，点击标题查看已收录内容。')}</p><div class="article-entry-bottom"><span class="change-tag ${revised?'revised':''}">${discovered?'新收录 · 发布时间待核验':revised?'内容修订':'当日发布'}${a.revised_today&&!revised?' · 有修订':''}</span>${revised?`<span class="entry-publish-date">原发布 ${a.published_at?e(timestamp(a.published_at)):'日期待核验'}</span>`:''}${external(a.url,`查看原文 ${icon('arrow-up-right')}`,'article-original')}</div></article>`;
}
function sourcePanel(s) {
  const failed = ['request_failed','parse_failed','failed','error'].includes(s.status);
  const status = failed ? '最近检查未成功' : s.last_success ? '最近检查' : s.last_checked ? '等待有效订阅' : '尚未检查';
  return `<section class="blogger-panel ${s.article_count?'':'no-updates'}" data-source-id="${e(s.source_id)}"><div class="source-column"><div class="source-top"><span class="source-avatar" aria-hidden="true">${e(Array.from(s.name || '阅')[0])}</span><span class="source-order" title="原表顺序">${String(s.source_order).padStart(3,'0')}</span></div><div class="source-subcategory">${e(s.subcategory)}</div>${external(s.homepage_url,e(s.name) + icon('arrow-up-right'),'source-name')}<div class="source-keywords" title="${e(s.keywords.join(' · '))}">${s.keywords.slice(0,4).map(k=>`<span class="keyword">${e(k)}</span>`).join('')}</div><p class="source-check ${failed?'error':''}" title="${failed?e(brief(s.error,180)):''}">${status}${s.last_checked?' '+timestamp(s.last_checked):''}</p></div><div class="source-content">${s.article_count?`<div class="source-content-heading"><span class="source-count"><span class="tiny-line"></span>当日 ${number(s.article_count)} 篇更新</span></div>${s.articles.map(articleEntry).join('')}${s.has_more_articles?`<button class="load-more-articles" data-more-source="${e(s.source_id)}">继续查看 · 还有 ${number(s.article_count-s.articles.length)} 篇 ${icon('right')}</button>`:''}`:`<div class="source-empty">${icon('rss')}<div>当日暂无已收录更新<small>${failed?'来源暂未抓取成功，不能据此判断是否发文。':!s.last_success?'待成功采集后显示内容。':'可切换日期查看已收录的历史内容。'}</small></div></div>`}</div></section>`;
}
function boardControls(category) {
  return `<div class="subcategory-bar" aria-label="关键词小分类"><button class="subcategory-chip ${!route.subcategory?'active':''}" data-subcategory="" aria-pressed="${!route.subcategory}">全部<span>${number(category.count)}</span></button>${category.subcategories.map(s=>`<button class="subcategory-chip ${route.subcategory===s.name?'active':''}" data-subcategory="${e(s.name)}" aria-pressed="${route.subcategory===s.name}">${e(s.name)}<span>${number(s.count)}</span></button>`).join('')}</div><div class="control-bar"><div class="view-tabs" aria-label="阅读方式"><button data-view="bloggers" class="${route.view==='bloggers'?'active':''}" aria-pressed="${route.view==='bloggers'}">${icon('list')}博主更新</button><button data-view="picks" class="${route.view==='picks'?'active':''}" aria-pressed="${route.view==='picks'}">${icon('grid')}每日精选</button></div><div class="filter-controls"><form class="search-field" id="board-search">${icon('search')}<input name="q" aria-label="搜索博主、关键词或文章" placeholder="搜索博主、关键词、文章" value="${e(route.q)}" maxlength="200"><button class="search-submit icon-button" aria-label="搜索">${icon('arrow-right')}</button></form>${dateControl()}${route.view==='bloggers'?`<label class="check-filter"><input id="updated-only" type="checkbox" ${route.updated?'checked':''}>只看有更新</label>`:''}</div></div>`;
}
function emptyState(title, message) { return `<div class="empty-state"><h3>${e(title)}</h3><p>${e(message)}</p><div class="empty-actions"><button class="secondary-button" data-reset>清除筛选</button><button class="primary-button" data-today>回到今天 ${icon('arrow-right')}</button></div></div>`; }
function picksContent(data) {
  cacheArticles(data.items);
  return `<div class="picks-intro"><h2>每日精选，先看内容</h2><p>每位作者一条近期更新，配上原文短摘要。<br>感兴趣的，再展开阅读。</p></div>${data.items.length?`<div class="picks-grid">${data.items.map((a,i)=>`<article class="pick-card"><div class="pick-meta"><span class="pick-category">${e(a.subcategory)}</span><span class="pick-number">${String(i+1).padStart(2,'0')}</span></div><h3><button data-read="${e(a.id)}">${e(a.title)}</button></h3><p class="pick-summary">${e(a.short_summary || '订阅未提供摘要，点击标题查看。')}</p><div class="pick-bottom"><span class="pick-author">${e(a.source_name)}${a.change_kind==='discovered'?' · 发布时间待核验':a.change_kind==='revised'?' · 内容修订':''}</span><button data-read="${e(a.id)}" class="pick-open" aria-label="阅读 ${e(a.title)}">${icon('arrow-up-right')}</button></div></article>`).join('')}</div>`:emptyState('这个分区当天还没有精选','精选取自当天已收录的博主更新；可切换日期或小分类。')}<p class="picks-method">${e(data.method)}${data.total>data.items.length?` 当前展示 ${data.items.length} / ${number(data.total)} 位作者，其余内容请在“博主更新”查看。`:''}</p>`;
}
async function renderBoard(version) {
  const c = catalog.categories.find(c=>c.id===route.category);
  if (!c) throw new Error('这个分类不存在');
  const params = new URLSearchParams({category:route.category,date:route.date,subcategory:route.subcategory,q:route.q,updated_only:String(route.updated),page:String(route.page)});
  const [data,picks] = await Promise.all([api('/api/board?'+params),route.view==='picks'?api('/api/board/picks?'+params):Promise.resolve(null)]);
  if (version!==renderVersion) return;
  data.items.forEach(s=>{sourceCache.set(s.source_id,s);cacheArticles(s.articles);});
  document.title = `${c.name} · 见微`;
  $('#main').innerHTML = heading(c.name,c.description,[[data.counts.sources,'位博主'],[data.counts.updated_sources,'位当日有更新'],[data.counts.articles,'篇当日更新']]) + boardControls(c) + `<div class="results-note"><span>${route.subcategory?e(route.subcategory)+' · ':''}${route.q?'搜索“'+e(route.q)+'” · ':''}${route.view==='picks'?'每位作者一条 · 订阅原文节选':'按原表顺序 · 每位博主独立面板'}</span><span class="date-badge">${e(data.date)} · ${e(data.timezone)}</span></div>` + (picks?picksContent(picks):data.items.length?`<div class="blogger-list">${data.items.map(sourcePanel).join('')}</div><div class="pagination"><button class="secondary-button" data-page="${data.page-1}" ${data.page<=1?'disabled':''}>${icon('left')}上一页</button><span>第 ${data.page} / ${data.pages} 页 · ${number(data.total)} 位博主</span><button class="secondary-button" data-page="${data.page+1}" ${data.page>=data.pages?'disabled':''}>下一页${icon('right')}</button></div>`:emptyState('暂时没有匹配的博主更新','试试其他关键词，或关闭“只看有更新”，逐位查看来源状态。'));
}
function evidenceLinks(items) {
  return `<div class="evidence-links">${items.map(a=>{if(!articleCache.has(String(a.id))) articleCache.set(String(a.id),{...a,summary:a.excerpt,content_kind:'excerpt',evidence_only:true});return `<button class="evidence-link" data-read="${e(a.id)}" title="${e(a.title)}">${e(a.source_name)} · ${e(brief(a.title,45))} ${icon('arrow-up-right')}</button>`;}).join('')}</div>`;
}
function insightTitle(index,title,sub) { return `<div class="insight-title"><h2><span class="section-index">${index}</span>${title}</h2><span>${sub}</span></div>`; }
async function renderInsights(version) {
  const p=new URLSearchParams({date:route.date,days:String(route.days)});if(route.scope)p.set('category',route.scope);
  const data=await api('/api/board/insights?'+p);if(version!==renderVersion)return;
  document.title='综合总结 · 见微';
  const words=[...data.words].sort((a,b)=>b.count-a.count), max=Math.max(1,...words.map(w=>w.count));
  $('#main').innerHTML=heading('综合总结','从已收录文章看讨论焦点，沿着证据回到原文。',[[data.stats.articles,'篇窗口内文章'],[data.stats.sources,'个有文章的来源']]) + `<div class="insight-controls"><div>${[1,7,30].map(n=>`<button class="range-button ${route.days===n?'active':''}" data-days="${n}" aria-pressed="${route.days===n}">${n===1?'当日':`近 ${n} 天`}</button>`).join('')}</div><div class="insight-controls-right"><select id="insight-category" aria-label="总结范围"><option value="">全部大类</option>${catalog.categories.map(c=>`<option value="${c.id}" ${route.scope===c.id?'selected':''}>${e(c.name)}</option>`).join('')}</select>${dateControl()}</div></div><p class="insight-method">${icon('info')}截至 ${e(data.date)} 的 ${data.days} 天 · 基于已收录内容的词项统计，不代表全网热度；来源数量不等于独立证据。</p><nav class="insights-jump" aria-label="总结目录"><a href="#hotspots">01 当下热点</a><a href="#frequency">02 词频观察</a><a href="#technologies">03 技术动向</a><a href="#monetization">04 变现线索</a></nav><section id="hotspots" class="insight-section">${insightTitle('01','当下热点','按提及该词的订阅来源数排序')}${data.hotspots.length?data.hotspots.map((h,i)=>`<article class="hotspot-row"><span class="rank">${String(i+1).padStart(2,'0')}</span><div><h3>${e(h.term)}</h3>${evidenceLinks(h.evidence)}</div><div class="hotspot-count"><strong>${number(h.source_count)}</strong><span>个来源提及</span></div><div class="hotspot-count"><strong>${number(h.article_count)}</strong><span>篇相关文章</span></div></article>`).join(''):'<p class="insight-empty">当前范围内尚无词表命中内容。可扩大日期范围查看。</p>'}</section><section id="frequency" class="insight-section">${insightTitle('02','词频观察','标题与摘要中的实际出现次数')}<div class="frequency-layout"><div class="frequency-chart">${words.length?words.map(w=>`<div class="frequency-item" title="${number(w.article_count)} 篇文章 · ${number(w.source_count)} 个来源"><div class="frequency-label"><span>${e(w.term)}</span><span>${number(w.count)}</span></div><div class="frequency-track"><span class="frequency-fill" style="width:${Math.max(1,w.count/max*100).toFixed(1)}%"></span></div></div>`).join(''):'<p class="insight-empty">暂无可统计词项。</p>'}</div><aside class="frequency-definition"><h3>次数，和讨论广度</h3><p>词频是一个词在标题与摘要中出现的总次数。同一篇文章多次提及，也会累计。</p><p>热点侧重有多少订阅来源提及；词频侧重内容里出现多少次，两种排序可能不同。</p><p>目前使用固定中英文词表，摘要最多取 ${STATIC_CONFIG?'600':'4,000'} 字。没有命中词表的表达不会进入统计。</p></aside></div></section><section id="technologies" class="insight-section">${insightTitle('03','技术动向','从关键词找到相关实践与讨论')}${data.technologies.length?`<div class="technology-grid">${data.technologies.map(t=>`<article class="technology-card"><h3>${e(t.name)}</h3><div class="technology-meta">${number(t.article_count)} 篇文章 · ${number(t.source_count)} 个来源</div><p>${e(t.summary)}</p>${evidenceLinks(t.evidence)}</article>`).join('')}</div>`:'<p class="insight-empty">当前范围内暂无技术词项命中。</p>'}</section><section id="monetization" class="insight-section">${insightTitle('04','变现线索','仅展示文章中出现的具体线索')}${data.monetization.length?`<div class="route-grid">${data.monetization.map(m=>`<article class="route-card"><span class="route-tag">${e(m.evidence_level)}</span><h3>${e(m.label || m.route)}</h3><div class="technology-meta">${number(m.article_count)} 篇文章 · ${number(m.source_count)} 个来源</div><p>${e(m.summary)}</p>${evidenceLinks(m.evidence)}<p class="route-limit">${e(Array.isArray(m.limitations)?m.limitations.join('；'):m.limitations)}</p></article>`).join('')}</div>`:'<p class="insight-empty">当前范围内没有足够明确的变现提及。后续文章出现具体产品、付费或服务线索时再列出。</p>'}</section><div class="insight-limitations">${data.limitations.map(t=>`<p>${e(t)}</p>`).join('')}</div>`;
}
async function render() {
  const version=++renderVersion;route=readRoute();renderNav();articleCache.clear();sourceCache.clear();
  $('#main').setAttribute('aria-busy','true');$('#main').innerHTML='<div class="loading-state">正在读取已保存内容…</div>';
  try { if(route.insights)await renderInsights(version);else await renderBoard(version); }
  catch(error){ if(version===renderVersion) $('#main').innerHTML=`<div class="empty-state"><h1>页面暂时未能读取</h1><p>${e(error.message)}</p><button class="primary-button" data-retry>重新读取 ${icon('refresh')}</button></div>`; }
  finally{if(version===renderVersion)$('#main').removeAttribute('aria-busy');}
}
async function readArticle(id) {
  const version=++readerVersion, saved=articleCache.get(String(id));
  $('#reader-content').className='reader-content';$('#reader-content').innerHTML='<p class="loading-state">正在读取…</p>';
  if(!$('#reader-dialog').open)$('#reader-dialog').showModal();
  try {
    const a=saved || await api('/api/articles/'+encodeURIComponent(id));if(version!==readerVersion)return;
    const hasDate=Boolean(a.published_at), notes=[];
    if(a.evidence_only)notes.push('以下为统计命中的原文片段；查看原文可了解上下文。');
    else if (a.public_excerpt) notes.push('以下为已保存的订阅内容节选，最多 600 字；完整内容请查看原文。');
    else notes.push(a.content_kind==='full'?'以下为订阅中保存的正文。':'以下为订阅中保存的内容，可能只有摘要；完整内容请查看原文。');
    if(a.snapshot_note)notes.push(a.snapshot_note);
    if(a.current_revision>a.revision)notes.push(`正在展示所选日期保存的第 ${a.revision} 版；之后另有修订。`);
    if(a.change_kind==='discovered'||!hasDate)notes.push('来源未提供可核验的发布时间；收录日期不等于发布日期。');
    $('#reader-content').innerHTML=`<div class="reader-meta"><span>${e(a.source_name || '订阅来源')}</span><span>${hasDate?'发布 '+e(new Intl.DateTimeFormat('zh-CN',{timeZone:catalog.timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(a.published_at))):'发布时间待核验'}</span>${a.change_kind==='revised'?'<span>所选日有修订</span>':''}</div><h2>${e(a.title)}</h2><p class="reader-note">${e(notes.join(' '))}</p><div class="reader-body">${e(a.summary || a.excerpt || '这个订阅没有提供正文或摘要，请前往原文阅读。')}</div><div class="reader-bottom">${external(a.url,`前往原文 ${icon('arrow-up-right')}`,'primary-button')}<span class="small">内容来自原作者，本站保留订阅记录。</span></div>${a.revision?`<p class="reader-versions">保存版本 ${e(a.revision)}${a.content_observed_at?' · 收录于 '+e(timestamp(a.content_observed_at)):''}</p>`:''}`;
  }catch(error){$('#reader-content').innerHTML=`<p class="empty-state">${e(error.message)}</p>`;}
}
async function loadMoreSource(button) {
  const id=button.dataset.moreSource,s=sourceCache.get(id);if(!s)return;
  const version=renderVersion;button.disabled=true;button.textContent='正在读取…';
  try { const p=new URLSearchParams({date:route.date,q:route.q,page:String(s.article_page+1),page_size:'20'}), data=await api('/api/board/source/'+encodeURIComponent(id)+'?'+p);if(version!==renderVersion)return;
    const seen=new Set(s.articles.map(a=>a.id));s.articles.push(...data.items.filter(a=>!seen.has(a.id)));cacheArticles(data.items);s.article_page=data.page;s.has_more_articles=data.page<data.pages;s.article_count=data.total;button.closest('.blogger-panel').outerHTML=sourcePanel(s);
  }catch(error){toast(error.message);button.disabled=false;button.textContent='重新读取更多文章';}
}
function setFont(delta=0) { let value=18;try{value=Number(localStorage.getItem('jianwei-font-size'))||18;}catch{}value=Math.max(14,Math.min(26,value+delta));document.documentElement.style.setProperty('--reading-size',value+'px');$('#font-value').textContent=value;try{localStorage.setItem('jianwei-font-size',String(value));}catch{} }
async function openSettings() {
  if(STATIC_CONFIG){
    $('#settings-dialog .dialog-top h2').textContent='站点与更新';
    $('#settings-form').innerHTML=`<p class="reader-note">这是你的云端阅读副本。更新完成后，重新读取即可查看新增内容；具体采集时间可在各博主面板查看。</p><p class="settings-note">可查看最近 ${number(catalog.retention_days || 30)} 天。文章展示订阅原文节选，完整内容请访问作者网站。采集时间、保留范围由仓库所有者管理。</p><div class="form-actions"><span class="small">Source Han Serif SC VF · Regular</span>${external((catalog.repo_url || STATIC_CONFIG.repoUrl || '')+'/actions',`管理云端更新 ${icon('arrow-up-right')}`,'primary-button')}</div>`;
    $('#settings-dialog').showModal();return;
  }
  try {const data=await api('/api/settings');const form=$('#settings-form');$('[name="report_hour"]',form).innerHTML=Array.from({length:24},(_,i)=>`<option value="${i}">${String(i).padStart(2,'0')}:00</option>`).join('');
    for(const key of ['report_hour','timezone','core_interval_hours','normal_interval_hours']) {const field=$(`[name="${key}"]`,form);if(![...field.options].some(o=>o.value===String(data[key])))field.add(new Option(String(data[key]),String(data[key])));field.value=String(data[key]);}
    $('#settings-dialog').showModal();
  }catch(error){toast(error.message);}
}
async function openStatus() {
  if(!$('#status-dialog').open)$('#status-dialog').showModal();$('#status-content').innerHTML='<p class="loading-state">正在读取采集记录…</p>';
  if(STATIC_CONFIG){
    $('#status-content').innerHTML=`<div class="status-metrics"><div class="status-metric"><strong>${number(catalog.categories.reduce((n,c)=>n+c.count,0))}</strong><span>个订阅来源</span></div><div class="status-metric"><strong>${number(catalog.retention_days || 30)}</strong><span>天在线内容</span></div></div><p class="reader-note">最近发布：${e(timestamp(catalog.generated_at))}<br>最近来源检查：${e(timestamp(catalog.last_fetch))}<br>可阅读日期：${e(catalog.min_date)} 至 ${e(catalog.date)}</p><p class="settings-note">页面显示已成功发布的数据。“读取更新”重新获取最新版本。云端任务的运行结果与失败原因可在 GitHub 查看，来源检查结果仍显示在各博主面板中。</p><div class="form-actions">${external((catalog.repo_url || STATIC_CONFIG.repoUrl || '')+'/actions',`查看云端任务 ${icon('arrow-up-right')}`,'secondary-button')}<button class="primary-button" data-static-refresh>读取更新 ${icon('refresh')}</button></div>`;return;
  }
  try{const [data,jobs]=await Promise.all([api('/api/dashboard'),api('/api/jobs')]);const stats=data.stats;
    $('#status-content').innerHTML=`<p class="reader-note">这里显示当前累计收录与来源检查状态。具体来源的最近检查结果，可在博主面板查看。</p><div class="status-metrics">${Object.entries(stats).filter(([k,v])=>typeof v==='number').map(([k,v])=>`<div class="status-metric"><strong>${number(v)}</strong><span>${e(({sources:'订阅来源',articles:'累计文章',revisions:'内容修订',valid:'有效来源',healthy:'可读取来源',unvalidated:'待验证',request_failed:'请求失败',parse_failed:'解析失败',checked:'已检查',failed:'检查未成功',total_sources:'订阅来源',total_articles:'累计文章'})[k]||k)}</span></div>`).join('')}</div><h3>最近采集任务</h3>${jobs.items.length?jobs.items.slice(0,8).map(j=>`<div class="job-row"><span>${e(j.kind==='fetch'?'采集更新':j.kind||'采集更新')}</span><span>${e(timestamp(j.created_at))}</span><span>${e(({queued:'等待执行',running:'进行中',completed:'已完成',partial:'部分完成',busy:'已有采集在运行',failed:'未完成',succeeded:'已完成'})[j.status]||j.status)}</span>${j.error?`<p class="job-error">${e(brief(j.error,200))}</p>`:''}</div>`).join(''):'<p class="reader-note">暂无手动采集任务记录。计划任务的检查结果会显示在各来源面板。</p>'}<div class="form-actions"><button class="secondary-button" data-status>刷新状态 ${icon('refresh')}</button></div>`;
  }catch(error){$('#status-content').innerHTML=`<p class="reader-note">${e(error.message)}</p>`;}
}
async function fetchUpdates() {
  const button=$('#fetch-button');button.disabled=true;
  if(STATIC_CONFIG){try{catalog=await window.jianweiStaticAPI.refresh();await render();toast('已读取最新生成的数据');if($('#status-dialog').open)await openStatus();}catch(error){toast(error.message);}finally{button.disabled=false;}return;}
  try{const job=await api('/api/jobs/fetch',{method:'POST',body:JSON.stringify({limit:60})});toast('检查任务已提交，将在后台采集到期来源。');$('#header-status').textContent='后台检查中';
    let attempts=0;clearTimeout(fetchTimer);
    const poll=async()=>{try{const jobs=await api('/api/jobs');const item=jobs.items.find(j=>String(j.id)===String(job.id));if(item&&['completed','partial','busy','failed','succeeded'].includes(item.status)){catalog=await api('/api/board/catalog');$('#header-status').textContent='最近检查 '+timestamp(catalog.last_fetch);button.disabled=false;toast(item.status==='failed'?'这次检查未完成，可查看采集状态。':item.status==='partial'?'部分来源检查未成功，已保存取得的内容。':item.status==='busy'?'已有采集正在运行，可在采集状态中查看。':'检查完成。重新读取页面可查看已保存的新内容。');return;}if(++attempts<120){fetchTimer=setTimeout(poll,5000);return;}}catch{}button.disabled=false;$('#header-status').textContent='可查看采集状态';};fetchTimer=setTimeout(poll,5000);
  }catch(error){toast(error.message);button.disabled=false;}
}
document.addEventListener('click',event=>{
  const a=event.target.closest('a[data-route]');if(a && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.button===0){event.preventDefault();history.pushState({},'',a.getAttribute('href'));render();window.scrollTo(0,0);return;}
  const b=event.target.closest('button');if(!b||b.disabled)return;
  if(b.hasAttribute('data-close')){$('#'+b.dataset.close).close();return;}
  if(b.hasAttribute('data-font')){setFont(Number(b.dataset.font));return;}
  if(b.hasAttribute('data-read')){readArticle(b.dataset.read);return;}
  if(b.hasAttribute('data-more-source')){loadMoreSource(b);return;}
  if(b.hasAttribute('data-status')){openStatus();return;}
  if(b.hasAttribute('data-static-refresh')){fetchUpdates();return;}
  if(b.hasAttribute('data-reconnect')){location.reload();return;}
  if(b.hasAttribute('data-retry')){render();return;}
  if(b.hasAttribute('data-subcategory')){changeRoute({subcategory:b.dataset.subcategory,page:null});return;}
  if(b.hasAttribute('data-view')){changeRoute({view:b.dataset.view==='picks'?'picks':null,page:null,updated_only:null});return;}
  if(b.hasAttribute('data-page')){changeRoute({page:b.dataset.page});window.scrollTo(0,150);return;}
  if(b.hasAttribute('data-reset')){changeRoute({q:null,subcategory:null,updated_only:null,page:null});return;}
  if(b.hasAttribute('data-today')){goToday();return;}
  if(b.hasAttribute('data-days')){changeRoute({days:b.dataset.days});return;}
  if(b.hasAttribute('data-day')){const d=new Date(route.date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+Number(b.dataset.day));changeRoute({date:d.toISOString().slice(0,10),page:null});return;}
  if(b.id==='font-button'){$('#font-popover').hidden=!$('#font-popover').hidden;return;}
  if(b.id==='settings-button'){openSettings();return;}
  if(b.id==='fetch-button'){fetchUpdates();}
});
document.addEventListener('change',event=>{const el=event.target;if(el.id==='board-date'&&el.value&&el.value<=catalog.date)changeRoute({date:el.value,page:null});if(el.id==='updated-only')changeRoute({updated_only:el.checked?'true':'false',page:null});if(el.id==='insight-category')changeRoute({category:el.value});});
document.addEventListener('submit',async event=>{
  if(event.target.id==='board-search'){event.preventDefault();changeRoute({q:new FormData(event.target).get('q').trim(),page:null});}
  if(event.target.id==='settings-form'){event.preventDefault();const form=event.target,button=$('button[type="submit"]',form);button.disabled=true;try{const data=Object.fromEntries(new FormData(form));for(const key of ['report_hour','core_interval_hours','normal_interval_hours'])data[key]=Number(data[key]);await api('/api/settings',{method:'PATCH',body:JSON.stringify(data)});catalog=await api('/api/board/catalog');$('#settings-dialog').close();toast('更新设置已保存');await render();}catch(error){toast(error.message);}finally{button.disabled=false;}}
});
document.addEventListener('click',event=>{if(!event.target.closest('#font-popover, #font-button'))$('#font-popover').hidden=true;});
window.addEventListener('popstate',()=>{if(catalog)render();});
$$('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));setFont();
if (STATIC_CONFIG) { $('#fetch-button').innerHTML=icon('refresh')+'<span>读取更新</span>'; $('#settings-button').setAttribute('aria-label','更新说明'); }
(async()=>{try{catalog=await api('/api/board/catalog');await render();}catch(error){$('#main').innerHTML=`<div class="empty-state"><h1>暂时无法连接信息台</h1><p>${e(error.message)}</p><button class="primary-button" data-reconnect>重新连接</button></div>`;$('#header-status').textContent='连接未完成';}})();
