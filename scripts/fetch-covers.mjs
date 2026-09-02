import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

global.window = globalThis;
await import(`${pathToFileURL(resolve("album-seeds.js")).href}?v=${Date.now()}`);

const originalAlbums = [
  {id:2,type:"album",title:"Discovery",creator:"Daft Punk",releaseYear:2001},
  {id:4,type:"album",title:"We Will Always Love You",creator:"The Avalanches",releaseYear:2020},
  {id:6,type:"album",title:"The Age of Adz",creator:"Sufjan Stevens",releaseYear:2010}
];
const albums = [...originalAlbums, ...globalThis.albumSeedEntries];
const countriesFor = entry => /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(entry.title + entry.creator)
  ? ["CN","TW","JP","US"]
  : ["US","GB","JP","CN"];
const artistAliases = {
  "坂本龙一":["Ryuichi Sakamoto","坂本龍一"],
  "吉村弘":["Hiroshi Yoshimura"],
  "蛋堡":["Soft Lipa"],
  "惘闻":["Wang Wen"],
  "方大同":["Khalil Fong"],
  "陶喆":["David Tao"],
  "小老虎":["J-Fever"],
  "小老虎J-Fever":["J-Fever"],
  "椎名林檎":["Sheena Ringo"],
  "ずっと真夜中でいいのに。":["ZUTOMAYO"],
  "万能青年旅店":["Omnipotent Youth Society"],
  "陈绮贞":["Cheer Chen"],
  "王菲":["Faye Wong"],
  "卢广仲":["Crowd Lu"],
  "罗大佑":["Lo Ta-yu"],
  "张雨生":["Tom Chang"],
  "崔健":["Cui Jian"],
  "宋岳庭":["Shawn Sung"],
  "能登麻美子":["Mamiko Noto"],
  "渋さ知らズ":["Shibusashirazu"]
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const identityOf = entry => [entry.type,entry.title,entry.creator].map(value => String(value||"").trim().toLowerCase()).join("|");
const normalize = value => String(value||"")
  .normalize("NFKD")
  .replace(/\p{M}/gu,"")
  .toLowerCase()
  .replace(/\b(?:deluxe|expanded|remaster(?:ed)?|anniversary|bonus|edition|version)\b/gu," ")
  .replace(/[^\p{L}\p{N}]+/gu," ")
  .replace(/\s+/g," ")
  .trim();

function levenshtein(a,b){
  if(!a.length)return b.length;
  if(!b.length)return a.length;
  const row=Array.from({length:b.length+1},(_,index)=>index);
  for(let i=1;i<=a.length;i++){
    let previous=row[0];
    row[0]=i;
    for(let j=1;j<=b.length;j++){
      const old=row[j];
      row[j]=Math.min(row[j]+1,row[j-1]+1,previous+(a[i-1]===b[j-1]?0:1));
      previous=old;
    }
  }
  return row[b.length];
}

function similarity(a,b){
  const left=normalize(a);
  const right=normalize(b);
  if(!left||!right)return 0;
  if(left===right)return 1;
  const longer=Math.max(left.length,right.length);
  let score=1-levenshtein(left,right)/longer;
  if((left.includes(right)||right.includes(left))&&Math.min(left.length,right.length)>=5)score=Math.max(score,.94);
  return score;
}

function scoreCandidate(entry,candidate){
  const titleScore=similarity(entry.title,candidate.collectionName);
  const artistNames=[entry.creator,...(artistAliases[entry.creator]||[])];
  const artistScore=Math.max(...artistNames.map(name=>similarity(name,candidate.artistName)));
  const candidateYear=Number(String(candidate.releaseDate||"").slice(0,4));
  const yearDistance=Number.isFinite(candidateYear)&&entry.releaseYear?Math.abs(candidateYear-entry.releaseYear):99;
  const yearScore=yearDistance===0?1:yearDistance===1?.75:yearDistance<=3?.35:0;
  const singleWord=normalize(entry.title).split(" ").length===1;
  const eligible=titleScore>=.79&&(artistScore>=.34||(!singleWord&&titleScore>=.98&&yearScore>=.75));
  return {eligible,titleScore,artistScore,yearScore,total:titleScore*.7+artistScore*.24+yearScore*.06};
}

async function requestJson(url,attempt=1){
  const response=await fetch(url,{headers:{"User-Agent":"frame-and-sound-cover-archiver/1.0"}});
  if((response.status===429||response.status>=500)&&attempt<4){
    await sleep(attempt*8000);
    return requestJson(url,attempt+1);
  }
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function findCover(entry){
  let best=null;
  for(const country of countriesFor(entry)){
    const term=encodeURIComponent(`${entry.title} ${entry.creator}`);
    const url=`https://itunes.apple.com/search?term=${term}&media=music&entity=album&limit=25&country=${country}`;
    try{
      const data=await requestJson(url);
      for(const candidate of data.results||[]){
        if(!candidate.artworkUrl100)continue;
        const score=scoreCandidate(entry,candidate);
        if(score.eligible&&(!best||score.total>best.score.total))best={candidate,score,country};
      }
      if(best?.score.total>=.9)break;
    }catch(error){
      console.warn(`search failed: ${entry.title} [${country}] ${error.message}`);
    }
    await sleep(1100);
  }
  return best&&best.score.total>=.72?best:null;
}

async function downloadCover(url,path,attempt=1){
  const largeUrl=url
    .replace(/\/\d+x\d+bb\.(jpg|png)$/i,"/300x300bb.$1")
    .replace(/\/\d+x\d+-\d+\.(jpg|png)$/i,"/300x300bb.$1");
  const response=await fetch(largeUrl,{headers:{"User-Agent":"frame-and-sound-cover-archiver/1.0"}});
  if((response.status===429||response.status>=500)&&attempt<4){
    await sleep(attempt*5000);
    return downloadCover(url,path,attempt+1);
  }
  if(!response.ok)throw new Error(`image HTTP ${response.status}`);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length<1000)throw new Error("image response too small");
  await writeFile(path,bytes);
  return {largeUrl,bytes:bytes.length};
}

await mkdir("covers",{recursive:true});
let prior={covers:{},metadata:{}};
if(existsSync("album-covers.json")){
  try{prior=JSON.parse(await readFile("album-covers.json","utf8"));}catch{}
}
const covers={...(prior.covers||{})};
const metadata={...(prior.metadata||{})};
const unmatched=[];

for(let index=0;index<albums.length;index++){
  const entry=albums[index];
  const identity=identityOf(entry);
  const existingPath=covers[identity];
  if(existingPath&&existsSync(existingPath)){
    console.log(`[${index+1}/${albums.length}] keep ${entry.title}`);
    continue;
  }
  console.log(`[${index+1}/${albums.length}] find ${entry.title} — ${entry.creator}`);
  const match=await findCover(entry);
  if(!match){
    unmatched.push({title:entry.title,creator:entry.creator,releaseYear:entry.releaseYear});
    console.log("  no confident match");
    continue;
  }
  const path=`covers/${entry.id}.jpg`;
  try{
    const saved=await downloadCover(match.candidate.artworkUrl100,path);
    covers[identity]=path;
    metadata[identity]={
      requested:{title:entry.title,creator:entry.creator,releaseYear:entry.releaseYear},
      matched:{
        title:match.candidate.collectionName,
        creator:match.candidate.artistName,
        releaseYear:Number(String(match.candidate.releaseDate||"").slice(0,4))||null,
        collectionId:match.candidate.collectionId,
        country:match.country,
        score:Number(match.score.total.toFixed(3)),
        source:saved.largeUrl
      }
    };
    console.log(`  saved ${path} (${Math.round(saved.bytes/1024)} KB, score ${match.score.total.toFixed(3)})`);
  }catch(error){
    unmatched.push({title:entry.title,creator:entry.creator,releaseYear:entry.releaseYear,error:error.message});
    console.warn(`  download failed: ${error.message}`);
  }
  await sleep(350);
}

const orderedCovers=Object.fromEntries(Object.entries(covers).sort(([a],[b])=>a.localeCompare(b)));
const report={
  generatedAt:new Date().toISOString(),
  source:"Apple iTunes Search API",
  total:albums.length,
  matched:Object.keys(orderedCovers).length,
  unmatched:unmatched.length,
  covers:orderedCovers,
  metadata
};
await writeFile("album-covers.json",JSON.stringify(report,null,2)+"\n");
await writeFile("unmatched-covers.json",JSON.stringify(unmatched,null,2)+"\n");
await writeFile("album-covers.js",`window.albumCoverMap = ${JSON.stringify(orderedCovers,null,2)};\n`);
console.log(`done: ${report.matched}/${report.total} covers, ${report.unmatched} unmatched`);
