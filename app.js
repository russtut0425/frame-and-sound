const STORAGE_KEY = "frame-and-sound-entries-v1";
const SEED_MIGRATION_KEY = "frame-and-sound-seed-version";
const IMAGE_DB_NAME = "frame-and-sound-images";
const IMAGE_STORE_NAME = "images";
const SEED_VERSION = 10;
const accents = {violet:"#8d6df1",gold:"#f0b847",red:"#d94a42",blue:"#5a8ccc",amber:"#b86f3e",green:"#5f8e75"};
const accentNames = Object.keys(accents);
const seedEntries = [
  {id:1,type:"film",title:"穆赫兰道",subtitle:"Mulholland Drive",creator:"大卫·林奇",releaseYear:2001,rating:9.6,loggedDate:"2026-08-18",summary:"梦不是谜底，而是欲望替自己搭起的布景。",note:"最迷人的不是反转，而是醒来后，梦里那些温柔细节突然全部变成证词。",tags:"梦境,身份,洛杉矶",favorite:true,accent:"violet"},
  {id:2,type:"album",title:"Discovery",subtitle:"Daft Punk",creator:"Daft Punk",releaseYear:2001,rating:9.5,loggedDate:"2026-08-16",summary:"流行、机器与童年记忆，被做成一场不会褪色的太空舞会。",note:"每首歌都能独立成立，但连起来又是一整个世界。技术从来没有抢走情绪。",tags:"French house,电子,回听",favorite:true,accent:"gold"},
  {id:3,type:"film",title:"出租车司机",subtitle:"Taxi Driver",creator:"马丁·斯科塞斯",releaseYear:1976,rating:9.2,loggedDate:"2026-08-11",summary:"孤独久了，人会把自己的病当成世界的病。",note:"纽约不是背景，是特拉维斯精神状态的外化：潮湿、黏腻、愤怒又无处可去。",tags:"孤独,城市,人物",favorite:true,accent:"red"},
  {id:4,type:"album",title:"We Will Always Love You",subtitle:"The Avalanches",creator:"The Avalanches",releaseYear:2020,rating:9.3,loggedDate:"2026-08-08",summary:"像把已经消失的声音送进宇宙，让它们继续彼此相爱。",note:"采样不是炫技，而是记忆的物理形态。温柔，但背后一直有死亡的阴影。",tags:"采样,宇宙,记忆",favorite:true,accent:"blue"},
  {id:5,type:"film",title:"花样年华",subtitle:"In the Mood for Love",creator:"王家卫",releaseYear:2000,rating:7.8,loggedDate:"2026-08-03",summary:"真正留下来的，是两个人始终没有做出的事。",note:"重复的走廊、楼梯和音乐把时间困住。留白有效，但情绪距离也比预想中更远。",tags:"留白,时间,欲望",favorite:false,accent:"amber"},
  {id:6,type:"album",title:"The Age of Adz",subtitle:"Sufjan Stevens",creator:"Sufjan Stevens",releaseYear:2010,rating:8.7,loggedDate:"2026-07-31",summary:"电子噪点包住一颗过度裸露的心。",note:"复杂并不是目的。那些失控的编排，最终都指向一种无法体面表达的脆弱。",tags:"电子,私人,失控",favorite:true,accent:"green"},
  ...(window.filmSeedEntries||[]),
  ...(window.albumSeedEntries||[]),
  ...(window.gameSeedEntries||[])
];

let storageMigrationNeeded = false;
let storageIssue = "";
let storedSnapshot = null;
let appliedSeeds = [];
let entries = loadEntries();
let activeFilter = "all";
let activeSort = "recent";
let query = "";
let selectedId = null;
let pendingImage = "";
let editingEntry = null;
let formSession = 0;
let imageRequest = 0;
let busy = false;
let currentModal = null;
let returnFocus = null;
let returnFocusId = null;
const runtimeImageURLs = new Map();
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

