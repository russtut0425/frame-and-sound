import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

global.window = globalThis;
await import(`${pathToFileURL(resolve("album-seeds.js")).href}?v=${Date.now()}`);

const originalAlbums = [
  {id:2,type:"album",title:"Discovery",creator:"Daft Punk",releaseYear:2001},
  {id:4,type:"album",title:"We Will Always Love You",creator:"The Avalanches",releaseYear:2020},
  {id:6,type:"album",title:"The Age of Adz",creator:"Sufjan Stevens",releaseYear:2010}
];
const albums=[...originalAlbums,...globalThis.albumSeedEntries];
const identityOf=entry=>[entry.type,entry.title,entry.creator].map(value=>String(value||"").trim().toLowerCase()).join("|");
const byIdentity=new Map(albums.map(entry=>[identityOf(entry),entry]));
const aliases={
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
const wrongIdentities=[
  "album|we will always love you|the avalanches",
  "album|madvillainy|madvillain",
  "album|currents|tame impala",
  "album|vultures 1|¥$ (kanye west & ty dolla $ign)",
  "album|death stranding (songs from the video game)|various artists",
  "album|null & void|ground-zero"
];
const normalize=value=>String(value||"")
  .normalize("NFKD")
  .replace(/\p{M}/gu,"")
  .toLowerCase()
  .replace(/\b(?:deluxe|expanded|remaster(?:ed)?|anniversary|bonus|edition|version|instrumentals?|b sides?|remixes?)\b/gu," ")
  .replace(/[^\p{L}\p{N}]+/gu," ")
  .replace(/\s+/g," ")
  .trim();

function levenshtein(a,b){
  if(!a.length)return b.length;
  if(!b.length)return a.length;
  const row=Array.from({length:b.length+1},(_,index)=>index);
  for(let i=1;i<=a.length;i++){
    let previous=row[0];row[0]=i;
    for(let j=1;j<=b.length;j++){
      const old=row[j];
      row[j]=Math.min(row[j]+1,row[j-1]+1,previous+(a[i-1]===b[j-1]?0:1));
      previous=old;
    }
  }
  return row[b.length];
}
function similarity(a,b){
  const left=normalize(a),right=normalize(b);
  if(!left||!right)return 0;
  if(left===right)return 1;
  let score=1-levenshtein(left,right)/Math.max(left.length,right.length);
  if((left.includes(right)||right.includes(left))&&Math.min(left.length,right.length)>=5)score=Math.max(score,.94);
  return score;
}
function artistText(group){
  return (group["artist-credit"]||[]).map(credit=>credit.artist?.name||credit.name||"").filter(Boolean).join(" & ");
}
function scoreGroup(entry,group){
  const titleScore=similarity(entry.title,group.title);
  const names=[entry.creator,...(aliases[entry.creator]||[])];
  const artistScore=Math.max(...names.map(name=>similarity(name,artistText(group))));
  const year=Number(String(group["first-release-date"]||"").slice(0,4));
  const distance=Number.isFinite(year)&&entry.releaseYear?Math.abs(year-entry.releaseYear):99;
  const yearScore=distance===0?1:distance===1?.8:distance<=3?.35:0;
  const typeOk=!group["primary-type"]||["Album","EP"].includes(group["primary-type"]);
  const eligible=typeOk&&titleScore>=.83&&artistScore>=.28&&(titleScore*.7+artistScore*.24+yearScore*.06)>=.72;
  return {eligible,titleScore,artistScore,yearScore,total:titleScore*.7+artistScore*.24+yearScore*.06,year};
}

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let lastMusicBrainzRequest=0;
async function musicBrainz(query,attempt=1){
  const wait=Math.max(0,1150-(Date.now()-lastMusicBrainzRequest));
  if(wait)await sleep(wait);
  lastMusicBrainzRequest=Date.now();
  const url=`https://musicbrainz.org/ws/2/release-group/?query=${encodeURIComponent(query)}&fmt=json&limit=10`;
  const response=await fetch(url,{headers:{"User-Agent":"frame-and-sound-cover-archive/1.0 (https://github.com/russtut0425/frame-and-sound)","Accept":"application/json"}});
  if((response.status===429||response.status>=500)&&attempt<4){
    await sleep(attempt*5000);
    return musicBrainz(query,attempt+1);
  }
  if(!response.ok)throw new Error(`MusicBrainz HTTP ${response.status}`);
  return response.json();
}
async function findGroup(entry){
  const escapedTitle=entry.title.replace(/"/g,"");
  const escapedCreator=entry.creator.replace(/"/g,"");
  const queries=[
    `releasegroup:"${escapedTitle}" AND artist:"${escapedCreator}"`,
    `releasegroup:"${escapedTitle}"`
  ];
  let best=null;
  for(const query of queries){
    try{
      const data=await musicBrainz(query);
      for(const group of data["release-groups"]||[]){
        const score=scoreGroup(entry,group);
        if(score.eligible&&(!best||score.total>best.score.total))best={group,score};
      }
      if(best?.score.total>=.9)break;
    }catch(error){
      console.warn(`MusicBrainz failed: ${entry.title}: ${error.message}`);
    }
  }
  return best;
}
async function download(groupId,path,attempt=1){
  const url=`https://coverartarchive.org/release-group/${groupId}/front-250`;
  const response=await fetch(url,{headers:{"User-Agent":"frame-and-sound-cover-archive/1.0 (https://github.com/russtut0425/frame-and-sound)"}});
  if((response.status===429||response.status>=500)&&attempt<3){
    await sleep(attempt*4000);
    return download(groupId,path,attempt+1);
  }
  if(!response.ok)throw new Error(`cover HTTP ${response.status}`);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length<1000)throw new Error("cover response too small");
  await writeFile(path,bytes);
  return {url,bytes:bytes.length};
}

await mkdir("covers",{recursive:true});
const report=JSON.parse(await readFile("album-covers.json","utf8"));
const previousUnmatched=JSON.parse(await readFile("unmatched-covers.json","utf8"));
const covers={...(report.covers||{})};
const metadata={...(report.metadata||{})};

for(const identity of wrongIdentities){
  const oldPath=covers[identity];
  if(oldPath&&existsSync(oldPath))await rm(oldPath);
  delete covers[identity];
  delete metadata[identity];
}

const targetIdentities=new Set(wrongIdentities);
for(const item of previousUnmatched){
  const match=albums.find(entry=>entry.title===item.title&&entry.creator===item.creator);
  if(match)targetIdentities.add(identityOf(match));
}
const targets=[...targetIdentities].map(identity=>byIdentity.get(identity)).filter(Boolean);
const unmatched=[];

for(let index=0;index<targets.length;index++){
  const entry=targets[index];
  const identity=identityOf(entry);
  console.log(`[${index+1}/${targets.length}] ${entry.title} — ${entry.creator}`);
  const result=await findGroup(entry);
  if(!result){
    unmatched.push({title:entry.title,creator:entry.creator,releaseYear:entry.releaseYear});
    console.log("  no confident MusicBrainz match");
    continue;
  }
  const path=`covers/${entry.id}.jpg`;
  try{
    const saved=await download(result.group.id,path);
    covers[identity]=path;
    metadata[identity]={
      requested:{title:entry.title,creator:entry.creator,releaseYear:entry.releaseYear},
      matched:{
        title:result.group.title,
        creator:artistText(result.group),
        releaseYear:result.score.year||null,
        releaseGroupId:result.group.id,
        score:Number(result.score.total.toFixed(3)),
        source:saved.url,
        database:"MusicBrainz / Cover Art Archive"
      }
    };
    console.log(`  saved ${path} (${Math.round(saved.bytes/1024)} KB)`);
  }catch(error){
    unmatched.push({title:entry.title,creator:entry.creator,releaseYear:entry.releaseYear,error:error.message});
    console.warn(`  cover unavailable: ${error.message}`);
  }
}

const orderedCovers=Object.fromEntries(Object.entries(covers).sort(([a],[b])=>a.localeCompare(b)));
const finalReport={
  ...report,
  generatedAt:new Date().toISOString(),
  source:["Apple iTunes Search API","MusicBrainz / Cover Art Archive"],
  matched:Object.keys(orderedCovers).length,
  unmatched:unmatched.length,
  covers:orderedCovers,
  metadata
};
await writeFile("album-covers.json",JSON.stringify(finalReport,null,2)+"\n");
await writeFile("unmatched-covers.json",JSON.stringify(unmatched,null,2)+"\n");
await writeFile("album-covers.js",`window.albumCoverMap = ${JSON.stringify(orderedCovers,null,2)};\n`);
console.log(`second pass done: ${finalReport.matched}/${finalReport.total} covers, ${finalReport.unmatched} unmatched`);
