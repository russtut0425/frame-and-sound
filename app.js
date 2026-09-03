const STORAGE_KEY = "frame-and-sound-entries-v1";
const SEED_MIGRATION_KEY = "frame-and-sound-seed-version";
const IMAGE_DB_NAME = "frame-and-sound-images";
const IMAGE_STORE_NAME = "images";
const SEED_VERSION = 5;
const accents = {violet:"#8d6df1",gold:"#f0b847",red:"#d94a42",blue:"#5a8ccc",amber:"#b86f3e",green:"#5f8e75"};
const accentNames = Object.keys(accents);
const seedEntries = [
  {id:1,type:"film",title:"穆赫兰道",subtitle:"Mulholland Drive",creator:"大卫·林奇",releaseYear:2001,rating:9.6,loggedDate:"2026-08-18",summary:"梦不是谜底，而是欲望替自己搭起的布景。",note:"最迷人的不是反转，而是醒来后，梦里那些温柔细节突然全部变成证词。",tags:"梦境,身份,洛杉矶",favorite:true,accent:"violet"},
  {id:2,type:"album",title:"Discovery",subtitle:"Daft Punk",creator:"Daft Punk",releaseYear:2001,rating:9.5,loggedDate:"2026-08-16",summary:"流行、机器与童年记忆，被做成一场不会褪色的太空舞会。",note:"每首歌都能独立成立，但连起来又是一整个世界。技术从来没有抢走情绪。",tags:"French house,电子,回听",favorite:true,accent:"gold"},
  {id:3,type:"film",title:"出租车司机",subtitle:"Taxi Driver",creator:"马丁·斯科塞斯",releaseYear:1976,rating:9.2,loggedDate:"2026-08-11",summary:"孤独久了，人会把自己的病当成世界的病。",note:"纽约不是背景，是特拉维斯精神状态的外化：潮湿、黏腻、愤怒又无处可去。",tags:"孤独,城市,人物",favorite:true,accent:"red"},
  {id:4,type:"album",title:"We Will Always Love You",subtitle:"The Avalanches",creator:"The Avalanches",releaseYear:2020,rating:9.3,loggedDate:"2026-08-08",summary:"像把已经消失的声音送进宇宙，让它们继续彼此相爱。",note:"采样不是炫技，而是记忆的物理形态。温柔，但背后一直有死亡的阴影。",tags:"采样,宇宙,记忆",favorite:true,accent:"blue"},
  {id:5,type:"film",title:"花样年华",subtitle:"In the Mood for Love",creator:"王家卫",releaseYear:2000,rating:7.8,loggedDate:"2026-08-03",summary:"真正留下来的，是两个人始终没有做出的事。",note:"重复的走廊、楼梯和音乐把时间困住。留白有效，但情绪距离也比预想中更远。",tags:"留白,时间,欲望",favorite:false,accent:"amber"},
  {id:6,type:"album",title:"The Age of Adz",subtitle:"Sufjan Stevens",creator:"Sufjan Stevens",releaseYear:2010,rating:8.7,loggedDate:"2026-07-31",summary:"电子噪点包住一颗过度裸露的心。",note:"复杂并不是目的。那些失控的编排，最终都指向一种无法体面表达的脆弱。",tags:"电子,私人,失控",favorite:true,accent:"green"},
  ...(window.albumSeedEntries||[])
];

let storageMigrationNeeded = false;
let entries = loadEntries();
let activeFilter = "all";
let activeSort = "recent";
let query = "";
let selectedId = null;
let pendingImage = "";
const runtimeImageURLs = new Map();
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