function escapeHTML(value=""){return String(value).replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[char]);}
function entryIdentity(entry){return [entry.type,entry.title,entry.creator].map(value=>String(value||"").trim().toLowerCase()).join("|");}
// Metadata and records share one atomic localStorage write. Keep legacy arrays readable.
function localDate(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function seedVersion(entry){
  if(entry.id===20033)return 10;
  if(entry.id===10183)return 9;
  if(entry.id<=6)return 1;
  if(entry.id===30002)return 8;
  if(entry.type==="film")return 7;
  if(entry.type==="game")return 6;
  if(entry.creator==="刘元")return 5;
  if(["能登麻美子","Bang Gang","Ground-Zero","Ahousen"].includes(entry.creator))return 3;
  return 2;
}
function normalizeEntries(list,{external=false,repairIds=false}={}){
  if(!Array.isArray(list))throw new Error("备份缺少记录列表");
  const ids=new Set();let nextId=Math.max(Date.now(),...list.map(e=>Number.isSafeInteger(e?.id)?e.id:0));
  return list.map((source,index)=>{
    const fail=()=>{throw new Error(`第 ${index+1} 条记录格式不完整，请检查备份`);};
    if(!source||typeof source!=="object"||Array.isArray(source)||!["film","album","game"].includes(source.type))fail();
    const entry={};
    for(const key of ["title","subtitle","creator","summary","note","tags","platform"]){if(source[key]!=null&&typeof source[key]!=="string")fail();entry[key]=source[key]||"";}
    if(!entry.title.trim()||!entry.creator.trim())fail();
    entry.id=source.id;if(!Number.isSafeInteger(entry.id)||entry.id<=0)fail();
    if(ids.has(entry.id)){if(!repairIds)fail();entry.id=++nextId;}ids.add(entry.id);
    entry.type=source.type;
    for(const key of ["rating","hours","releaseYear"]){
      const value=source[key];if(value==null||value===""){entry[key]=null;continue;}
      if(!["number","string"].includes(typeof value)||!String(value).trim())fail();
      const number=Number(value);
      if(!Number.isFinite(number)||number<0||(key==="rating"&&number>10)||(key==="releaseYear"&&(!Number.isInteger(number)||number>9999)))fail();
      entry[key]=number;
    }
    if(typeof source.loggedDate!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(source.loggedDate))fail();
    const date=new Date(source.loggedDate+"T12:00:00Z");if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==source.loggedDate)fail();
    entry.loggedDate=source.loggedDate;
    entry.status=source.status||"";if(!["","wishlist","playing","finished","paused","dropped"].includes(entry.status))fail();
    if(source.favorite!=null&&typeof source.favorite!=="boolean")fail();entry.favorite=source.favorite===true;
    entry.accent=Object.hasOwn(accents,source.accent)?source.accent:"red";
    const image=source.image??"";
    if(typeof image!=="string"||(image!==""&&image!=="none"&&!isDataImage(image)&&!validFileImage(image)&&!(isStoredImage(image)&&!external)))fail();
    entry.image=image;
    if(typeof source.coverKey==="string")entry.coverKey=source.coverKey;
    return entry;
  });
}
function loadEntries(){
  try{
    storedSnapshot=localStorage.getItem(STORAGE_KEY);
    if(storedSnapshot===null){appliedSeeds=seedEntries.map(e=>e.id);storageMigrationNeeded=true;return normalizeEntries(seedEntries);}
    const data=JSON.parse(storedSnapshot);const legacy=Array.isArray(data);
    if(!legacy&&(data?.version!==3||!Array.isArray(data.appliedSeeds)||!data.appliedSeeds.every(Number.isSafeInteger)))throw new Error();
    const stored=normalizeEntries(legacy?data:data.entries,{repairIds:legacy});
    const version=Number(localStorage.getItem(SEED_MIGRATION_KEY)||1);
    const handled=new Set(legacy?seedEntries.filter(e=>seedVersion(e)<=version).map(e=>e.id):data.appliedSeeds);
    const ids=new Set(stored.map(e=>e.id));const known=new Set(stored.map(entryIdentity));
    const additions=seedEntries.filter(e=>!handled.has(e.id)&&!ids.has(e.id)&&!known.has(entryIdentity(e)));
    appliedSeeds=[...new Set([...handled,...seedEntries.map(e=>e.id)])];
    storageMigrationNeeded=legacy||additions.length>0||appliedSeeds.length!==handled.size;
    return [...normalizeEntries(additions),...stored];
  }catch{storageIssue="存档读取失败，原数据已保留。请先导出原始数据，再导入有效备份恢复。";return [];}
}
function saveEntries(next=entries,{restore=false,seeds=appliedSeeds}={}){
  if(storageIssue&&!restore)throw new Error(storageIssue);
  const current=localStorage.getItem(STORAGE_KEY);
  if(current!==storedSnapshot)throw new Error("另一个页面已修改存档，请刷新后再操作");
  const value=JSON.stringify({version:3,seedVersion:SEED_VERSION,appliedSeeds:seeds,entries:next});
  try{localStorage.setItem(STORAGE_KEY,value);}catch{throw new Error("记录保存失败，请先导出备份；原记录未改动");}
  storedSnapshot=value;entries=next;appliedSeeds=seeds;storageMigrationNeeded=false;storageIssue="";
}
function tagsOf(entry){return String(entry.tags||"").split(/[,，]/).map(tag=>tag.trim()).filter(Boolean);}
function ratingOf(entry){if(entry?.rating===""||entry?.rating==null)return null;const rating=Number(entry.rating);return Number.isFinite(rating)?rating:null;}
function ratingLabel(entry){const rating=ratingOf(entry);return rating===null?"—":rating.toFixed(1);}
function ratingMarkup(entry){return `<strong class="rating-score" data-rating-tier="${ratingTier(entry)}">${ratingLabel(entry)}</strong>`;}
function ratingTier(entry){
  const value=ratingOf(entry);if(value===null)return "unrated";
  // Match the one-decimal score displayed on cards, details and statistics.
  const rating=Number(value.toFixed(1));
  if(rating===10)return "perfect";
  if(rating>=9.5)return "gold";
  if(rating>=9)return "orange";
  return "blue";
}
function notify(message){const toast=$("#toast");toast.textContent=message;toast.classList.remove("hidden");clearTimeout(notify.timer);notify.timer=setTimeout(()=>toast.classList.add("hidden"),2200);}
function isDataImage(value){return /^data:image\/(?:jpeg|png|webp);base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/i.test(String(value||""))&&String(value).split(",")[1].length>0;}
function isStoredImage(value){return /^idb:[a-z0-9._-]+$/i.test(String(value||""));}
function imageRef(id){return `idb:${id}-${crypto.randomUUID()}`;}
function validFileImage(value){return /^covers\/[a-z0-9._-]+\.(?:jpe?g|png|webp)$/i.test(String(value||""));}
function imageOf(entry){
  const uploaded=typeof entry?.image==="string"?entry.image:"";
  if(uploaded==="none")return "";
  const seed=seedEntries.find(item=>item.id===entry.id&&item.type===entry.type);
  const identity=entry.coverKey||entryIdentity(seed||entry);const automatic=window.filmCoverMap?.[identity]||window.gameCoverMap?.[identity]||window.albumCoverMap?.[identity]||"";
  if(isDataImage(uploaded))return uploaded;
  if(isStoredImage(uploaded))return runtimeImageURLs.get(uploaded)||(validFileImage(automatic)?automatic:"");
  if(validFileImage(uploaded))return uploaded;
  return validFileImage(automatic)?automatic:"";
}

