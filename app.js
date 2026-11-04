import {config} from './config.js';
import {FeedbackStore,csvCell} from './feedback-store.js';
const $=id=>document.getElementById(id);
const sessionKey='bez-imeni-session';
let session=JSON.parse(sessionStorage.getItem(sessionKey)||'null'),book,episodes=[],current=0,profile,reviewRecord,target,allReviews=[],refreshing;
function node(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function appendixLabel(app){return 'Приложение '+(book.appendices.indexOf(app)+1);}
async function api(path,{method='GET',body,auth=true,retry=true,headers={}}={}){
 if(!config.url||!config.anonKey)throw Error('Читалка ещё не подключена. Автор готовит доступ.');
 if(auth&&session?.expires_at<Date.now()+30000)await refresh();
 const res=await fetch(config.url+path,{method,headers:{apikey:config.anonKey,'Content-Type':'application/json',...headers,...(auth?{Authorization:'Bearer '+session?.access_token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await res.json().catch(()=>null);
 if(res.status===401&&auth&&retry){await refresh();return api(path,{method,body,auth,retry:false,headers});}
 if(!res.ok){const error=Error(data?.message||data?.error_description||'Не удалось связаться с сервером. Черновик сохранён на этом устройстве.');error.code=data?.code;throw error;}
 return data;
}
async function refresh(){
 if(!refreshing)refreshing=(async()=>{if(!session?.refresh_token)throw Error('Войди снова, чтобы продолжить.');const data=await api('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token},auth:false});setSession(data);})().finally(()=>refreshing=null);
 return refreshing;
}
function setSession(data){session={...data,expires_at:Date.now()+data.expires_in*1000};sessionStorage.setItem(sessionKey,JSON.stringify(session));}
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
document.querySelectorAll('dialog .close').forEach(b=>b.onclick=()=>b.closest('dialog').close());
document.querySelectorAll('dialog').forEach(d=>{const heading=d.querySelector('h2');if(!heading.id)heading.id=d.id+'Heading';d.setAttribute('aria-labelledby',heading.id);});
$('logout').onclick=async()=>{await api('/auth/v1/logout',{method:'POST'}).catch(()=>{});sessionStorage.removeItem(sessionKey);location.reload();};
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
 const cuts=[...new Set([0,block.text.length,...block.spans.flatMap(s=>[s.start,s.end])])].sort((a,b)=>a-b);
 for(let i=0;i<cuts.length-1;i++){const a=cuts[i],z=cuts[i+1],styles=[...new Set(block.spans.filter(s=>s.start<=a&&s.end>=z).map(s=>s.style))];p.append(node('span',block.text.slice(a,z),styles.join(' ')));}
 p.onclick=()=>{if(!getSelection()?.toString())openReview(block);};p.onkeydown=e=>{if(e.key==='Enter')openReview(block);};return p;
}
function render(blockId){
 const ep=episodes[current];$('location').textContent=`Акт ${ep.act} · ${ep.actTitle} · Глава ${ep.chapter}`;$('title').textContent='Эп. '+ep.number;$('prose').replaceChildren(...ep.blocks.map(rich));
 for(const app of book.appendices.filter(a=>a.links.includes(ep.id))){const button=node('button',appendixLabel(app),'appendixLink');button.onclick=()=>openAppendix(app);$('prose').append(button);}
 $('previous').disabled=current===0;$('next').disabled=current===episodes.length-1;rememberPosition(ep.id,blockId||'');
 document.querySelectorAll('#tocContent button[data-episode]').forEach(b=>{if(b.dataset.episode===ep.id)b.setAttribute('aria-current','location');else b.removeAttribute('aria-current');});
 window.scrollTo(0,0);if(blockId)$(blockId)?.scrollIntoView({block:'center'});
}
$('previous').onclick=()=>{if(current>0){current--;render();}};$('next').onclick=()=>{if(current<episodes.length-1){current++;render();}};
$('home').onclick=e=>{e.preventDefault();if(book)$('toc').showModal();};
function buildToc(){
 $('tocContent').replaceChildren();for(const act of book.acts){const d=node('details');d.append(node('summary',act.title));for(const chapter of act.chapters){d.append(node('h3','Глава '+chapter.number));for(const ep of chapter.episodes){const btn=node('button','Эп. '+ep.number);btn.dataset.episode=ep.id;btn.onclick=()=>{current=episodes.findIndex(e=>e.id===ep.id);$('toc').close();render();};d.append(btn);}}$('tocContent').append(d);}
 for(const app of book.appendices){const b=node('button',appendixLabel(app));b.onclick=()=>{$('toc').close();openAppendix(app);};$('tocContent').append(b);}
}
function openAppendix(app){$('appendixTitle').textContent=appendixLabel(app);$('appendixText').replaceChildren(...app.stanzas.map(s=>node('p',s.join('\n'),'stanza')));$('appendix').showModal();}
function showToc(){const active=$('tocContent').querySelector('[aria-current]');if(active)active.closest('details').open=true;$('toc').showModal();active?.scrollIntoView({block:'center'});active?.focus({preventScroll:true});}
$('tocButton').onclick=showToc;$('home').onclick=e=>{e.preventDefault();if(book)showToc();};$('settingsButton').onclick=()=>$('settings').showModal();
const prefs=JSON.parse(localStorage.getItem('bez-imeni-settings')||'{}');$('fontSize').value=prefs.size||21;$('theme').value=prefs.theme||'light';
function settings(){document.documentElement.style.setProperty('--size',$('fontSize').value+'px');document.body.dataset.theme=$('theme').value;localStorage.setItem('bez-imeni-settings',JSON.stringify({size:$('fontSize').value,theme:$('theme').value}));}
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
$('authorButton').onclick=async()=>{if(!profile.author)return;$('author').showModal();$('allReviews').textContent='Загружаем…';try{allReviews=await rpc('reader_all_feedback');const users=new Map(allReviews.map(r=>[r.user_id,r.name]));$('readerFilter').replaceChildren(new Option('Все',''),...[...users].map(([id,name])=>new Option(name,id)));renderAll();}catch(e){$('allReviews').textContent=e.message;}};
function renderAll(){const selected=$('readerFilter').value;const rows=allReviews.filter(r=>!selected||r.user_id===selected);$('allReviews').replaceChildren(...rows.map(r=>{const box=node('section',undefined,'reviewCard'),label=node('div',undefined,'identity'),dot=node('i');if(/^#[0-9a-f]{6}$/i.test(r.color))dot.style.background=r.color;label.append(dot,node('strong',r.name));box.append(label,node('p','Эп. '+r.episode+' · '+({heart:'♡',broken:'💔',remark:'Замечание'}[r.reaction]||'')),node('blockquote',r.quote),node('p',r.comment));return box;}));if(!rows.length)$('allReviews').textContent='Отзывов пока нет.';}
$('readerFilter').onchange=renderAll;
$('export').onclick=()=>{if(!profile.author)return;const rows=[['Читатель','Эпизод','Фрагмент','Цитата','Реакция','Комментарий','Дата'],...allReviews.map(r=>[r.name,r.episode,r.block,r.quote,r.reaction,r.comment,r.updated_at])];const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=node('a');a.href=url;a.download='Отзывы — Без имени.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
let scrollTimer;window.addEventListener('scroll',()=>{clearTimeout(scrollTimer);scrollTimer=setTimeout(()=>{if(!book)return;const block=[...$('prose').querySelectorAll('p[id]')].find(p=>p.getBoundingClientRect().bottom>100);if(block)rememberPosition(episodes[current].id,block.id);},500);},{passive:true});
// Ключ убирается из адреса до запроса и не сохраняется в хранилище браузера.
async function acceptInvitation(){
 const hash=new URLSearchParams(location.hash.slice(1));if(!hash.has('key'))return false;
 const key=hash.get('key');history.replaceState(null,'',location.pathname+location.search);
 document.querySelectorAll('dialog[open]').forEach(d=>d.close());
 $('reader').hidden=true;$('tools').hidden=true;$('login').hidden=false;book=null;
 session=null;sessionStorage.removeItem(sessionKey);showStatus('loginStatus','Открываем книгу…');
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