function escapeHTML(value=""){return String(value).replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[char]);}
function entryIdentity(entry){return [entry.type,entry.title,entry.creator].map(value=>String(value||"").trim().toLowerCase()).join("|");}
function loadEntries(){
  try{
    const stored=JSON.parse(localStorage.getItem(STORAGE_KEY));
    if(Array.isArray(stored)){
      const appliedVersion=Number(localStorage.getItem(SEED_MIGRATION_KEY)||0);
      const known=new Set(stored.map(entryIdentity));
      const additions=appliedVersion<SEED_VERSION?seedEntries.filter(entry=>!known.has(entryIdentity(entry))):[];
      const merged=[...additions,...stored];
      storageMigrationNeeded=additions.length>0||merged.some(entry=>isDataImage(entry.image));
      return merged;
    }
  }catch{}
  storageMigrationNeeded=true;
  return structuredClone(seedEntries);
}
function saveEntries(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(entries));localStorage.setItem(SEED_MIGRATION_KEY,String(SEED_VERSION));return true;}catch{notify("记录保存失败，请先导出备份");return false;}}
function tagsOf(entry){return String(entry.tags||"").split(/[,，]/).map(tag=>tag.trim()).filter(Boolean);}
function ratingOf(entry){if(entry?.rating===""||entry?.rating==null)return null;const rating=Number(entry.rating);return Number.isFinite(rating)?rating:null;}
function ratingLabel(entry){const rating=ratingOf(entry);return rating===null?"—":rating.toFixed(1);}
function notify(message){const toast=$("#toast");toast.textContent=message;toast.classList.remove("hidden");clearTimeout(notify.timer);notify.timer=setTimeout(()=>toast.classList.add("hidden"),2200);}
function isDataImage(value){return /^data:image\/(?:jpeg|png|webp);base64,/i.test(String(value||""));}
function isStoredImage(value){return /^idb:[a-z0-9._-]+$/i.test(String(value||""));}
function imageRef(id){return `idb:${String(id)}`;}
function validFileImage(value){return /^covers\/[a-z0-9._-]+\.(?:jpe?g|png|webp)$/i.test(String(value||""));}
function imageOf(entry){
  const uploaded=typeof entry?.image==="string"?entry.image:"";
  const automatic=window.albumCoverMap?.[entryIdentity(entry)]||"";
  if(isDataImage(uploaded))return uploaded;
  if(isStoredImage(uploaded))return runtimeImageURLs.get(uploaded)||(validFileImage(automatic)?automatic:"");
  if(validFileImage(uploaded))return uploaded;
  return validFileImage(automatic)?automatic:"";
}

function openImageDB(){
  return new Promise((resolve,reject)=>{const request=indexedDB.open(IMAGE_DB_NAME,1);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(IMAGE_STORE_NAME))db.createObjectStore(IMAGE_STORE_NAME);};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error("图片存储不可用"));});
}
async function writeStoredImage(ref,data){const db=await openImageDB();return new Promise((resolve,reject)=>{const transaction=db.transaction(IMAGE_STORE_NAME,"readwrite");transaction.objectStore(IMAGE_STORE_NAME).put(data,ref);transaction.oncomplete=()=>{db.close();resolve();};transaction.onerror=()=>{db.close();reject(transaction.error||new Error("图片存储失败"));};});}
async function readStoredImage(ref){const db=await openImageDB();return new Promise((resolve,reject)=>{const request=db.transaction(IMAGE_STORE_NAME,"readonly").objectStore(IMAGE_STORE_NAME).get(ref);request.onsuccess=()=>{db.close();resolve(request.result||"");};request.onerror=()=>{db.close();reject(request.error||new Error("图片读取失败"));};});}
async function deleteStoredImage(ref){if(!isStoredImage(ref))return;const db=await openImageDB();return new Promise((resolve,reject)=>{const transaction=db.transaction(IMAGE_STORE_NAME,"readwrite");transaction.objectStore(IMAGE_STORE_NAME).delete(ref);transaction.oncomplete=()=>{db.close();runtimeImageURLs.delete(ref);resolve();};transaction.onerror=()=>{db.close();reject(transaction.error||new Error("图片删除失败"));};});}
async function initializeImageStorage(){
  try{
    for(const entry of entries){
      if(isDataImage(entry.image)){const ref=imageRef(entry.id);await writeStoredImage(ref,entry.image);runtimeImageURLs.set(ref,entry.image);entry.image=ref;storageMigrationNeeded=true;}
      else if(isStoredImage(entry.image)){const data=await readStoredImage(entry.image);if(data)runtimeImageURLs.set(entry.image,data);}
    }
    if(storageMigrationNeeded)saveEntries();
    render();
  }catch{notify("旧图片搬家失败，先别清理浏览器数据");}
}
async function storeEntryImage(entry,previousImage=""){
  if(isDataImage(entry.image)){const ref=imageRef(entry.id);await writeStoredImage(ref,entry.image);runtimeImageURLs.set(ref,entry.image);entry.image=ref;}
  if(isStoredImage(previousImage)&&previousImage!==entry.image)await deleteStoredImage(previousImage);
}
async function exportableEntries(){return Promise.all(entries.map(async entry=>{if(!isStoredImage(entry.image))return {...entry};const image=runtimeImageURLs.get(entry.image)||await readStoredImage(entry.image);return {...entry,image:image||""};}));}
async function externalizeImportedImages(list){for(const entry of list){if(isDataImage(entry.image)){const ref=imageRef(entry.id);await writeStoredImage(ref,entry.image);runtimeImageURLs.set(ref,entry.image);entry.image=ref;}}return list;}