function openImageDB(){
  return new Promise((resolve,reject)=>{const request=indexedDB.open(IMAGE_DB_NAME,1);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(IMAGE_STORE_NAME))db.createObjectStore(IMAGE_STORE_NAME);};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error("图片存储不可用"));});
}
async function writeStoredImage(ref,data){const db=await openImageDB();return new Promise((resolve,reject)=>{const transaction=db.transaction(IMAGE_STORE_NAME,"readwrite");transaction.objectStore(IMAGE_STORE_NAME).put(data,ref);transaction.oncomplete=()=>{db.close();resolve();};transaction.onabort=transaction.onerror=()=>{db.close();reject(transaction.error||new Error("图片存储失败"));};});}
async function readStoredImage(ref){const db=await openImageDB();return new Promise((resolve,reject)=>{const request=db.transaction(IMAGE_STORE_NAME,"readonly").objectStore(IMAGE_STORE_NAME).get(ref);request.onsuccess=()=>{db.close();resolve(request.result||"");};request.onerror=()=>{db.close();reject(request.error||new Error("图片读取失败"));};});}
async function deleteStoredImage(ref){if(!isStoredImage(ref))return;const db=await openImageDB();return new Promise((resolve,reject)=>{const transaction=db.transaction(IMAGE_STORE_NAME,"readwrite");transaction.objectStore(IMAGE_STORE_NAME).delete(ref);transaction.oncomplete=()=>{db.close();runtimeImageURLs.delete(ref);resolve();};transaction.onabort=transaction.onerror=()=>{db.close();reject(transaction.error||new Error("图片删除失败"));};});}
async function commitEntries(next,options={}){
  const staged=[];const previous=entries;
  try{
    for(const entry of next){if(isDataImage(entry.image)){
      const ref=imageRef(entry.id);await writeStoredImage(ref,entry.image);
      staged.push(ref);runtimeImageURLs.set(ref,entry.image);entry.image=ref;
    }}
    saveEntries(next,options);
  }catch(error){await Promise.allSettled(staged.map(deleteStoredImage));throw error;}
  const active=new Set(next.map(e=>e.image));
  // Cleanup is best-effort after commit; never invalidate the previous save on failure.
  for(const ref of new Set(previous.map(e=>e.image).filter(isStoredImage)))if(!active.has(ref))deleteStoredImage(ref).catch(()=>{});
}
async function initializeImageStorage(){
  if(storageIssue){$("#storage-warning").textContent=storageIssue;$("#storage-warning").classList.remove("hidden");return;}
  try{
    if(storageMigrationNeeded||entries.some(e=>isDataImage(e.image)))await commitEntries(entries.map(e=>({...e})));
    let missing=0;
    await Promise.all(entries.filter(e=>isStoredImage(e.image)).map(async entry=>{try{const data=await readStoredImage(entry.image);if(!isDataImage(data))throw new Error();runtimeImageURLs.set(entry.image,data);}catch{missing++;}}));
    render();if(currentModal==="detail")openDetail(selectedId);if(currentModal==="form")updateImagePreview();if(missing)notify(`${missing} 张上传图片未能读取，可尝试刷新或从备份恢复`);
  }catch(error){notify(error.message||"图片读取失败，请先保留备份");}
}
async function exportableEntries(snapshot){return Promise.all(snapshot.map(async entry=>{
  if(!isStoredImage(entry.image))return {...entry};
  const image=runtimeImageURLs.get(entry.image)||await readStoredImage(entry.image);
  if(!isDataImage(image))throw new Error(`《${entry.title}》的图片未能读取，备份未完成`);
  return {...entry,image};
}));}
function downloadJSON(data,name){
  const blob=new Blob([typeof data==="string"?data:JSON.stringify(data,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function runStorageTask(task){
  if(busy){notify("正在保存，请稍候");return;}
  busy=true;$("#save-button").disabled=true;
  try{await imageStorageReady;await task();}catch(error){notify(error.message||"操作失败，原记录已保留");}
  finally{busy=false;$("#save-button").disabled=false;}
}

function compressImage(file){
  return new Promise((resolve,reject)=>{
    if(!file.type.startsWith("image/")||file.size>15*1024*1024){reject(new Error("请选择 15MB 以内的 JPG、PNG 或 WebP 图片"));return;}
    const url=URL.createObjectURL(file);const image=new Image();
    image.onload=()=>{URL.revokeObjectURL(url);try{const maxEdge=1200;const scale=Math.min(1,maxEdge/Math.max(image.naturalWidth,image.naturalHeight));const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));const context=canvas.getContext("2d");context.drawImage(image,0,0,canvas.width,canvas.height);let output=canvas.toDataURL("image/webp",.78);if(!output.startsWith("data:image/webp"))output=canvas.toDataURL("image/jpeg",.78);resolve(output);}catch{reject(new Error("图片压缩失败，请换一张图片重试"));}};
    image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("这张图片读取失败"));};image.src=url;
  });
}

