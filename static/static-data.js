"use strict";
// Static API adapter: all user filters use the same complete published day snapshot.
(() => {
  const config = window.JIANWEI_STATIC;
  if (!config) return;
  const base = new URL(config.basePath || '/jianwei/', location.origin);
  const cache = new Map(), sourceCategories = new Map(), articles = new Map();
  const ids = new Set(['ai','tools','dev','life','business']);
  let currentCatalog;
  function validDate(value,c) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
    const parsed=new Date(value+'T12:00:00Z');
    if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)return false;
    return (!c.min_date||value>=c.min_date)&&value<=c.date&&(!Array.isArray(c.dates)||c.dates.includes(value));
  }
  function bounded(value, fallback, maximum=100) { const n=Number.parseInt(value,10);return Number.isFinite(n)?Math.max(1,Math.min(maximum,n)):fallback; }
  function has(value,q) { return (Array.isArray(value)?value.join(' '):String(value || '')).toLocaleLowerCase().includes(q); }
  async function json(path, fresh=false) {
    if (fresh) cache.delete(path);
    if (!cache.has(path)) cache.set(path, fetch(new URL('data/'+path,base),{cache:fresh?'no-store':'no-cache'}).then(async response=>{
      if(!response.ok)throw new Error(response.status===404?'这个日期的内容尚未发布或已超出在线保留范围。':'已发布数据暂时无法读取，请稍后重试。');
      return response.json();
    }).catch(error=>{cache.delete(path);throw error;}));
    return cache.get(path);
  }
  async function catalog(fresh=false) { if(fresh||!currentCatalog)currentCatalog=await json('catalog.json',fresh);return currentCatalog; }
  async function selected(p, forcedCategory) {
    const c=await catalog(), category=forcedCategory || p.get('category') || 'ai', date=p.get('date') || c.date;
    if(!ids.has(category))throw new Error('这个分类不存在。');
    if(!validDate(date,c))throw new Error(`在线可阅读日期：${c.min_date || c.date} 至 ${c.date}。`);
    const raw=await json(`board/${date}/${category}.json`),q=(p.get('q') || '').trim().toLocaleLowerCase(),sub=p.get('subcategory');
    raw.items.forEach(s=>{sourceCategories.set(s.source_id,category);s.articles.forEach(a=>articles.set(String(a.id),a));});
    const items=raw.items.filter(s=>!sub||s.subcategory===sub).map(s=>{
      const sourceMatch=!q||['name','author','description','original_tags','subcategory','keywords'].some(k=>has(s[k],q));
      const daily=sourceMatch?s.articles:s.articles.filter(a=>has(a.title,q)||has(a.summary,q));
      return {...s,articles:daily,article_count:daily.length,_include:sourceMatch||daily.length>0};
    }).filter(s=>s._include).map(s=>{delete s._include;return s;});
    const daily=items.flatMap(s=>s.articles);
    return {...raw,items,counts:{sources:items.length,updated_sources:items.filter(s=>s.article_count>0).length,articles:daily.length,revisions:daily.filter(a=>a.revised_today).length,discoveries:daily.filter(a=>a.change_kind==='discovered').length}};
  }
  function excerpt(value) { const s=String(value || '').replace(/\s+/g,' ').trim();if(s.length<=140)return s;const first=s.slice(0,140),boundary=Math.max(first.lastIndexOf('。'),first.lastIndexOf('！'),first.lastIndexOf('？'));return boundary>=60?first.slice(0,boundary+1):first.trimEnd()+'…'; }
  async function request(url,options) {
    if(options?.method && options.method!=='GET')throw new Error('公开阅读页不修改服务器设置，请到 GitHub 管理云端更新。');
    const u=new URL(url,location.origin),p=u.searchParams;
    if(u.pathname==='/api/board/catalog')return catalog();
    if(u.pathname==='/api/board'){
      const data=await selected(p),filtered=p.get('updated_only')==='true'?data.items.filter(s=>s.article_count>0):data.items;
      const size=bounded(p.get('page_size'),15),page=bounded(p.get('page'),1,100000),total=filtered.length;
      return {...data,items:filtered.slice((page-1)*size,page*size).map(s=>({...s,articles:s.articles.slice(0,20),article_page:1,article_page_size:20,article_pages:Math.max(1,Math.ceil(s.article_count/20)),has_more_articles:s.article_count>20})),total,page,page_size:size,pages:Math.max(1,Math.ceil(total/size))};
    }
    if(u.pathname==='/api/board/picks'){
      const data=await selected(p),authors=new Set(),chosen=[];
      data.items.forEach(s=>{const author=(s.author||'').trim().toLocaleLowerCase()||s.source_id;if(s.articles.length&&!authors.has(author)){authors.add(author);const a=s.articles[0];chosen.push({...a,subcategory:s.subcategory,keywords:s.keywords,author:s.author,short_summary:excerpt(a.summary),summary_method:'订阅摘要原文节选'});}});
      return {items:chosen.slice(0,12),total:chosen.length,eligible_articles:data.counts.articles,date:data.date,timezone:data.timezone,category:data.category,method:'在所选分区、细分类别、日期和搜索范围内，按原表来源顺序，每位作者取当日最近一条，展示前12条。摘要为订阅原文节选，不是AI评价或热度排名。'};
    }
    if(u.pathname.startsWith('/api/board/source/')){
      const id=decodeURIComponent(u.pathname.split('/').pop()),category=sourceCategories.get(id);
      if(!category)throw new Error('请先打开该博主所在分类。');
      const data=await selected(p,category),source=data.items.find(s=>s.source_id===id);
      if(!source)throw new Error('这个日期没有匹配的来源。');
      const size=bounded(p.get('page_size'),20),page=bounded(p.get('page'),1,100000),total=source.articles.length;
      return {source:{...source,articles:undefined},items:source.articles.slice((page-1)*size,page*size),total,page,page_size:size,pages:Math.max(1,Math.ceil(total/size)),date:data.date,timezone:data.timezone};
    }
    if(u.pathname==='/api/board/insights'){
      const c=await catalog(),date=p.get('date')||c.date,days=Number(p.get('days')||7),scope=p.get('category')||'all';
      if(!validDate(date,c)||![1,7,30].includes(days)||(!ids.has(scope)&&scope!=='all'))throw new Error('请选择在线保留范围内的日期与分类。');
      return json(`insights/${date}/${days}/${scope}.json`);
    }
    if(u.pathname.startsWith('/api/articles/')){const article=articles.get(u.pathname.split('/').pop());if(article)return article;throw new Error('请从博主面板或综合总结打开文章。');}
    throw new Error('此功能请在 GitHub 站点管理中操作。');
  }
  window.jianweiStaticAPI={request,refresh:async()=>{cache.clear();sourceCategories.clear();articles.clear();currentCatalog=undefined;return catalog(true);}};
})();