function compressImage(file){
  return new Promise((resolve,reject)=>{
    if(!file.type.startsWith("image/")||file.size>15*1024*1024){reject(new Error("请选择 15MB 以内的 JPG、PNG 或 WebP 图片"));return;}
    const url=URL.createObjectURL(file);const image=new Image();
    image.onload=()=>{URL.revokeObjectURL(url);const maxEdge=1200;const scale=Math.min(1,maxEdge/Math.max(image.naturalWidth,image.naturalHeight));const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));const context=canvas.getContext("2d");context.drawImage(image,0,0,canvas.width,canvas.height);let output=canvas.toDataURL("image/webp",.78);if(!output.startsWith("data:image/webp"))output=canvas.toDataURL("image/jpeg",.78);resolve(output);};
    image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("这张图片读取失败"));};image.src=url;
  });
}

function updateImagePreview(){
  const preview=$("#image-preview");const image=imageOf({image:pendingImage});preview.classList.toggle("has-image",Boolean(image));preview.innerHTML=image?`<img src="${image}" alt="图片预览">`:`<span>暂无图片</span>`;$("#remove-image").disabled=!image;
}

function render(){
  const films=entries.filter(e=>e.type==="film");const albums=entries.filter(e=>e.type==="album");const rated=entries.map(ratingOf).filter(rating=>rating!==null);const average=rated.length?rated.reduce((sum,rating)=>sum+rating,0)/rated.length:null;
  $("#film-count").textContent=String(films.length).padStart(2,"0");$("#album-count").textContent=String(albums.length).padStart(2,"0");$("#average-rating").textContent=average===null?"—":average.toFixed(1);$("#all-tab-count").textContent=entries.length;$("#film-tab-count").textContent=films.length;$("#album-tab-count").textContent=albums.length;
  const normalized=query.trim().toLowerCase();
  const shown=entries.filter(e=>activeFilter==="all"||e.type===activeFilter).filter(e=>!normalized||[e.title,e.subtitle,e.creator,e.tags,e.summary].join(" ").toLowerCase().includes(normalized)).sort((a,b)=>{if(activeSort!=="rating")return b.loggedDate.localeCompare(a.loggedDate);const aRating=ratingOf(a);const bRating=ratingOf(b);if(aRating===null&&bRating===null)return b.loggedDate.localeCompare(a.loggedDate);if(aRating===null)return 1;if(bRating===null)return -1;return bRating-aRating;});
  $("#entry-grid").innerHTML=shown.length?shown.map((entry,index)=>{
    const image=imageOf(entry);const art=image?`<img class="entry-image" src="${image}" alt="${escapeHTML(entry.title)}" loading="lazy" decoding="async">`:`<div class="art-shape ${entry.type}"><span>${entry.type==="film"?"◐":"◉"}</span></div>`;
    return `<article class="entry-card" data-id="${entry.id}" tabindex="0" style="--accent:${accents[entry.accent]||accents.red}"><div class="card-art ${image?`has-image ${entry.type}-image`:""}" data-index="${String(index+1).padStart(2,"0")}">${art}<span class="type-badge">${entry.type==="film"?"FILM":"ALBUM"}</span>${entry.favorite?'<span class="favorite" aria-label="心爱作品">♥</span>':""}</div><div class="card-body"><div class="card-title-row"><div><h2>${escapeHTML(entry.title)}</h2><p>${escapeHTML(entry.subtitle)}</p></div><strong>${ratingLabel(entry)}</strong></div><p class="creator">${escapeHTML(entry.creator)}${entry.releaseYear?` · ${entry.releaseYear}`:""}</p><blockquote>“${escapeHTML(entry.summary)}”</blockquote><div class="tag-row">${tagsOf(entry).slice(0,3).map(tag=>`<span>#${escapeHTML(tag)}</span>`).join("")}</div></div></article>`;
  }).join(""):'<div class="no-results"><span>∅</span><p>没有找到。也可能它还没被你记下来。</p></div>';
}