function updateImagePreview(){
  const preview=$("#image-preview");const image=imageOf({...editingEntry,image:pendingImage});preview.classList.toggle("has-image",Boolean(image));preview.innerHTML=image?`<img src="${escapeHTML(image)}" alt="图片预览">`:`<span>暂无图片</span>`;$("#remove-image").disabled=!image;
}

const typeCopy = {
  film: {badge:"FILM",detailBadge:"FILM NOTE",creator:"导演",image:"剧照（可选）",summary:"一句话留下它",note:"真正击中我的是什么",favorite:"这是我会反复回去的作品",detailNote:"留下来的部分"},
  album: {badge:"ALBUM",detailBadge:"LISTENING NOTE",creator:"音乐人",image:"专辑封面（可选）",summary:"一句话留下它",note:"真正击中我的是什么",favorite:"这是我会反复回去的作品",detailNote:"留下来的部分"},
  game: {badge:"GAME",detailBadge:"PLAY LOG",creator:"开发者 / 发行商",image:"封面或截图（可选）",summary:"一句话记住这次游玩",note:"这游戏真正留下了什么",favorite:"这是我会反复回去的游戏",detailNote:"这次游玩留下的东西"}
};
const gameStatuses = {wishlist:"想玩",playing:"正在玩",finished:"已通关",paused:"暂停",dropped:"弃坑"};
function gameMetaOf(entry){
  if(entry.type!=="game")return [];
  const hours=entry.hours!==""&&entry.hours!=null&&Number.isFinite(Number(entry.hours))?Number(entry.hours):null;
  return [gameStatuses[entry.status]||"",String(entry.platform||"").trim(),hours===null?"":`${hours} 小时`].filter(Boolean);
}

