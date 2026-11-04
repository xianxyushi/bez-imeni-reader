import {config} from './config.js';
import {FeedbackStore,csvCell} from './feedback-store.js';
const $=id=>document.getElementById(id);
const sessionKey='bez-imeni-session';
function storedSession(){try{return JSON.parse(localStorage.getItem(sessionKey)||sessionStorage.getItem(sessionKey)||'null');}catch{return null;}}
let session=storedSession(),book,episodes=[],current=0,profile,reviewRecord,target,allReviews=[],refreshing;
if(session){localStorage.setItem(sessionKey,JSON.stringify(session));sessionStorage.removeItem(sessionKey);}
function clearSession(){session=null;localStorage.removeItem(sessionKey);sessionStorage.removeItem(sessionKey);}
window.addEventListener('storage',e=>{if(e.key!==sessionKey)return;const next=storedSession();if(next?.user?.id!==session?.user?.id){location.reload();return;}session=next;});
function node(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function appendixLabel(app){return 'Приложение '+(book.appendices.indexOf(app)+1);}
const iconPaths={list:'M4 6h16M4 12h16M4 18h10',type:'M4 5h16M12 5v15M8 20h8',message:'M20 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3z',people:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 4a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',exit:'M9 3H4v18h5M14 8l5 4-5 4M8 12h11',book:'M12 5v16M3 3h5a4 4 0 0 1 4 2 4 4 0 0 1 4-2h5v16h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3z',close:'M6 6l12 12M6 18L18 6'};
function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',iconPaths[name]);svg.append(path);return svg;}
iconPaths.sad='M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M8 9h.01M16 9h.01M8 16q4-5 8 0';
iconPaths.happy='M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M8 9h.01M16 9h.01M8 14q4 5 8 0';
iconPaths.question='M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M9.5 9a2.5 2.5 0 1 1 4 2c-1 .7-1.5 1-1.5 2M12 16h.01';
for(const [reaction,name,label] of [['broken','sad','Не нравится'],['remark','question','Замечание'],['heart','happy','Нравится']]){const b=document.querySelector(`[data-reaction="${reaction}"]`);b.replaceChildren(icon(name));b.setAttribute('aria-label',label);b.title=label;$('reactions').append(b);}
const bookmarkButton=node('button',undefined);bookmarkButton.id='bookmarksButton';bookmarkButton.title='Мои закладки';bookmarkButton.setAttribute('aria-label','Мои закладки');bookmarkButton.dataset.icon='book';$('accountMenu').before(bookmarkButton);
const fragmentBookmark=node('button','В закладки');fragmentBookmark.id='fragmentBookmark';$('quote').after(fragmentBookmark);
document.querySelectorAll('[data-icon]').forEach(b=>b.prepend(icon(b.dataset.icon)));
document.querySelectorAll('dialog .close').forEach(b=>{b.setAttribute('aria-label',b.textContent);b.title=b.textContent;b.replaceChildren(icon('close'));});
$('accountMenu').addEventListener('click',e=>{if(e.target.closest('button'))$('accountMenu').open=false;});
document.addEventListener('click',e=>{if(!$('accountMenu').contains(e.target))$('accountMenu').open=false;});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('accountMenu').open){$('accountMenu').open=false;$('accountMenu').querySelector('summary').focus();}});
async function api(path,{method='GET',body,auth=true,retry=true,headers={}}={}){
 if(!config.url||!config.anonKey)throw Error('Читалка ещё не подключена. Автор готовит доступ.');
 if(auth&&session?.expires_at<Date.now()+30000)await refresh();
 const res=await fetch(config.url+path,{method,headers:{apikey:config.anonKey,'Content-Type':'application/json',...headers,...(auth?{Authorization:'Bearer '+session?.access_token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await res.json().catch(()=>null);
 if(res.status===401&&auth&&retry){await refresh(true);return api(path,{method,body,auth,retry:false,headers});}
 if(!res.ok){const error=Error(data?.message||data?.error_description||'Не удалось связаться с сервером. Черновик сохранён на этом устройстве.');error.code=data?.code;throw error;}
 return data;
}
async function refresh(force=false){
 const refreshOnce=async()=>{const latest=storedSession();if(latest?.user?.id!==session?.user?.id||!latest?.refresh_token)throw Error('Войди снова, чтобы продолжить.');session=latest;if(!force&&session.expires_at>Date.now()+30000)return;const token=session.refresh_token;const data=await api('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:token},auth:false});if(storedSession()?.refresh_token!==token)throw Error('Сеанс изменился. Обнови страницу.');setSession(data);};
 if(!refreshing)refreshing=(navigator.locks?navigator.locks.request('bez-imeni-refresh',refreshOnce):refreshOnce()).finally(()=>refreshing=null);
 return refreshing;
}
function setSession(data){session={...data,expires_at:Date.now()+data.expires_in*1000};localStorage.setItem(sessionKey,JSON.stringify(session));sessionStorage.removeItem(sessionKey);}
function rpc(name,body={}){return api('/rest/v1/rpc/'+name,{method:'POST',body});}
function positionKey(){return 'bez-imeni-position:'+session.user.id+':'+book.edition;}
let positionQueue=Promise.resolve();
function rememberPosition(episode,block=''){
 const userId=session.user.id,edition=book.edition;
 const position={episode,block,updated_at:new Date().toISOString()};
 localStorage.setItem(positionKey(),JSON.stringify(position));
 positionQueue=positionQueue.catch(()=>{}).then(async()=>{
  if(session?.user?.id!==userId)return;
  await api('/rest/v1/reader_positions?on_conflict=user_id,edition',{method:'POST',body:{user_id:userId,edition,...position},headers:{Prefer:'resolution=merge-duplicates'}});
 }).catch(()=>{}); // Место остаётся на устройстве и будет отправлено при следующем движении.
}
function draftsKey(){return 'bez-imeni-draft:'+session.user.id+':'+book.edition+':'+target.episode+':'+target.block;}
function showStatus(id,text){$(id).textContent=text;}
document.addEventListener('pointerdown',()=>document.documentElement.dataset.input='pointer',true);
document.addEventListener('keydown',e=>{if(['Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))document.documentElement.dataset.input='keyboard';},true);
function dismissDialog(d){if(!d.open||d.dataset.closing)return;const mobile=matchMedia('(max-width:600px)').matches,reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;if(!mobile||reduced){d.close();return;}d.dataset.closing='true';d.style.transition='transform 200ms cubic-bezier(.4,0,1,1), opacity 200ms ease';requestAnimationFrame(()=>{d.style.transform=`translate3d(0,${d.offsetHeight+32}px,0)`;d.style.opacity='0';});setTimeout(()=>{if(d.open)d.close();},210);}
document.querySelectorAll('dialog .close').forEach(b=>b.onclick=()=>dismissDialog(b.closest('dialog')));
document.querySelectorAll('dialog').forEach(d=>{const heading=d.querySelector('h2');if(!heading.id)heading.id=d.id+'Heading';d.setAttribute('aria-labelledby',heading.id);const head=node('div',undefined,'dialogHead');head.append(heading,d.querySelector('.close'));d.prepend(head);});
document.querySelectorAll('dialog').forEach(d=>{
 let outside=false,startPoint;
 const isOutside=e=>{const r=d.getBoundingClientRect();return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;};
 d.addEventListener('pointerdown',e=>{outside=isOutside(e);});
 d.addEventListener('pointerup',e=>{if(outside&&isOutside(e))dismissDialog(d);outside=false;});
 d.addEventListener('click',e=>{if(e.detail>0&&isOutside(e))dismissDialog(d);});
 d.addEventListener('close',()=>{delete d.dataset.closing;d.style.transition='';d.style.transform='';d.style.opacity='';startPoint=null;if(document.documentElement.dataset.input==='pointer'&&document.activeElement?.matches('#prose p'))document.activeElement.blur();});
 const head=d.querySelector('.dialogHead');head.addEventListener('pointerdown',e=>{if(!matchMedia('(max-width:600px)').matches||e.target.closest('button'))return;startPoint={x:e.clientX,y:e.clientY,id:e.pointerId};head.setPointerCapture(e.pointerId);});
 const resetDrag=()=>{d.style.transition=matchMedia('(prefers-reduced-motion:reduce)').matches?'none':'transform 180ms ease-out';d.style.transform='translate3d(0,0,0)';startPoint=null;};
 head.addEventListener('pointermove',e=>{if(startPoint?.id!==e.pointerId||d.dataset.closing)return;const y=e.clientY-startPoint.y,x=e.clientX-startPoint.x;if(Math.abs(x)>Math.max(30,Math.abs(y))){resetDrag();return;}d.style.transition='none';d.style.transform=`translate3d(0,${Math.max(0,y)}px,0)`;});
 head.addEventListener('pointerup',e=>{if(startPoint?.id===e.pointerId&&e.clientY-startPoint.y>70&&Math.abs(e.clientX-startPoint.x)<60){startPoint=null;dismissDialog(d);}else resetDrag();});head.addEventListener('pointercancel',resetDrag);
});
const authorFilters=node('div',undefined,'authorFilters'),filterPanel=node('details',undefined,'filterPanel'),filterSummary=node('summary','Фильтры'),filterFields=node('div',undefined,'filterFields');filterSummary.id='filterSummary';filterFields.append($('readerFilter').closest('label'));for(const [id,title] of [['actFilter','Акт'],['chapterFilter','Глава'],['episodeFilter','Эпизод']]){const label=node('label',title),select=node('select');select.id=id;select.append(new Option('Все',''));label.append(select);filterFields.append(label);}const resetFilters=node('button','Сбросить');resetFilters.id='resetFilters';filterFields.append(resetFilters);filterPanel.append(filterSummary,filterFields);authorFilters.append(filterPanel,$('export'));$('author').querySelector('.dialogHead').after(authorFilters);
$('logout').onclick=async()=>{await api('/auth/v1/logout',{method:'POST'}).catch(()=>{});clearSession();location.reload();};
async function start(){
 profile=(await rpc('reader_profile'))[0];if(!profile)throw Error('Доступ закрыт. Обратись к автору книги.');
 const editions=await api('/rest/v1/reader_editions?select=contents&order=created_at.desc&limit=1');if(!editions.length)throw Error('Автор ещё готовит текст книги.');book=editions[0].contents;
 episodes=book.acts.flatMap(a=>a.chapters.flatMap(c=>c.episodes.map(e=>({...e,act:a.number,actTitle:a.title,chapter:c.number}))));
 $('login').hidden=true;$('reader').hidden=false;$('tools').hidden=false;$('authorButton').hidden=!profile.author;$('invitesButton').hidden=!profile.author;
 buildToc();let saved=JSON.parse(localStorage.getItem(positionKey())||'null');
 try{const rows=await api('/rest/v1/reader_positions?select=episode,block,updated_at&edition=eq.'+encodeURIComponent(book.edition));const remote=rows[0];if(remote&&(!saved||remote.updated_at>saved.updated_at))saved=remote;}catch{}
 current=Math.max(0,episodes.findIndex(e=>e.id===saved?.episode));render(saved?.block);
}
function rich(block){
 const p=node('p');p.id=block.id;p.tabIndex=0;p.setAttribute('aria-label','Оставить отзыв: '+block.text.slice(0,70));
 const songLines=[51,52,53,54,59,60,61,62,65,66,68,69];if(songLines.some(n=>block.id==='4-10-5-p'+n)){p.classList.add('songLine');if([54,62,66,69].some(n=>block.id==='4-10-5-p'+n))p.classList.add('songEnd');}
 const cuts=[...new Set([0,block.text.length,...block.spans.flatMap(s=>[s.start,s.end])])].sort((a,b)=>a-b);
 for(let i=0;i<cuts.length-1;i++){const a=cuts[i],z=cuts[i+1],styles=[...new Set(block.spans.filter(s=>s.start<=a&&s.end>=z).map(s=>s.style))],span=node('span',undefined,styles.join(' '));appendAccented(span,block.text.slice(a,z));p.append(span);}
 p.onclick=()=>{if(!getSelection()?.toString())openReview(block);};p.onkeydown=e=>{if(e.key==='Enter')openReview(block);};return p;
}
function render(blockId){
 const ep=episodes[current];$('location').textContent=`Акт ${ep.act} · ${ep.actTitle} · Глава ${ep.chapter}`;$('title').textContent='Эп. '+ep.number;$('prose').replaceChildren(...ep.blocks.map(rich));
 const linked=book.appendices.filter(a=>a.links.includes(ep.id));$('appendixWidgets').replaceChildren();$('appendixWidgets').hidden=!linked.length;document.body.classList.toggle('hasAppendix',!!linked.length);
 for(const app of linked){const button=node('button',undefined,'appendixWidget');button.title=appendixLabel(app);button.setAttribute('aria-label',appendixLabel(app));button.append(icon('book'),node('span',String(book.appendices.indexOf(app)+1),'widgetNumber'));button.onclick=()=>openAppendix(app);$('appendixWidgets').append(button);}
 $('previous').disabled=current===0;$('next').disabled=current===episodes.length-1;rememberPosition(ep.id,blockId||'');
 document.querySelectorAll('#tocContent button[data-episode]').forEach(b=>{if(b.dataset.episode===ep.id)b.setAttribute('aria-current','location');else b.removeAttribute('aria-current');});
 window.scrollTo(0,0);if(blockId)$(blockId)?.scrollIntoView({block:'center'});
}
$('previous').onclick=()=>{if(current>0){current--;render();}};$('next').onclick=()=>{if(current<episodes.length-1){current++;render();}};
$('home').onclick=e=>{e.preventDefault();if(book)$('toc').showModal();};
function buildToc(){
 $('tocContent').replaceChildren();for(const act of book.acts){const d=node('details');d.append(node('summary',act.title));for(const chapter of act.chapters){const section=node('details',undefined,'chapter');section.append(node('summary','Глава '+chapter.number));const grid=node('div',undefined,'episodeGrid');for(const ep of chapter.episodes){const btn=node('button','Эп. '+ep.number);btn.dataset.episode=ep.id;btn.onclick=()=>{current=episodes.findIndex(e=>e.id===ep.id);$('toc').close();render();};grid.append(btn);}section.append(grid);d.append(section);}$('tocContent').append(d);}
 for(const app of book.appendices){const b=node('button',appendixLabel(app));b.onclick=()=>{$('toc').close();openAppendix(app);};$('tocContent').append(b);}
}
function appendAccented(p,text){for(const word of text.split(/(\s+)/)){if(!word.includes('\u0301')){p.append(document.createTextNode(word));continue;}const w=node('span',undefined,'stressedWord');const chars=Array.from(word);for(let i=0;i<chars.length;i++){if(chars[i+1]==='\u0301'){const letter=node('span',chars[i],'stressedLetter');letter.append(node('span',chars[++i],'sourceAccent'));w.append(letter);}else w.append(document.createTextNode(chars[i]));}p.append(w);}}
function stanza(lines){const p=node('p',undefined,'stanza');appendAccented(p,lines.join('\n'));return p;}
function openAppendix(app){$('appendixTitle').textContent=appendixLabel(app);$('appendixText').replaceChildren(...app.stanzas.map(stanza));$('appendix').showModal();}
function showToc(){const active=$('tocContent').querySelector('[aria-current]');for(let parent=active?.parentElement;parent&&parent!==$('tocContent');parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;$('toc').showModal();active?.scrollIntoView({block:'center'});active?.focus({preventScroll:true});}
$('tocButton').onclick=showToc;$('home').onclick=e=>{e.preventDefault();if(book)showToc();};$('settingsButton').onclick=()=>$('settings').showModal();
const prefs=JSON.parse(localStorage.getItem('bez-imeni-settings')||'{}');$('fontSize').value=prefs.size||21;$('theme').value=prefs.theme||'light';
const sizeValue=node('output',undefined,'sizeValue');sizeValue.htmlFor='fontSize';$('fontSize').before(sizeValue);const themeChoices=node('div',undefined,'themeChoices');themeChoices.setAttribute('role','group');themeChoices.setAttribute('aria-label','Тема чтения');for(const [value,label] of [['light','Светлая'],['dark','Тёмная']]){const b=node('button',label);b.dataset.themeChoice=value;b.onclick=()=>{$('theme').value=value;settings();};themeChoices.append(b);}$('theme').hidden=true;$('theme').after(themeChoices);
function settings(){document.documentElement.style.setProperty('--size',$('fontSize').value+'px');document.body.dataset.theme=$('theme').value;sizeValue.textContent=$('fontSize').value;themeChoices.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.themeChoice===$('theme').value));localStorage.setItem('bez-imeni-settings',JSON.stringify({size:$('fontSize').value,theme:$('theme').value}));}
$('fontSize').oninput=settings;$('theme').onchange=settings;settings();
let reaction=null,loadingReview=0,reviewLoaded=false;
const feedbackStore=new FeedbackStore({send:payload=>rpc('reader_save_feedback',payload),storage:localStorage});
function renderReaction(){document.querySelectorAll('[data-reaction]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.reaction===reaction));}
function keepDraft(){if(!target)return;localStorage.setItem(draftsKey(),JSON.stringify({comment:$('comment').value,reaction}));}
document.querySelectorAll('[data-reaction]').forEach(b=>b.onclick=()=>{if(!reviewLoaded)return;reaction=reaction===b.dataset.reaction?null:b.dataset.reaction;renderReaction();keepDraft();});$('comment').oninput=keepDraft;
$('episodeReview').onclick=()=>openReview();
async function openReview(block){
 const generation=++loadingReview;reviewLoaded=false;target={episode:episodes[current].id,block:block?.id||'',quote:block?.text||''};reviewRecord=null;reaction=null;$('comment').value='';$('quote').textContent=target.quote;$('saveReview').disabled=true;$('comment').disabled=true;showStatus('saveStatus','Загружаем отзыв…');renderReaction();$('review').showModal();
 try{const pending=feedbackStore.running.get(draftsKey());if(pending)await pending.catch(()=>{});if(generation!==loadingReview)return;const query=new URLSearchParams({select:'*',user_id:'eq.'+session.user.id,edition:'eq.'+book.edition,episode:'eq.'+target.episode,block:'eq.'+target.block});const rows=await api('/rest/v1/reader_feedback?'+query);if(generation!==loadingReview)return;reviewRecord=rows[0]||null;const draft=JSON.parse(localStorage.getItem(draftsKey())||'null');$('comment').value=draft?.comment??reviewRecord?.comment??'';reaction=draft?draft.reaction:reviewRecord?.reaction||null;renderReaction();reviewLoaded=true;$('comment').disabled=false;$('saveReview').disabled=feedbackStore.running.has(draftsKey());showStatus('saveStatus',draft?'Есть несохранённый черновик.':'');}catch(e){if(generation===loadingReview)showStatus('saveStatus',e.message);}
}
$('saveReview').onclick=async()=>{
 if(!reviewLoaded||feedbackStore.running.has(draftsKey()))return;
 $('saveReview').disabled=true;keepDraft();showStatus('saveStatus','Сохраняем…');
 const key=draftsKey(),generation=loadingReview,payload={p_edition:book.edition,p_episode:target.episode,p_block:target.block,p_quote:target.quote,p_reaction:reaction,p_comment:$('comment').value};
 try{const result=await feedbackStore.save(key,payload,reviewRecord?.revision||0);const latest=JSON.parse(localStorage.getItem(key)||'null');const unchanged=latest?.comment===payload.p_comment&&latest?.reaction===payload.p_reaction;if(unchanged)localStorage.removeItem(key);if(generation===loadingReview){reviewRecord=result;showStatus('saveStatus',unchanged?'Сохранено':'Предыдущая версия сохранена. Новые изменения пока в черновике.');}}
 catch(e){if(generation===loadingReview)showStatus('saveStatus',e.message);}
 finally{if(key===draftsKey())$('saveReview').disabled=!reviewLoaded;}
};
$('authorButton').onclick=async()=>{if(!profile.author)return;$('author').showModal();$('allReviews').textContent='Загружаем…';try{allReviews=await rpc('reader_all_feedback');const users=new Map(allReviews.map(r=>[r.user_id,r.name]));$('readerFilter').replaceChildren(new Option('Все',''),...[...users].map(([id,name])=>new Option(name,id)));initReviewFilters();renderAll();}catch(e){$('allReviews').textContent=e.message;}};
function renderAll(){const rows=filteredReviews();$('filterSummary').textContent='Фильтры · '+rows.length+' из '+allReviews.length;$('allReviews').replaceChildren(...rows.map(r=>{const box=node('section',undefined,'reviewCard'),label=node('div',undefined,'identity'),dot=node('i');if(/^#[0-9a-f]{6}$/i.test(r.color))dot.style.background=r.color;label.append(dot,node('strong',r.name));const ep=episodes.find(e=>e.id===r.episode);box.append(label,node('p',(ep?`Акт ${ep.act} · Глава ${ep.chapter} · Эп. ${ep.number}`:r.episode)+' · '+({heart:'Нравится',broken:'Не нравится',remark:'Замечание'}[r.reaction]||'Комментарий'),'reviewAddress'));if(r.quote){const q=node('details',undefined,'reviewQuote');q.append(node('summary','Показать фрагмент'),node('blockquote',r.quote));box.append(q);}if(r.comment)box.append(node('p',r.comment));if(ep){const jump=node('button','К фрагменту');jump.onclick=()=>{$('author').close();current=episodes.indexOf(ep);render(r.block);};box.append(jump);}return box;}));if(!rows.length)$('allReviews').textContent=allReviews.length?'По этим фильтрам отзывов нет.':'Отзывов пока нет.';}
$('readerFilter').onchange=renderAll;
function initReviewFilters(){const chosen=$('actFilter').value;$('actFilter').replaceChildren(new Option('Все',''),...book.acts.map(a=>new Option(a.number+' · '+a.title,String(a.number))));$('actFilter').value=chosen;updateChapterFilters();}
function updateChapterFilters(){const a=book.acts.find(a=>String(a.number)===$('actFilter').value);$('chapterFilter').replaceChildren(new Option('Все',''),...(a?.chapters||[]).map(c=>new Option('Глава '+c.number,String(c.number))));$('chapterFilter').disabled=!a;updateEpisodeFilters();}
function updateEpisodeFilters(){const a=book.acts.find(a=>String(a.number)===$('actFilter').value),c=a?.chapters.find(c=>String(c.number)===$('chapterFilter').value);$('episodeFilter').replaceChildren(new Option('Все',''),...(c?.episodes||[]).map(e=>new Option('Эп. '+e.number,e.id)));$('episodeFilter').disabled=!c;}
function filteredReviews(){return allReviews.filter(r=>{const ep=episodes.find(e=>e.id===r.episode);return (!$('readerFilter').value||r.user_id===$('readerFilter').value)&&(!$('actFilter').value||String(ep?.act)===$('actFilter').value)&&(!$('chapterFilter').value||String(ep?.chapter)===$('chapterFilter').value)&&(!$('episodeFilter').value||r.episode===$('episodeFilter').value);});}
$('actFilter').onchange=()=>{updateChapterFilters();renderAll();};$('chapterFilter').onchange=()=>{updateEpisodeFilters();renderAll();};$('episodeFilter').onchange=renderAll;$('resetFilters').onclick=()=>{$('readerFilter').value='';$('actFilter').value='';updateChapterFilters();renderAll();};
$('export').onclick=()=>{if(!profile.author)return;const rows=[['Читатель','Эпизод','Фрагмент','Цитата','Реакция','Комментарий','Дата'],...filteredReviews().map(r=>[r.name,r.episode,r.block,r.quote,r.reaction,r.comment,r.updated_at])];const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=node('a');a.href=url;a.download='Отзывы — Без имени.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
function visiblePosition(){if(!book)return null;const ep=episodes[current],block=[...$('prose').querySelectorAll('p[id]')].find(p=>p.getBoundingClientRect().bottom>100);return {episode:ep.id,block:block?.id||'',quote:ep.blocks.find(b=>b.id===block?.id)?.text.slice(0,300)||''};}
function saveVisiblePosition(){if(document.querySelector('dialog[open]'))return;const pos=visiblePosition();if(pos)rememberPosition(pos.episode,pos.block);}
let scrollTimer;window.addEventListener('scroll',()=>{clearTimeout(scrollTimer);scrollTimer=setTimeout(saveVisiblePosition,500);},{passive:true});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')saveVisiblePosition();});window.addEventListener('pagehide',saveVisiblePosition);
let bookmarkPosition;
function bookmarkQuery(pos){return new URLSearchParams({user_id:'eq.'+session.user.id,edition:'eq.'+book.edition,episode:'eq.'+pos.episode,block:'eq.'+pos.block});}
async function saveBookmark(pos){await api('/rest/v1/reader_bookmarks?on_conflict=user_id,edition,episode,block',{method:'POST',body:{user_id:session.user.id,edition:book.edition,...pos,quote:(pos.quote||'').slice(0,300)},headers:{Prefer:'resolution=ignore-duplicates'}});}
async function loadBookmarks(){const rows=await api('/rest/v1/reader_bookmarks?select=episode,block,quote,created_at&edition=eq.'+encodeURIComponent(book.edition)+'&order=created_at.desc');$('bookmarkList').replaceChildren(...rows.map(row=>{const box=node('section',undefined,'reviewCard'),ep=episodes.find(e=>e.id===row.episode),open=node('button','Открыть'),remove=node('button','Удалить закладку');box.append(node('p',ep?`Акт ${ep.act} · Глава ${ep.chapter} · Эп. ${ep.number}`:row.episode,'reviewAddress'),node('p',row.quote));open.disabled=!ep;open.onclick=()=>{$('bookmarks').close();current=episodes.indexOf(ep);render(row.block);};remove.onclick=async()=>{remove.disabled=true;try{await api('/rest/v1/reader_bookmarks?'+bookmarkQuery(row),{method:'DELETE'});await loadBookmarks();showStatus('bookmarkStatus','Закладка удалена.');}catch(e){remove.disabled=false;showStatus('bookmarkStatus','Не удалось удалить закладку. Попробуй ещё раз.');}};box.append(open,remove);return box;}));if(!rows.length)$('bookmarkList').textContent='Сохранённых закладок пока нет.';}
$('bookmarksButton').onclick=async()=>{bookmarkPosition=visiblePosition();$('bookmarks').showModal();showStatus('bookmarkStatus','Загружаем…');try{await loadBookmarks();showStatus('bookmarkStatus','');}catch{showStatus('bookmarkStatus','Не удалось загрузить закладки. Проверь соединение.');}};
$('addBookmark').onclick=async()=>{$('addBookmark').disabled=true;try{await saveBookmark(bookmarkPosition);await loadBookmarks();showStatus('bookmarkStatus','Закладка сохранена.');}catch{showStatus('bookmarkStatus','Закладка не сохранена. Проверь соединение и повтори.');}finally{$('addBookmark').disabled=false;}};
$('fragmentBookmark').onclick=async()=>{if(!target)return;$('fragmentBookmark').disabled=true;try{await saveBookmark({episode:target.episode,block:target.block,quote:target.quote});showStatus('saveStatus','Закладка сохранена.');}catch{showStatus('saveStatus','Закладка не сохранена. Попробуй ещё раз.');}finally{$('fragmentBookmark').disabled=false;}};
$('resumeReading').onclick=()=>{const saved=JSON.parse(localStorage.getItem(positionKey())||'null');$('bookmarks').close();if(saved){const index=episodes.findIndex(e=>e.id===saved.episode);if(index>=0){current=index;render(saved.block);}}};
// Ключ убирается из адреса до запроса и не сохраняется в хранилище браузера.
async function acceptInvitation(){
 const hash=new URLSearchParams(location.hash.slice(1));if(!hash.has('key'))return false;
 const key=hash.get('key');history.replaceState(null,'',location.pathname+location.search);
 document.querySelectorAll('dialog[open]').forEach(d=>d.close());
 $('reader').hidden=true;$('tools').hidden=true;$('login').hidden=false;book=null;
 clearSession();showStatus('loginStatus','Открываем книгу…');
 setSession(await api('/functions/v1/reader-access',{method:'POST',auth:false,body:{action:'enter',key}}));
 await start();return true;
}
function clearInvite(){ $('inviteLink').value='';$('inviteResult').hidden=true; }
function showInvite(result){$('inviteLink').value=result.link;$('inviteResult').hidden=false;showStatus('inviteStatus',result.message);}
$('invites').addEventListener('close',clearInvite);
$('copyInvite').onclick=async()=>{try{await navigator.clipboard.writeText($('inviteLink').value);showStatus('inviteStatus','Ссылка скопирована.');}catch{$('inviteLink').select();showStatus('inviteStatus','Скопируй выделенную ссылку.');}};
async function accessAction(body){return api('/functions/v1/reader-access',{method:'POST',body});}
$('inspectForm').onsubmit=async event=>{
 event.preventDefault();if(!profile.author)return;const button=event.submitter;button.disabled=true;$('inspectResult').textContent='Проверяем…';
 try{const result=await accessAction({action:'inspect',query:$('inspectQuery').value});$('inspectResult').replaceChildren(node('p',result.message),...result.people.map(p=>node('p',p.name+' · '+(p.active?'Доступ открыт':'Доступ закрыт')+(p.author?' · Автор':''))));}
 catch(e){$('inspectResult').textContent=e.message;}finally{button.disabled=false;}
};
$('invites').addEventListener('close',()=>{$('inspectForm').reset();$('inspectResult').replaceChildren();});
async function loadInvites(){
 const rows=await api('/rest/v1/reader_people?select=user_id,name,active,author&order=created_at.desc');
 const testAccounts=new Set(['97975075-dc4a-4042-915a-eb289657a713','14fbfca1-b113-462e-8332-d1841ddd8a95']);
 $('inviteList').replaceChildren(...rows.filter(r=>!r.author&&!testAccounts.has(r.user_id)).map(r=>{
  const card=node('section',undefined,'reviewCard'),button=node('button',r.active?'Закрыть доступ':'Вернуть доступ'),rotate=node('button','Новая личная ссылка');
  card.append(node('strong',r.name),node('p',r.active?'Доступ открыт':'Доступ закрыт'),button,rotate,node('p','Новая ссылка заменит старую. Чтобы закрыть уже открытые сеансы, отключи доступ.','muted'));
  button.onclick=async()=>{button.disabled=true;clearInvite();try{const result=await accessAction({action:'active',userId:r.user_id,active:!r.active});await loadInvites();showStatus('inviteStatus',result.message);}catch(e){showStatus('inviteStatus',e.message);button.disabled=false;}};
  rotate.onclick=async()=>{rotate.disabled=true;clearInvite();try{showInvite(await accessAction({action:'rotate',userId:r.user_id}));}catch(e){showStatus('inviteStatus',e.message);}finally{rotate.disabled=false;}};
  return card;
 }));
}
$('invitesButton').onclick=async()=>{if(!profile.author)return;clearInvite();$('invites').showModal();try{await loadInvites();}catch(e){showStatus('inviteStatus',e.message);}};
$('inviteForm').onsubmit=async event=>{
 event.preventDefault();if(!profile.author)return;const button=event.submitter;button.disabled=true;clearInvite();showStatus('inviteStatus','Создаём личную ссылку…');
 try{showInvite(await accessAction({action:'create',name:$('inviteName').value}));$('inviteForm').reset();}
 catch(e){showStatus('inviteStatus',e.message);}finally{button.disabled=false;await loadInvites().catch(()=>{});}
};
acceptInvitation().then(handled=>{if(!handled&&session)return start();}).catch(e=>showStatus('loginStatus',e.message));
// Новый ключ открывает чистый контекст: ответы прежнего аккаунта не меняют новый интерфейс.
window.addEventListener('hashchange',()=>{if(new URLSearchParams(location.hash.slice(1)).has('key'))location.reload();});