function openForm(entry=null){
  const form=$("#entry-form");form.reset();form.elements.loggedDate.value=new Date().toISOString().slice(0,10);form.elements.rating.value="";form.elements.type.value="film";form.elements.id.value="";pendingImage=typeof entry?.image==="string"?entry.image:"";$("#entry-image").value="";updateImagePreview();
  if(entry){Object.entries(entry).forEach(([key,value])=>{if(form.elements[key]){if(form.elements[key].type==="checkbox")form.elements[key].checked=Boolean(value);else form.elements[key].value=value??"";}});$("#form-eyebrow").textContent="EDIT THE MEMORY";$("#form-title").textContent="记忆变了，就改掉。";$("#save-button").textContent="保存修改";}else{$("#form-eyebrow").textContent="ADD TO THE ARCHIVE";$("#form-title").textContent="刚看完，还是后来想起？";$("#save-button").textContent="收进档案";}
  setType(form.elements.type.value);$("#form-error").classList.add("hidden");$("#form-backdrop").classList.remove("hidden");setTimeout(()=>form.elements.title.focus(),30);
}
function setType(type){$("#entry-form").elements.type.value=type;$$('[data-type]').forEach(button=>button.classList.toggle("active",button.dataset.type===type));$("#creator-label").textContent=type==="film"?"导演":"音乐人";$("#image-field-label").textContent=type==="film"?"剧照（可选）":"专辑封面（可选）";}
function closeForm(){$("#form-backdrop").classList.add("hidden");}
function openDetail(id){const entry=entries.find(item=>item.id===id);if(!entry)return;selectedId=id;const modal=$("#detail-modal");const image=imageOf(entry);const rating=ratingOf(entry);const score=rating===null?'—<small>待评分</small>':`${rating.toFixed(1)}<small>/ 10</small>`;modal.style.setProperty("--accent",accents[entry.accent]||accents.red);modal.innerHTML=`<button class="close-button" data-close="detail" aria-label="关闭">×</button><span class="type-badge">${entry.type==="film"?"FILM NOTE":"LISTENING NOTE"}</span><div class="detail-score">${score}</div>${image?`<div class="detail-image ${entry.type}"><img src="${image}" alt="${escapeHTML(entry.title)}" decoding="async"></div>`:""}<h2>${escapeHTML(entry.title)}</h2><p class="detail-subtitle">${escapeHTML(entry.subtitle)}</p><p class="creator">${escapeHTML(entry.creator)}${entry.releaseYear?` · ${entry.releaseYear}`:""}</p><blockquote>“${escapeHTML(entry.summary)}”</blockquote><div class="detail-note"><span>留下来的部分</span><p>${escapeHTML(entry.note||"还没写下更多。").replace(/\n/g,"<br>")}</p></div><div class="detail-bottom"><div class="tag-row">${tagsOf(entry).map(tag=>`<span>#${escapeHTML(tag)}</span>`).join("")}</div><time>${escapeHTML(entry.loggedDate)}</time></div><div class="detail-actions"><button data-action="edit">编辑记录</button><button class="danger" data-action="delete">删除这条记录</button></div>`;$("#detail-backdrop").classList.remove("hidden");}
function closeDetail(){$("#detail-backdrop").classList.add("hidden");selectedId=null;}

$("#entry-form").addEventListener("submit",async event=>{event.preventDefault();const form=new FormData(event.currentTarget);const title=String(form.get("title")||"").trim();const creator=String(form.get("creator")||"").trim();const ratingText=String(form.get("rating")||"").trim();const rating=ratingText===""?null:Number(ratingText);if(!title||!creator||(rating!==null&&(!Number.isFinite(rating)||rating<0||rating>10))){const error=$("#form-error");error.textContent="作品名和作者需要填好；评分可以留空，填写时需在 0—10 分之间。";error.classList.remove("hidden");return;}const id=Number(form.get("id"))||Date.now();const existing=entries.find(item=>item.id===id);const previousEntries=entries;const entry={id,type:form.get("type"),title,subtitle:String(form.get("subtitle")||"").trim(),creator,releaseYear:form.get("releaseYear")?Number(form.get("releaseYear")):null,rating,loggedDate:String(form.get("loggedDate")),summary:String(form.get("summary")||"").trim(),note:String(form.get("note")||"").trim(),tags:String(form.get("tags")||"").trim(),favorite:form.get("favorite")==="on",accent:existing?.accent||accentNames[Math.floor(Math.random()*accentNames.length)],image:pendingImage};const button=$("#save-button");button.disabled=true;button.textContent="正在保存…";try{await storeEntryImage(entry,existing?.image||"");entries=existing?entries.map(item=>item.id===id?entry:item):[entry,...entries];if(!saveEntries()){entries=previousEntries;return;}render();closeForm();notify(existing?"改好了":"记下来了");}catch{entries=previousEntries;notify("图片保存失败，再试一次");}finally{button.disabled=false;button.textContent=existing?"保存修改":"收进档案";}});
$("#entry-image").addEventListener("change",async event=>{const file=event.target.files[0];if(!file)return;const button=$("#save-button");button.disabled=true;button.textContent="正在处理图片…";try{pendingImage=await compressImage(file);updateImagePreview();notify("图片已加入");}catch(error){notify(error.message||"图片处理失败");event.target.value="";}finally{button.disabled=false;button.textContent=$("#entry-form").elements.id.value?"保存修改":"收进档案";}});
$("#remove-image").addEventListener("click",()=>{pendingImage="";$("#entry-image").value="";updateImagePreview();});
$("#entry-grid").addEventListener("click",event=>{const card=event.target.closest(".entry-card");if(card)openDetail(Number(card.dataset.id));});
$("#entry-grid").addEventListener("keydown",event=>{if(event.key==="Enter"){const card=event.target.closest(".entry-card");if(card)openDetail(Number(card.dataset.id));}});
$("#detail-modal").addEventListener("click",async event=>{const action=event.target.dataset.action;if(event.target.dataset.close)closeDetail();if(action==="edit"){const entry=entries.find(item=>item.id===selectedId);closeDetail();openForm(entry);}if(action==="delete"){const entry=entries.find(item=>item.id===selectedId);if(entry&&confirm(`删除《${entry.title}》这条记录？`)){const previousEntries=entries;entries=entries.filter(item=>item.id!==selectedId);if(!saveEntries()){entries=previousEntries;return;}try{await deleteStoredImage(entry.image);}catch{}render();closeDetail();notify("已经删除");}}});
$("#add-entry").addEventListener("click",()=>openForm());$$('[data-type]').forEach(button=>button.addEventListener("click",()=>setType(button.dataset.type)));$('[data-close="form"]').addEventListener("click",closeForm);$("#form-backdrop").addEventListener("mousedown",event=>{if(event.target===event.currentTarget)closeForm();});$("#detail-backdrop").addEventListener("mousedown",event=>{if(event.target===event.currentTarget)closeDetail();});
$$('[data-filter]').forEach(button=>button.addEventListener("click",()=>{activeFilter=button.dataset.filter;$$('[data-filter]').forEach(item=>item.classList.toggle("active",item===button));render();}));
$("#search").addEventListener("input",event=>{query=event.target.value;render();});$("#sort-button").addEventListener("click",event=>{activeSort=activeSort==="recent"?"rating":"recent";event.currentTarget.textContent=activeSort==="recent"?"最近记录 ↓":"评分最高 ↓";render();});
$("#export-data").addEventListener("click",async()=>{try{const exportedEntries=await exportableEntries();const blob=new Blob([JSON.stringify({version:2,exportedAt:new Date().toISOString(),entries:exportedEntries},null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=`帧与声-备份-${new Date().toISOString().slice(0,10)}.json`;link.click();URL.revokeObjectURL(url);notify("备份已导出");}catch{notify("备份导出失败");}});
$("#import-data").addEventListener("change",async event=>{const file=event.target.files[0];if(!file)return;try{const data=JSON.parse(await file.text());if(!Array.isArray(data.entries))throw new Error();if(!confirm(`导入 ${data.entries.length} 条记录并覆盖当前内容？`))return;const previousEntries=entries;const oldImageRefs=new Set(previousEntries.map(entry=>entry.image).filter(isStoredImage));entries=await externalizeImportedImages(data.entries);if(!saveEntries()){entries=previousEntries;return;}const newImageRefs=new Set(entries.map(entry=>entry.image).filter(isStoredImage));for(const ref of oldImageRefs)if(!newImageRefs.has(ref))deleteStoredImage(ref).catch(()=>{});render();notify("备份已导入");}catch{notify("这个备份文件不对");}event.target.value="";});
document.addEventListener("keydown",event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="k"){event.preventDefault();$("#search").focus();}if(event.key==="Escape"){closeForm();closeDetail();}});
render();
initializeImageStorage();
