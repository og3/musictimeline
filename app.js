'use strict';
(() => {
const $ = id => document.getElementById(id);
const now = new Date().getFullYear();
const key = 'music-timeline:v1:' + location.pathname.replace(/[^/]*$/, '');
let artists = [], byId = new Map(), state = {version:1,birth:null,ids:[]};
let matches = [], activeIndex = -1, composing = false, openedId = null, focusReturn = null;
let horizontal = 0, undoItem = null, undoTimer, ready = false;
const norm = s => s.normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/[・\s.-]/g,'').trim();
const node = (tag,cls,text) => {const e=document.createElement(tag); if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
const list = s => s ? s.split('|').map(x=>x.trim()).filter(Boolean) : [];
const period = a => `${a.start_year} – ${a.status==='active'?'活動中':a.status==='unknown'?'終了年不明':a.end_year}`;
function notice(text){$('notice').textContent=text;$('notice').hidden=!text;}
function parseCSV(text){
 text=text.replace(/^\uFEFF/,'');let rows=[],row=[],field='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else quoted=false;}else field+=c;}
 else if(c==='"'){if(field)throw Error('CSVの引用符が不正です');quoted=true;}
 else if(c===','){row.push(field);field='';}
 else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(v=>v!==''))rows.push(row);row=[];field='';}
 else field+=c;}
 if(quoted)throw Error('CSVの引用符が閉じられていません');if(field||row.length){row.push(field);rows.push(row);}if(!rows.length)throw Error('CSVが空です');
 const headers=rows.shift().map(x=>x.trim());if(new Set(headers).size!==headers.length)throw Error('列名が重複しています');
 for(const h of ['id','name','start_year','end_year','status'])if(!headers.includes(h))throw Error('必要な列がありません: '+h);
 const ids=new Set();return rows.map((r,i)=>{
 if(r.length!==headers.length)throw Error(`${i+2}行目の列数が一致しません`);
 const a=Object.fromEntries(headers.map((h,j)=>[h,r[j].trim()]));
 if(!a.id||ids.has(a.id)||!a.name)throw Error(`${i+2}行目のIDまたは名前が不正です`);ids.add(a.id);
 if(!/^\d{4}$/.test(a.start_year)||+a.start_year>now)throw Error(`${a.name}の開始年が不正です`);
 if(!['active','ended','unknown'].includes(a.status))throw Error(`${a.name}の状態が不正です`);
 if(a.status==='ended'&&(!/^\d{4}$/.test(a.end_year)||+a.end_year<+a.start_year||+a.end_year>now))throw Error(`${a.name}の終了年が不正です`);
 if(a.status!=='ended'&&a.end_year)throw Error(`${a.name}の状態と終了年が矛盾しています`);
 a.start_year=+a.start_year;a.end_year=a.end_year?+a.end_year:null;
 for(const h of ['aliases','genres','countries','source_url'])a[h]=a[h]||'';
 a.searches=[a.name,...list(a.aliases)].map(norm);return a;});
}
function save(){try{localStorage.setItem(key,JSON.stringify(state));$('save-status').textContent='このブラウザに保存済み';}catch{$('save-status').textContent='保存できません';notice('ブラウザへの保存ができません。このまま操作できますが、閉じると変更が失われます。');}}
function restore(){try{const raw=localStorage.getItem(key);if(!raw)return;const s=JSON.parse(raw);
 if(s.version!==1||!Array.isArray(s.ids)||!s.ids.every(x=>typeof x==='string')||!(s.birth===null||(Number.isInteger(s.birth)&&s.birth>=1900&&s.birth<=now)))throw Error();
 state={version:1,birth:s.birth,ids:[...new Set(s.ids.filter(id=>byId.has(id)))]};
 if(state.ids.length!==new Set(s.ids).size)notice('一部のアーティストを復元できませんでした。登録データが変更された可能性があります。');
 }catch{notice('保存データを読み込めませんでした。空の年表から利用できます。');}}