function render(){
  const films=entries.filter(e=>e.type==="film");const albums=entries.filter(e=>e.type==="album");const games=entries.filter(e=>e.type==="game");const rated=entries.map(ratingOf).filter(rating=>rating!==null);const average=rated.length?rated.reduce((sum,rating)=>sum+rating,0)/rated.length:null;
  $("#film-count").textContent=String(films.length).padStart(2,"0");$("#album-count").textContent=String(albums.length).padStart(2,"0");$("#game-count").textContent=String(games.length).padStart(2,"0");$("#average-rating").textContent=average===null?"—":average.toFixed(1);$("#all-tab-count").textContent=entries.length;$("#film-tab-count").textContent=films.length;$("#album-tab-count").textContent=albums.length;$("#game-tab-count").textContent=games.length;
  const tokens=normalizeSearch(query).split(/\s+/).filter(Boolean);
  const shown=entries.filter(e=>activeFilter==="all"||e.type===activeFilter).filter(e=>tokens.every(token=>searchText(e).includes(token))).sort((a,b)=>{if(activeSort!=="rating")return b.loggedDate.localeCompare(a.loggedDate);const aRating=ratingOf(a);const bRating=ratingOf(b);if(aRating===null&&bRating===null)return b.loggedDate.localeCompare(a.loggedDate);if(aRating===null)return 1;if(bRating===null)return -1;return bRating-aRating;});
  $("#average-rating").dataset.ratingTier=ratingTier({rating:average});
  $("#entry-grid").classList.toggle("album-grid",activeFilter==="album");
  $("#result-count").textContent=`显示 ${shown.length} 条记录`;
  $("#entry-grid").innerHTML=shown.length?shown.map((entry,index)=>{
    const copy=typeCopy[entry.type]||typeCopy.film;const image=imageOf(entry);const symbol=entry.type==="film"?"◐":entry.type==="album"?"◉":"◆";const art=image?`<img class="entry-image" src="${escapeHTML(image)}" alt="${escapeHTML(entry.title)}" loading="lazy" decoding="async">`:`<div class="art-shape ${entry.type}"><span>${symbol}</span></div>`;const gameMeta=gameMetaOf(entry);const gameInfo=gameMeta.length?`<div class="game-meta">${gameMeta.map(item=>`<span>${escapeHTML(item)}</span>`).join("")}</div>`:"";
    if(entry.type==="album")return `<article class="entry-card album-card" data-id="${escapeHTML(entry.id)}" data-rating-tier="${ratingTier(entry)}" role="button" aria-label="查看 ${escapeHTML(entry.title)}" tabindex="0" style="--accent:${accents[entry.accent]||accents.red}">
      <div class="album-sleeve"><div class="card-art album-art ${image?"has-image album-image":""}">${art}${entry.favorite?'<span class="favorite" aria-label="心爱作品">♥</span>':""}</div></div>
      <div class="card-body"><div class="album-caption"><span>ALBUM</span>${entry.releaseYear?`<span>${escapeHTML(entry.releaseYear)}</span>`:""}</div>
        <div class="card-title-row"><div><h2>${escapeHTML(entry.title)}</h2>${entry.subtitle?`<p>${escapeHTML(entry.subtitle)}</p>`:""}</div>${ratingMarkup(entry)}</div>
        <p class="creator">${escapeHTML(entry.creator)}</p>
        ${entry.summary?`<blockquote>${escapeHTML(entry.summary)}</blockquote>`:""}
        <div class="tag-row">${tagsOf(entry).slice(0,3).map(tag=>`<span>#${escapeHTML(tag)}</span>`).join("")}</div>
      </div></article>`;
    return `<article class="entry-card ${entry.type==="game"?"game-card":""}" data-id="${escapeHTML(entry.id)}" data-rating-tier="${ratingTier(entry)}" role="button" aria-label="查看 ${escapeHTML(entry.title)}" tabindex="0" style="--accent:${accents[entry.accent]||accents.red}"><div class="card-art ${image?`has-image ${entry.type}-image`:""}" data-index="${String(index+1).padStart(2,"0")}">${art}<span class="type-badge">${copy.badge}</span>${entry.favorite?'<span class="favorite" aria-label="心爱作品">♥</span>':""}</div><div class="card-body"><div class="card-title-row"><div><h2>${escapeHTML(entry.title)}</h2><p>${escapeHTML(entry.subtitle)}</p></div>${ratingMarkup(entry)}</div><p class="creator">${escapeHTML(entry.creator)}${entry.releaseYear?` · ${escapeHTML(entry.releaseYear)}`:""}</p>${gameInfo}<blockquote>“${escapeHTML(entry.summary)}”</blockquote><div class="tag-row">${tagsOf(entry).slice(0,3).map(tag=>`<span>#${escapeHTML(tag)}</span>`).join("")}</div></div></article>`;
  }).join(""):`<div class="no-results"><span>∅</span><p>${query.trim()?"没有匹配的记录，试试更短的关键词。":"这里还没有记录，点击“新记录”添加。"}</p></div>`;
}

function openForm(entry=null){
  if(busy){notify("正在保存，请稍候");return;}formSession++;imageRequest++;editingEntry=entry;
  const form=$("#entry-form");form.reset();form.elements.loggedDate.value=localDate();form.elements.rating.value="";form.elements.status.value="";$("#save-button").disabled=false;form.elements.type.value="film";form.elements.id.value="";pendingImage=typeof entry?.image==="string"?entry.image:"";$("#entry-image").value="";updateImagePreview();
  if(entry){Object.entries(entry).forEach(([key,value])=>{if(form.elements[key]){if(form.elements[key].type==="checkbox")form.elements[key].checked=Boolean(value);else form.elements[key].value=value??"";}});$("#form-eyebrow").textContent="EDIT THE MEMORY";$("#form-title").textContent="记忆变了，就改掉。";$("#save-button").textContent="保存修改";}else{$("#form-eyebrow").textContent="ADD TO THE ARCHIVE";$("#form-title").textContent="刚看完，还是后来想起？";$("#save-button").textContent="收进档案";}
  setType(form.elements.type.value);$("#form-error").classList.add("hidden");showModal("form",form.elements.title);
}
function setType(type){
  $("#image-preview").classList.toggle("album-preview",type==="album");
  const copy=typeCopy[type]||typeCopy.film;$("#entry-form").elements.type.value=type;$$('[data-type]').forEach(button=>button.classList.toggle("active",button.dataset.type===type));$$(".game-only").forEach(field=>field.classList.toggle("hidden",type!=="game"));$("#creator-label").textContent=copy.creator;$("#image-field-label").textContent=copy.image;$("#summary-label").textContent=copy.summary;$("#note-label").textContent=copy.note;$("#favorite-label").textContent=copy.favorite;

}
function closeForm(){if(busy)return;formSession++;imageRequest++;hideModal("form");}
function openDetail(id){
  const entry=entries.find(item=>item.id===id);if(!entry)return;selectedId=id;const modal=$("#detail-modal");const copy=typeCopy[entry.type]||typeCopy.film;const image=imageOf(entry);const rating=ratingOf(entry);const score=rating===null?'—<small>待评分</small>':`${rating.toFixed(1)}<small>/ 10</small>`;const gameMeta=gameMetaOf(entry);const gameInfo=gameMeta.length?`<div class="detail-game-meta">${gameMeta.map(item=>`<span>${escapeHTML(item)}</span>`).join("")}</div>`:"";modal.style.setProperty("--accent",accents[entry.accent]||accents.red);modal.dataset.ratingTier=ratingTier(entry);modal.classList.toggle("game-detail",entry.type==="game");modal.classList.toggle("album-detail",entry.type==="album");modal.innerHTML=`<button class="close-button" data-close="detail" aria-label="关闭">×</button><span class="type-badge">${copy.detailBadge}</span><div class="detail-score rating-score" data-rating-tier="${ratingTier(entry)}">${score}</div>${image?`<div class="detail-image ${entry.type}"><img src="${escapeHTML(image)}" alt="${escapeHTML(entry.title)}" decoding="async"></div>`:""}<h2 id="detail-title">${escapeHTML(entry.title)}</h2><p class="detail-subtitle">${escapeHTML(entry.subtitle)}</p><p class="creator">${escapeHTML(entry.creator)}${entry.releaseYear?` · ${escapeHTML(entry.releaseYear)}`:""}</p>${gameInfo}<blockquote>“${escapeHTML(entry.summary)}”</blockquote><div class="detail-note"><span>${copy.detailNote}</span><p>${escapeHTML(entry.note||"还没写下更多。").replace(/\n/g,"<br>")}</p></div><div class="detail-bottom"><div class="tag-row">${tagsOf(entry).map(tag=>`<span>#${escapeHTML(tag)}</span>`).join("")}</div><time>${escapeHTML(entry.loggedDate)}</time></div><div class="detail-actions"><button data-action="edit">编辑记录</button><button class="danger" data-action="delete">删除这条记录</button></div>`;showModal("detail",modal.querySelector("button"));
}
function closeDetail(){hideModal("detail");selectedId=null;}

$("#entry-form").addEventListener("submit",event=>{
  event.preventDefault();if($("#save-button").disabled)return;
  const form=new FormData(event.currentTarget);const type=String(form.get("type")||"film");
  const id=Number(form.get("id"))||Math.max(Date.now(),...entries.map(e=>e.id+1));const existing=entries.find(e=>e.id===id);
  let entry;
  try{entry=normalizeEntries([{id,type,...Object.fromEntries(["title","subtitle","creator","releaseYear","rating","loggedDate","summary","note","tags"].map(key=>[key,String(form.get(key)||"").trim()])),
    platform:type==="game"?String(form.get("platform")||"").trim():"",status:type==="game"?String(form.get("status")||""):"",hours:type==="game"?String(form.get("hours")||""):"",
    favorite:form.get("favorite")==="on",accent:existing?.accent||accentNames[Math.floor(Math.random()*accentNames.length)],image:pendingImage,coverKey:existing?.coverKey}])[0];
  }catch{const error=$("#form-error");error.textContent="请检查作品名、创作者、日期和年份；评分为 0—10，时长不能为负，均可留空。";error.classList.remove("hidden");return;}
  runStorageTask(async()=>{
    await commitEntries(existing?entries.map(item=>item.id===id?entry:{...item}):[entry,...entries.map(e=>({...e}))]);
    render();formSession++;imageRequest++;hideModal("form");notify(existing?"改好了":"记下来了");
  });
});
$("#entry-image").addEventListener("change",async event=>{
  const file=event.target.files[0];if(!file||busy)return;
  const session=formSession;const request=++imageRequest;const button=$("#save-button");button.disabled=true;
  try{const data=await compressImage(file);if(session!==formSession||request!==imageRequest)return;pendingImage=data;updateImagePreview();notify("图片已加入");}
  catch(error){if(session===formSession&&request===imageRequest)notify(error.message||"图片处理失败");}
  finally{if(session===formSession&&request===imageRequest)button.disabled=false;}
});
$("#remove-image").addEventListener("click",()=>{if(busy)return;imageRequest++;pendingImage="none";$("#entry-image").value="";$("#save-button").disabled=false;updateImagePreview();});
$("#entry-grid").addEventListener("click",event=>{const card=event.target.closest(".entry-card");if(card)openDetail(Number(card.dataset.id));});
$("#entry-grid").addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){const card=event.target.closest(".entry-card");if(card){event.preventDefault();openDetail(Number(card.dataset.id));}}});
$("#detail-modal").addEventListener("click",event=>{
  const action=event.target.dataset.action;if(event.target.dataset.close)closeDetail();
  if(action==="edit"&&!busy){const entry=entries.find(item=>item.id===selectedId);closeDetail();openForm(entry);}
  if(action==="delete"&&!busy){const entry=entries.find(item=>item.id===selectedId);if(entry&&confirm(`删除《${entry.title}》这条记录？`))runStorageTask(async()=>{await commitEntries(entries.filter(item=>item.id!==entry.id).map(e=>({...e})));render();if(selectedId===entry.id)closeDetail();notify("已经删除");});}
});
$("#add-entry").addEventListener("click",()=>openForm());
$$('[data-type]').forEach(button=>button.addEventListener("click",()=>setType(button.dataset.type)));
$('[data-close="form"]').addEventListener("click",closeForm);
$("#form-backdrop").addEventListener("mousedown",event=>{if(event.target===event.currentTarget)closeForm();});
$("#detail-backdrop").addEventListener("mousedown",event=>{if(event.target===event.currentTarget)closeDetail();});
$$('[data-filter]').forEach(button=>button.addEventListener("click",()=>{
  activeFilter=button.dataset.filter;$$('[data-filter]').forEach(item=>{item.classList.toggle("active",item===button);item.setAttribute("aria-pressed",String(item===button));});render();
}));
const searchCache=new WeakMap();
function normalizeSearch(value){return String(value||"").normalize("NFKC").toLowerCase().trim();}
function searchText(entry){if(!searchCache.has(entry))searchCache.set(entry,normalizeSearch([entry.title,entry.subtitle,entry.creator,entry.tags,entry.summary,entry.note,entry.platform,gameStatuses[entry.status]].join(" ")));return searchCache.get(entry);}
let searchTimer;
function scheduleSearch(event){query=event.target.value;clearTimeout(searchTimer);if(!event.isComposing)searchTimer=setTimeout(render,120);}
$("#search").addEventListener("input",scheduleSearch);$("#search").addEventListener("compositionend",scheduleSearch);
$("#sort-button").addEventListener("click",event=>{activeSort=activeSort==="recent"?"rating":"recent";event.currentTarget.textContent=activeSort==="recent"?"最近记录 ↓":"评分最高 ↓";render();});
$("#export-data").addEventListener("click",()=>runStorageTask(async()=>{
  if(storageIssue){if(storedSnapshot===null)throw new Error("浏览器暂时无法读取存档，请刷新重试");downloadJSON(storedSnapshot,`存档点-原始数据-${localDate()}.json`);notify("原始数据已导出");return;}
  const snapshot=entries.map(e=>({...e}));const seeds=[...appliedSeeds];const exportedEntries=await exportableEntries(snapshot);
  downloadJSON({version:3,seedVersion:SEED_VERSION,appliedSeeds:seeds,exportedAt:new Date().toISOString(),entries:exportedEntries},`存档点-备份-${localDate()}.json`);notify("备份已导出");
}));
$("#import-data").addEventListener("change",event=>{
  const file=event.target.files[0];event.target.value="";if(!file)return;
  runStorageTask(async()=>{
    let data;try{data=JSON.parse(await file.text());}catch{throw new Error("这个文件不是有效的 JSON 备份");}
    const next=normalizeEntries(Array.isArray(data)?data:data?.entries,{external:true,repairIds:Array.isArray(data)||[1,2].includes(data?.version)});
    if(data.version!=null&&![1,2,3].includes(data.version))throw new Error("暂不支持这个备份版本");
    if(data.appliedSeeds!=null&&(!Array.isArray(data.appliedSeeds)||!data.appliedSeeds.every(Number.isSafeInteger)))throw new Error("备份的迁移信息不完整");
    if(!confirm(`导入 ${next.length} 条记录并覆盖当前内容？`))return;
    await commitEntries(next,{restore:true,seeds:[...new Set([...(data.appliedSeeds||[]),...seedEntries.map(e=>e.id)])]});
    $("#storage-warning").classList.add("hidden");render();notify("备份已导入");
  });
});
$("#choose-image").addEventListener("click",()=>{if(!busy)$("#entry-image").click();});
$("#choose-backup").addEventListener("click",()=>{if(!busy)$("#import-data").click();});
function showModal(kind,focus){
  if(!currentModal){returnFocus=document.activeElement;returnFocusId=returnFocus?.closest(".entry-card")?.dataset.id||null;}
  currentModal=kind;$("#"+kind+"-backdrop").classList.remove("hidden");
  $$("#top > header, #top > section, #top > footer").forEach(element=>element.inert=true);
  document.body.classList.add("modal-open");focus?.focus();
}
function hideModal(kind){
  $("#"+kind+"-backdrop").classList.add("hidden");if(currentModal!==kind)return;
  currentModal=null;$$("#top > header, #top > section, #top > footer").forEach(element=>element.inert=false);
  document.body.classList.remove("modal-open");
  const target=returnFocus?.isConnected?returnFocus:returnFocusId?$('.entry-card[data-id="'+returnFocusId+'"]'):null;
  (target||$("#add-entry")).focus();
}
document.addEventListener("keydown",event=>{
  if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="k"){event.preventDefault();if(!currentModal)$("#search").focus();}
  if(!currentModal)return;
  if(event.key==="Escape"){if(currentModal==="form")closeForm();else closeDetail();}
  if(event.key==="Tab"){
    const items=[...$("#"+currentModal+"-backdrop").querySelectorAll('button:not(:disabled),input:not([type="hidden"]):not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(e=>e.getClientRects().length);
    if(!items.length){event.preventDefault();return;}const first=items[0],last=items.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
});
render();
const imageStorageReady=initializeImageStorage();
