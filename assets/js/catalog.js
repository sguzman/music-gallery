const state = { q:"", category:"", era:"", sourceMedium:"", difficulty:"", meter:"", composer:"", maxFret:"", timingConfidence:"", sort:"title" };
let catalog = [];

const $ = s => document.querySelector(s);
const norm = v => String(v ?? "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu,"");

function unique(path){
  const values = new Set();
  catalog.forEach(song=>{
    let v = song[path];
    if(Array.isArray(v)) v.forEach(x=>values.add(x));
    else if(v !== null && v !== undefined && v !== "") values.add(v);
  });
  return [...values].sort((a,b)=>String(a).localeCompare(String(b)));
}
function fillSelect(id, values, label){
  const el=$(id);
  el.innerHTML=`<option value="">All ${label}</option>` + values.map(v=>`<option value="${String(v).replaceAll('"','&quot;')}">${v}</option>`).join("");
}
function passes(song){
  if(state.q){
    const q = norm(state.q);
    if(!norm(song.searchText).includes(q)) return false;
  }
  for(const key of ["category","era","sourceMedium","difficulty","meter","composer","timingConfidence"]){
    if(state[key]){
      const value = key==="difficulty" ? song.difficulty.label : song[key];
      if(String(value)!==String(state[key])) return false;
    }
  }
  if(state.maxFret && Number(song.maxFret) > Number(state.maxFret)) return false;
  return true;
}
function sortSongs(items){
  const copy=[...items];
  if(state.sort==="composer") copy.sort((a,b)=>a.composer.localeCompare(b.composer)||a.displayTitle.localeCompare(b.displayTitle));
  else if(state.sort==="difficulty") copy.sort((a,b)=>a.difficulty.rating-b.difficulty.rating||a.maxFret-b.maxFret);
  else if(state.sort==="tempo") copy.sort((a,b)=>a.defaultBpm-b.defaultBpm);
  else if(state.sort==="maxFret") copy.sort((a,b)=>a.maxFret-b.maxFret);
  else copy.sort((a,b)=>a.displayTitle.localeCompare(b.displayTitle));
  return copy;
}
function render(){
  const filtered=sortSongs(catalog.filter(passes));
  $("#resultCount").textContent=`${filtered.length} of ${catalog.length} songs`;
  const host=$("#songGrid");
  if(!filtered.length){
    host.innerHTML=`<div class="card empty" style="grid-column:1/-1">No songs match those filters. Try clearing one or searching a broader term.</div>`;
    return;
  }
  host.innerHTML=filtered.map(song=>{
    const tags=[...song.moods.slice(0,2),...song.genres.slice(0,1)];
    return `<a class="song-card" href="${song.href}" style="--card-accent:${song.accent}">
      <div class="kicker">${song.category} · ${song.era}</div>
      <h2>${song.displayTitle}</h2>
      <div class="composer">${song.composer}${song.franchise?` · ${song.franchise}`:""}</div>
      <p>${song.description}</p>
      <div class="card-stats">
        <span class="stat">${song.difficulty.label}</span>
        <span class="stat">${song.meter}</span>
        <span class="stat">${song.defaultBpm} BPM</span>
        <span class="stat">max fret ${song.maxFret}</span>
        <span class="stat">timing ${song.timingConfidence}</span>
      </div>
      <div class="card-tags">${tags.map(t=>`<span>#${t.replaceAll(" ","-")}</span>`).join("")}</div>
    </a>`;
  }).join("");
}
function bind(){
  $("#q").addEventListener("input",e=>{state.q=e.target.value;render();});
  ["category","era","sourceMedium","difficulty","meter","composer","timingConfidence","maxFret","sort"].forEach(key=>{
    $("#"+key).addEventListener("change",e=>{state[key]=e.target.value;render();});
  });
  $("#clear").addEventListener("click",()=>{
    Object.assign(state,{q:"",category:"",era:"",sourceMedium:"",difficulty:"",meter:"",composer:"",maxFret:"",timingConfidence:"",sort:"title"});
    $("#q").value="";
    document.querySelectorAll(".filters select").forEach(s=>s.value="");
    $("#sort").value="title";
    render();
  });
}
async function init(){
  const data=await fetch("./data/catalog.json").then(r=>r.json());
  catalog=data.songs;
  fillSelect("#category",unique("category"),"categories");
  fillSelect("#era",unique("era"),"eras");
  fillSelect("#sourceMedium",unique("sourceMedium"),"sources");
  fillSelect("#difficulty",[...new Set(catalog.map(s=>s.difficulty.label))].sort(),"difficulty levels");
  fillSelect("#meter",unique("meter"),"meters");
  fillSelect("#composer",unique("composer"),"composers");
  fillSelect("#timingConfidence",unique("timingConfidence"),"timing confidence");
  bind(); render();
}
init().catch(err=>{
  console.error(err);
  $("#songGrid").innerHTML=`<div class="card empty">Could not load the catalog JSON.</div>`;
});