function syncScroll(left){horizontal=left;document.querySelectorAll('.plot-viewport').forEach(v=>{if(Math.abs(v.scrollLeft-left)>1)v.scrollLeft=left;});}
function timelineScale(start,width){
 const compact=window.matchMedia('(max-width:560px)').matches;
 const span=Math.max(1,now-start),left=compact?12:24,right=compact?12:56;
 const usable=Math.max(1,width-left-right),x=y=>left+(y-start)/span*usable;
 const step=compact?([5,10,20,25,50,100,200,500].find(n=>n/span*usable>=44)||1000):(span<=45?5:10);
 const years=[];for(let y=start;y<=now;y+=step){if(y!==now&&now-y>0&&(compact?x(now)-x(y)<44:now-y<step*.55))continue;years.push(y);}
 if(!years.includes(now))years.push(now);
 return {x,years};
}
function grid(plot,start,width){const {x,years}=timelineScale(start,width);
 for(const y of years){const l=node('span','gridline'+(y===now?' current':''));l.style.left=x(y)+'px';plot.append(l);}return x;}
function makePlot(start,width){const vp=node('div','plot-viewport');vp.tabIndex=0;vp.setAttribute('aria-label','年表を横スクロール');const p=node('div','plot');vp.append(p);const x=grid(p,start,width);vp.addEventListener('scroll',()=>{if(Math.abs(vp.scrollLeft-horizontal)>1)syncScroll(vp.scrollLeft);},{passive:true});return {vp,p,x};}
function drawBar(p,x,a,self=false){
 const st=x(a.start_year),en=x(a.status==='active'?now:a.end_year||a.start_year);
 const bar=node('div','bar '+a.status);bar.style.left=st+'px';bar.style.width=Math.max(2,en-st)+'px';
 if(a.status==='unknown')bar.style.background='transparent';p.append(bar);
 const first=node('span','year-label'+(en-st<100?' short-start':''),String(a.start_year));first.style.left=st+'px';p.append(first);
 const last=node('span','year-label end',a.status==='active'?(self?'現在':'活動中'):a.status==='unknown'?'終了年不明':String(a.end_year));
 last.style.left=(a.status==='unknown'?Math.min(st+95,x(now)):en)+'px';p.append(last);
}
function render(){
 const rows=$('rows'),head=$('fixed-head');rows.replaceChildren();head.replaceChildren();
 const selected=state.ids.map(id=>byId.get(id)).filter(Boolean);
 const years=selected.map(a=>a.start_year);if(state.birth)years.push(state.birth);
 const start=Math.floor((years.length?Math.min(...years):1950)/10)*10;
 const label=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--label'));
 const compact=window.matchMedia('(max-width:560px)').matches;
 const width=Math.max(compact?1:700,$('timeline').clientWidth-label);$('timeline').style.setProperty('--plot',width+'px');
 const axis=node('div','timeline-row axis');axis.append(node('div','row-label','西暦 / YEAR'));const ap=makePlot(start,width);
 for(const y of timelineScale(start,width).years){const t=node('span','tick'+(y===now?' current':''),String(y));t.style.left=ap.x(y)+'px';ap.p.append(t);}axis.append(ap.vp);head.append(axis);
 if(state.birth){const row=node('div','timeline-row self-row');const label=node('div','row-label');const txt=node('div','','あなた');txt.append(node('small','',`今年で${now-state.birth}歳`));label.append(txt);row.append(label);const o=makePlot(start,width);drawBar(o.p,o.x,{start_year:state.birth,status:'active'},true);row.append(o.vp);head.append(row);}
 selected.forEach(a=>{
 const row=node('div','timeline-row artist-row');row.dataset.id=a.id;
 const label=node('div','row-label');const handle=node('button','handle','⠿');handle.setAttribute('aria-label',a.name+'を並べ替え');handle.title='ドラッグで並べ替え';
 const name=node('button','artist-name');name.append(node('strong','',a.name),node('small','',a.countries||'国未登録'));name.title=a.name;name.setAttribute('aria-label',a.name+'の詳細と操作');name.onclick=()=>openArtist(a.id,name);
 const more=node('button','row-more','⋯');more.setAttribute('aria-label',a.name+'の操作');more.onclick=()=>openArtist(a.id,more);
 label.append(handle,name,more);row.append(label);const o=makePlot(start,width);o.vp.setAttribute('aria-label',a.name+'：'+period(a)+'。横スクロール可能');drawBar(o.p,o.x,a);row.append(o.vp);rows.append(row);bindDrag(handle,row);bindLongPress(name,()=>openArtist(a.id,name));
 });
 $('selected-count').textContent=state.ids.length;$('empty').hidden=!!state.ids.length;$('reset').disabled=!ready||(!state.ids.length&&state.birth===null);
 syncScroll(Math.max(0,Math.min(horizontal,width-($('timeline').clientWidth-label))));renderCatalog();
}
function add(id,focusSearch=true){if(!byId.has(id)||state.ids.includes(id))return;state.ids.push(id);save();render();$('search').value='';search();if(focusSearch)$('search').focus({preventScroll:true});announce(byId.get(id).name+'を追加しました',false);}
function search(){
 const q=norm($('search').value);activeIndex=-1;matches=[];$('search').removeAttribute('aria-activedescendant');$('results').replaceChildren();
 if(!q){$('search-help').textContent='日本語名・英語名・略称で検索できます。';$('search').setAttribute('aria-expanded','false');return;}
 matches=artists.map(a=>({a,score:Math.min(...a.searches.map(n=>n===q?0:n.startsWith(q)?1:n.includes(q)?2:9))})).filter(o=>o.score<9).sort((a,b)=>a.score-b.score||a.a.name.localeCompare(b.a.name,'ja')).slice(0,20).map(o=>o.a);
 $('search-help').textContent=matches.length?`${matches.length}件の候補`:'登録済みデータに見つかりません';
 matches.forEach((a,i)=>{const b=node('button','candidate');b.id='result-'+i;b.setAttribute('role','option');b.setAttribute('aria-selected','false');b.disabled=state.ids.includes(a.id);b.append(node('strong','',a.name+(b.disabled?' · 追加済み':'')),node('small','',[a.countries,period(a)].filter(Boolean).join(' / ')));b.onclick=()=>add(a.id);$('results').append(b);});$('search').setAttribute('aria-expanded',String(!!matches.length));
}
function renderCatalog(){const c=$('catalog-list');c.replaceChildren();for(const country of [...new Set(artists.map(a=>a.countries))]){
 const h=node('p','help',country||'国未登録');c.append(h);artists.filter(a=>a.countries===country).forEach(a=>{const b=node('button','catalog-item');b.disabled=state.ids.includes(a.id);b.append(node('strong','',a.name+(b.disabled?' · 追加済み':'')),node('small','',period(a)));b.onclick=()=>add(a.id,false);c.append(b);});}}
function bindLongPress(el,callback){let timer,x,y;const clear=()=>clearTimeout(timer);el.addEventListener('pointerdown',e=>{if(e.button!==0)return;x=e.clientX;y=e.clientY;timer=setTimeout(callback,600);});el.addEventListener('pointermove',e=>{if(Math.hypot(e.clientX-x,e.clientY-y)>8)clear();});['pointerup','pointercancel','pointerleave'].forEach(t=>el.addEventListener(t,clear));el.addEventListener('contextmenu',e=>e.preventDefault());}
function bindDrag(handle,row){let drag=null;handle.addEventListener('pointerdown',e=>{if(e.button!==0)return;handle.setPointerCapture(e.pointerId);drag={id:row.dataset.id,start:e.clientY,target:null,moved:false};});
 handle.addEventListener('pointermove',e=>{if(!drag)return;if(Math.abs(e.clientY-drag.start)<6&&!drag.moved)return;drag.moved=true;row.classList.add('dragging');
 document.querySelectorAll('.drop-target').forEach(r=>r.classList.remove('drop-target'));const targets=[...document.querySelectorAll('.artist-row')];const target=targets.find(r=>{const b=r.getBoundingClientRect();return e.clientY>=b.top&&e.clientY<=b.bottom;});
 if(target){drag.target=target.dataset.id;target.classList.add('drop-target');}if(e.clientY>innerHeight-50)window.scrollBy(0,15);else if(e.clientY<60)window.scrollBy(0,-15);});
 const finish=(cancel=false)=>{if(!drag)return;const d=drag;drag=null;document.querySelectorAll('.dragging,.drop-target').forEach(r=>r.classList.remove('dragging','drop-target'));if(!cancel&&d.moved&&d.target&&d.target!==d.id){const i=state.ids.indexOf(d.id),j=state.ids.indexOf(d.target);state.ids.splice(i,1);state.ids.splice(j,0,d.id);save();render();search();}};
 handle.addEventListener('pointerup',()=>finish());handle.addEventListener('pointercancel',()=>finish(true));handle.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openArtist(row.dataset.id,handle);}});
}
function openArtist(id,origin){if($('artist-dialog').open)return;openedId=id;focusReturn=origin;const a=byId.get(id);$('artist-title').textContent=a.name;$('artist-meta').textContent=[a.countries,period(a)].filter(Boolean).join(' / ');$('artist-genres').textContent=list(a.genres).join(' · ');
 const age=state.birth?a.start_year-state.birth:null;$('artist-age').textContent=age===null?'':age<0?`活動開始は、あなたが生まれる${-age}年前です。`:`活動開始は、あなたが${age}歳になる年です。`;
 const url=list(a.source_url).find(u=>/^https?:\/\//.test(u));$('artist-source').hidden=!url;if(url)$('artist-source').href=url;const idx=state.ids.indexOf(id);$('move-up').disabled=idx===0;$('move-down').disabled=idx===state.ids.length-1;$('artist-dialog').showModal();}
function move(delta){const i=state.ids.indexOf(openedId),j=i+delta;if(i<0||j<0||j>=state.ids.length)return;[state.ids[i],state.ids[j]]=[state.ids[j],state.ids[i]];save();render();search();$('move-up').disabled=j===0;$('move-down').disabled=j===state.ids.length-1;}
function announce(text,undo=false){clearTimeout(undoTimer);$('toast-text').textContent=text;$('undo').hidden=!undo;$('toast').hidden=false;undoTimer=setTimeout(()=>{$('toast').hidden=true;undoItem=null;},undo?8000:2500);}
function deleteArtist(){const id=openedId,index=state.ids.indexOf(id);if(index<0)return;undoItem={id,index};state.ids.splice(index,1);$('artist-dialog').close();save();render();search();$('search').focus({preventScroll:true});announce(byId.get(id).name+'を削除しました',true);}
$('undo').onclick=()=>{if(undoItem&&!state.ids.includes(undoItem.id)){state.ids.splice(Math.min(undoItem.index,state.ids.length),0,undoItem.id);save();render();search();}undoItem=null;clearTimeout(undoTimer);$('toast').hidden=true;};
$('search').addEventListener('input',()=>{if(!composing)search();});$('search').addEventListener('compositionstart',()=>composing=true);$('search').addEventListener('compositionend',()=>{composing=false;search();});
$('search').addEventListener('keydown',e=>{if(e.isComposing)return;if(e.key==='Escape'){$('results').replaceChildren();$('search').setAttribute('aria-expanded','false');$('search').removeAttribute('aria-activedescendant');activeIndex=-1;return;}
 if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(!$('results').children.length)search();const choices=[...$('results').children];if(!choices.some(b=>!b.disabled))return;const d=e.key==='ArrowDown'?1:-1;let i=activeIndex;do{i=(i+d+choices.length)%choices.length;}while(choices[i].disabled);activeIndex=i;choices.forEach((b,j)=>{b.classList.toggle('selected',i===j);b.setAttribute('aria-selected',String(i===j));});$('search').setAttribute('aria-activedescendant',choices[i].id);choices[i].scrollIntoView({block:'nearest'});}
 if(e.key==='Enter'&&activeIndex>=0&&matches[activeIndex]){e.preventDefault();add(matches[activeIndex].id);}});
$('birth').max=now;$('birth').addEventListener('change',()=>{const v=$('birth').value;const birth=v===''?null:Number(v);const valid=!$('birth').validity.badInput&&(birth===null||(Number.isInteger(birth)&&birth>=1900&&birth<=now));$('birth-error').hidden=valid;$('birth').setAttribute('aria-invalid',String(!valid));if(!valid){$('birth-error').textContent=`1900〜${now}年の整数を入力してください。`;return;}state.birth=birth;save();render();});
$('move-up').onclick=()=>move(-1);$('move-down').onclick=()=>move(1);$('delete').onclick=deleteArtist;
$('artist-dialog').querySelector('.dialog-close').onclick=()=>$('artist-dialog').close();$('artist-dialog').addEventListener('close',()=>{if(focusReturn?.isConnected)focusReturn.focus({preventScroll:true});else if(openedId){const r=[...document.querySelectorAll('.artist-row')].find(r=>r.dataset.id===openedId);r?.querySelector('.row-more').focus({preventScroll:true});}});
$('reset').onclick=()=>$('reset-dialog').showModal();$('cancel-reset').onclick=()=>$('reset-dialog').close();$('confirm-reset').onclick=()=>{state={version:1,birth:null,ids:[]};horizontal=0;undoItem=null;clearTimeout(undoTimer);$('toast').hidden=true;$('birth').value='';$('birth-error').hidden=true;$('birth').removeAttribute('aria-invalid');$('search').value='';$('reset-dialog').close();save();render();search();$('search').focus();};
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(ready)render();},120);});
async function init(){try{
 $('retry').hidden=true;$('search-help').textContent='データを読み込んでいます…';
 const embedded=$('embedded-csv');let csv;if(embedded)csv=embedded.textContent;else{const res=await fetch('./artists.csv');if(!res.ok)throw Error('CSVを取得できません');csv=await res.text();}
 artists=parseCSV(csv);byId=new Map(artists.map(a=>[a.id,a]));restore();ready=true;$('search').disabled=false;$('birth').value=state.birth??'';$('catalog-count').textContent=artists.length+'組';
 $('suggestions').replaceChildren();for(const id of ['uk-beatles','jp-spitz','us-gnr'])if(byId.has(id)){const b=node('button','',byId.get(id).name+' ＋');b.onclick=()=>add(id);$('suggestions').append(b);}
 render();search();
 }catch(e){$('search-help').textContent='アーティストデータを読み込めませんでした。';$('retry').hidden=false;notice('読み込みエラー：'+e.message+'。公開URLまたはローカルサーバーから開いてください。');render();}}
$('retry').onclick=()=>{notice('');init();};
// Optional browser-agent interface; ordinary browsers do not need this API.
if(document.modelContext?.registerTool){
 const lifecycle=new AbortController();
 const register=tool=>{try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
 register({name:'read_music_timeline',description:'Read the selected artists and birth year without changing them.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute(){return {ready,birth:state.birth,artists:state.ids.map(id=>({id,name:byId.get(id)?.name}))};}});
 register({name:'add_music_artists',description:'Add registered artist IDs to the visible timeline and save the selection.',inputSchema:{type:'object',properties:{ids:{type:'array',items:{type:'string'},minItems:1}},required:['ids'],additionalProperties:false},annotations:{readOnlyHint:false},execute(input){if(!ready||!input||!Array.isArray(input.ids)||!input.ids.length||!input.ids.every(id=>typeof id==='string'&&byId.has(id)))throw Error('Registered artist IDs are required.');for(const id of input.ids)add(id);return {selectedIds:[...state.ids]};}});
 window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
init();
})();
