const body=document.body;
const slug=body.dataset.song;
const rootPath=body.dataset.root || "../..";
const $=s=>document.querySelector(s);
const STRING_Y={e:19,B:57,G:95,D:133,A:171,E:209};
const GM_PROGRAM={guitar:25,piano:0,celesta:8};

let song=null, selectedSection=-1, flat=[], cursor=0, playing=false, loop=false, audio=null, timers=[], nodes=[], runId=0;

function safe(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));}
function tempoSecondsPerUnit(){ return 60/Number($("#tempo").value); }
function activeSections(){ return selectedSection===-1 ? song.sections : [song.sections[selectedSection]]; }

function buildFlat(){
  flat=[];
  let global=0;
  activeSections().forEach((section, si)=>{
    section.measures.forEach((m,mi)=>{
      m.events.forEach((e,ei)=>{
        if(e.type==="note"){
          flat.push({section,si,measure:m,mi,event:e,ei,start:global+e.start});
        }
      });
      global+=m.duration;
    });
  });
  cursor=Math.min(cursor,Math.max(0,flat.length-1));
  updateStatus();
}
function renderHero(){
  document.documentElement.style.setProperty("--accent",song.presentation.accent);
  document.title=`${song.identity.displayTitle} — Music Gallery`;
  $("#eyebrow").textContent=`${song.origin.category} · Interactive acoustic melody`;
  $("#title").textContent=song.identity.displayTitle;
  $("#subtitle").textContent=`${song.identity.composer.name}${song.origin.franchise?` · ${song.origin.franchise}`:""} · ${song.presentation.description}`;
  const badges=[
    song.arrangement.tuning.name,
    song.arrangement.difficulty.label,
    song.musical.meter,
    `max fret ${song.stats.maxFret}`,
    `timing ${song.verification.timing.confidence}`,
    "MIDI export"
  ];
  $("#badges").innerHTML=badges.map(b=>`<span class="badge">${safe(b)}</span>`).join("");
  $("#jsonLink").href=`${rootPath}/data/songs/${slug}.json`;
  $("#repoLink").href=`https://github.com/sguzman/music-gallery/blob/main/data/songs/${slug}.json`;
}
function renderControls(){
  $("#tempo").min=song.musical.bpmRange[0]; $("#tempo").max=song.musical.bpmRange[1]; $("#tempo").value=song.musical.defaultBpm;
  $("#tempoOut").textContent=song.musical.defaultBpm; $("#gate").value=song.playback.gatePercent||86; $("#gateOut").textContent=`${$("#gate").value}%`;
  const inst=$("#instrument");
  const labels={guitar:"Steel-string guitar",piano:"Piano",both:"Guitar + piano",celesta:"Celesta","guitar-celesta":"Guitar + celesta","guitar-piano":"Guitar + piano"};
  inst.innerHTML=song.playback.instrumentOptions.map(v=>`<option value="${v}" ${v===song.playback.defaultInstrument?"selected":""}>${labels[v]||v}</option>`).join("");
}
function renderSectionButtons(){
  const host=$("#sectionButtons"); host.innerHTML="";
  const all=document.createElement("button"); all.textContent="All sections"; all.className=selectedSection===-1?"active":"";
  all.onclick=()=>{selectedSection=-1;cursor=0;renderAll();};host.appendChild(all);
  song.sections.forEach((s,i)=>{
    const b=document.createElement("button");b.textContent=s.name;b.className=i===selectedSection?"active":"";
    b.onclick=()=>{selectedSection=i;cursor=0;renderAll();};host.appendChild(b);
  });
}
function renderTabs(){
  const host=$("#tabs");host.innerHTML="";
  activeSections().forEach((section)=>{
    const sec=document.createElement("section");sec.className="section-block";
    const total=section.measures.reduce((a,m)=>a+m.duration,0);
    sec.innerHTML=`<div class="section-head"><h2>${safe(section.name)}</h2><span>${safe(section.description||"")} · ${section.measures.length} groups</span></div>`;
    const scroll=document.createElement("div");scroll.className="tab-scroll";
    const grid=document.createElement("div");grid.className="tab-grid";
    const minWidth=Math.max(760,total*36);grid.style.minWidth=`${minWidth}px`;
    const labels=document.createElement("div");labels.className="string-labels";
    ["e","B","G","D","A","E"].forEach(n=>{const d=document.createElement("div");d.className="string-label";d.textContent=n;labels.appendChild(d);});
    const staff=document.createElement("div");staff.className="staff";
    ["e","B","G","D","A","E"].forEach(n=>{const l=document.createElement("span");l.className="string-line";l.style.top=`${STRING_Y[n]}px`;staff.appendChild(l);});
    let measureStart=0;
    section.measures.forEach((m,mi)=>{
      const left=(measureStart/total)*100;
      const ml=document.createElement("span");ml.className="measure-line";ml.style.left=`${left}%`;staff.appendChild(ml);
      const lab=document.createElement("span");lab.className="measure-label";lab.style.left=`${left}%`;lab.textContent=m.label;staff.appendChild(lab);
      const wholeBeats=Math.floor(m.duration);
      for(let b=1;b<wholeBeats;b++){
        const bl=document.createElement("span");bl.className="beat-line";bl.style.left=`${((measureStart+b)/total)*100}%`;staff.appendChild(bl);
      }
      m.events.forEach((e,ei)=>{
        if(e.type!=="note")return;
        const local = m.duration ? (.055*m.duration + e.start*.89) : e.start;
        const x=((measureStart+local)/total)*100;
        const n=document.createElement("button");n.type="button";n.className=`note ${e.position}${e.anchor?" anchor":""}`;
        n.textContent=e.fret;n.style.left=`${x}%`;n.style.top=`${STRING_Y[e.string]}px`;
        n.dataset.section=section.id;n.dataset.measure=mi;n.dataset.event=ei;
        n.title=`${e.string} string · fret ${e.fret} · ${e.duration} ${song.musical.tempoUnit}`;
        n.onclick=()=>audition(section.id,mi,ei,n);
        staff.appendChild(n);
      });
      measureStart+=m.duration;
    });
    const end=document.createElement("span");end.className="measure-line";end.style.left="100%";staff.appendChild(end);
    grid.append(labels,staff);scroll.appendChild(grid);sec.appendChild(scroll);host.appendChild(sec);
  });
  const leg=document.createElement("div");leg.className="legend";
  leg.innerHTML='<span><i class="lopen"></i>open</span><span><i class="llow"></i>frets 1–3</span><span><i class="lmid"></i>frets 3–5</span><span><i class="lupper"></i>frets 6–8</span><span><i class="lhigh"></i>frets 8–10</span><span>outlined = salvage anchor</span>';
  host.appendChild(leg);
}
function renderMetadata(){
  const meta=[
    ["Composer",song.identity.composer.name],["Category",song.origin.category],["Era",song.origin.era],["Year",song.origin.year??"—"],
    ["Original key",song.origin.originalKey??"—"],["Arranged key",song.arrangement.arrangedKey??"—"],["Meter",song.musical.meter],["Tempo unit",song.musical.tempoUnit],
    ["Difficulty",`${song.arrangement.difficulty.label} (${song.arrangement.difficulty.rating}/5)`],["Max fret",song.stats.maxFret],["Notes",song.stats.notes],["Anchors",song.stats.anchorNotes],
    ["Note confidence",song.verification.notes.confidence],["Timing confidence",song.verification.timing.confidence],["Timing method",song.verification.timing.method],["Pinky required",song.arrangement.pinkyRequired?"yes":"no"]
  ];
  $("#metaGrid").innerHTML=meta.map(([a,b])=>`<div class="meta-item"><small>${safe(a)}</small><b>${safe(b)}</b></div>`).join("");
  $("#sourceList").innerHTML=song.sources.map(src=>`<li><a href="${safe(src.url)}" target="_blank" rel="noreferrer">${safe(src.label)}</a> — ${safe(src.kind)}</li>`).join("");
  $("#qualityNote").textContent=song.verification.notesAboutQuality.join(" ");
}
function renderAll(){
  stop(false);
  renderSectionButtons();renderTabs();buildFlat();highlight();renderMetadata();
}
function ensureAudio(){if(!audio)audio=new (window.AudioContext||window.webkitAudioContext)();if(audio.state==="suspended")audio.resume();}
function hz(midi){return 440*Math.pow(2,(midi-69)/12);}
function track(n){nodes.push(n);return n;}
function piano(midi,start,seconds,level=1){
  const out=audio.createGain();out.gain.setValueAtTime(.0001,start);out.gain.exponentialRampToValueAtTime(.18*level,start+.006);out.gain.exponentialRampToValueAtTime(.0001,start+Math.max(.14,seconds));out.connect(audio.destination);
  [[1,"triangle",1],[2,"sine",.30],[3,"sine",.11]].forEach(([mult,type,amt])=>{const o=track(audio.createOscillator()),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(hz(midi)*mult,start);g.gain.value=amt;o.connect(g).connect(out);o.start(start);o.stop(start+seconds+.05);});
}
function guitar(midi,start,seconds,level=1){
  const out=audio.createGain(),body=audio.createBiquadFilter(),o=track(audio.createOscillator()),h=track(audio.createOscillator()),hg=audio.createGain();
  body.type="lowpass";body.frequency.setValueAtTime(4200,start);body.frequency.exponentialRampToValueAtTime(900,start+Math.max(.12,seconds));
  out.gain.setValueAtTime(.0001,start);out.gain.exponentialRampToValueAtTime(.22*level,start+.004);out.gain.exponentialRampToValueAtTime(.0001,start+Math.max(.12,seconds));
  o.type="triangle";o.frequency.setValueAtTime(hz(midi),start);o.detune.setValueAtTime(-3,start);o.detune.linearRampToValueAtTime(0,start+.07);
  h.type="sine";h.frequency.setValueAtTime(hz(midi)*2,start);hg.gain.setValueAtTime(.12,start);hg.gain.exponentialRampToValueAtTime(.0001,start+Math.max(.07,seconds*.42));
  o.connect(body);h.connect(hg).connect(body);body.connect(out).connect(audio.destination);o.start(start);h.start(start);o.stop(start+seconds+.05);h.stop(start+seconds+.05);
}
function celesta(midi,start,seconds,level=1){
  const out=audio.createGain();out.gain.setValueAtTime(.0001,start);out.gain.exponentialRampToValueAtTime(.16*level,start+.003);out.gain.exponentialRampToValueAtTime(.0001,start+Math.max(.1,seconds));out.connect(audio.destination);
  [[1,1],[2,.48],[3,.22],[4,.1],[6,.05]].forEach(([mult,amt])=>{const o=track(audio.createOscillator()),g=audio.createGain();o.type="sine";o.frequency.setValueAtTime(hz(midi)*mult,start);g.gain.setValueAtTime(amt,start);g.gain.exponentialRampToValueAtTime(.0001,start+Math.max(.07,seconds*(mult===1?1:.45)));o.connect(g).connect(out);o.start(start);o.stop(start+seconds+.05);});
}
function tone(midi,start,seconds){
  const mode=$("#instrument").value;
  if(mode==="guitar")guitar(midi,start,seconds,1);
  else if(mode==="piano")piano(midi,start,seconds,1);
  else if(mode==="celesta")celesta(midi,start,seconds,1);
  else if(mode==="both"||mode==="guitar-piano"){guitar(midi,start,seconds,.68);piano(midi,start,seconds,.60);}
  else if(mode==="guitar-celesta"){guitar(midi,start,seconds,.64);celesta(midi,start,seconds,.68);}
}
function clearTimers(){timers.forEach(clearTimeout);timers=[];}
function later(fn,ms){const id=setTimeout(fn,Math.max(0,ms));timers.push(id);}
function stopNodes(){nodes.forEach(n=>{try{n.stop();}catch(_){}});nodes=[];}
function stop(reset=true){
  runId++;playing=false;clearTimers();stopNodes();
  if(reset)cursor=0;
  document.querySelectorAll(".note.live,.note.next,.note.dimmed").forEach(n=>n.classList.remove("live","next","dimmed"));
  updateButtons();highlight();updateStatus();
}
function pause(){
  runId++;playing=false;clearTimers();stopNodes();updateButtons();updateStatus();
}
function activePlayEvents(){
  const anchorsOnly=$("#salvage").checked;
  return flat.map((x,i)=>({...x,flatIndex:i})).filter(x=>!anchorsOnly||x.event.anchor);
}
function play(){
  if(!flat.length)return;
  stopNodes();clearTimers();playing=true;updateButtons();
  const myRun=++runId, secPerUnit=tempoSecondsPerUnit(), gate=Number($("#gate").value)/100;
  const candidates=activePlayEvents();
  const currentStart=flat[cursor]?.start ?? 0;
  const events=candidates.filter(x=>x.start>=currentStart-1e-6);
  if($("#salvage").checked)document.querySelectorAll(".note:not(.anchor)").forEach(n=>n.classList.add("dimmed"));
  const startAt=audio?.currentTime||0;
  ensureAudio();const audioStart=audio.currentTime+.10;
  events.forEach((x,idx)=>{
    const rel=(x.start-currentStart)*secPerUnit;
    tone(x.event.midi,audioStart+rel,Math.max(.07,x.event.duration*secPerUnit*gate));
    later(()=>{
      if(myRun!==runId)return;
      cursor=x.flatIndex;highlight();updateStatus();
    },100+rel*1000);
    const next=events[idx+1];
    if(next)later(()=>{const el=findNoteEl(next);el?.classList.add("next");},Math.max(0,100+rel*1000-180));
  });
  const last=events.at(-1);
  const total=last?((last.start-currentStart)+last.event.duration)*secPerUnit*1000:0;
  later(()=>{
    if(myRun!==runId)return;
    if(loop){cursor=0;play();}else{playing=false;updateButtons();updateStatus();}
  },total+220);
}
function findNoteEl(x){
  const section=x.section.id;
  return document.querySelector(`.note[data-section="${CSS.escape(section)}"][data-measure="${x.mi}"][data-event="${x.ei}"]`);
}
function highlight(){
  document.querySelectorAll(".note.live,.note.next").forEach(n=>n.classList.remove("live","next"));
  if(!flat.length)return;
  const x=flat[cursor],el=findNoteEl(x);el?.classList.add("live");
  const nx=flat[cursor+1],nel=nx?findNoteEl(nx):null;nel?.classList.add("next");
}
function updateButtons(){
  $("#play").textContent=playing?"▶ Playing":"▶ Play";
  $("#loop").classList.toggle("active",loop);
}
function updateStatus(){
  const total=flat.length,pos=total?cursor+1:0;
  $("#counter").textContent=`${pos} / ${total}`;
  $("#progress").style.width=total?`${(pos/total)*100}%`:"0%";
  $("#status").textContent=playing?"Playing":(cursor?"Paused / positioned":"Ready");
}
function audition(sectionId,mi,ei,el){
  pause();ensureAudio();
  const section=song.sections.find(s=>s.id===sectionId),e=section.measures[mi].events[ei];
  tone(e.midi,audio.currentTime+.02,Math.max(.18,e.duration*tempoSecondsPerUnit()*Number($("#gate").value)/100));
  document.querySelectorAll(".note.live").forEach(n=>n.classList.remove("live"));el.classList.add("live");
  later(()=>el.classList.remove("live"),500);
}
function vlq(n){let b=[n&127];while(n>>=7)b.unshift((n&127)|128);return b;}
const u32=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255],u16=n=>[(n>>>8)&255,n&255];
function exportMidi(){
  const ppq=480, unitsPerQuarter=song.musical.unitsPerQuarter||1, bpm=Number($("#tempo").value), quarterBpm=bpm/unitsPerQuarter, us=Math.round(60000000/quarterBpm);
  let ev=[0,0xFF,0x51,0x03,(us>>16)&255,(us>>8)&255,us&255,0,0xC0,GM_PROGRAM[$("#instrument").value]??GM_PROGRAM.guitar];
  let timeline=[];
  flat.forEach(x=>{
    const t=Math.round(x.start/unitsPerQuarter*ppq),dur=Math.max(1,Math.round(x.event.duration/unitsPerQuarter*ppq*Number($("#gate").value)/100));
    timeline.push({t,on:true,p:x.event.midi});timeline.push({t:t+dur,on:false,p:x.event.midi});
  });
  timeline.sort((a,b)=>a.t-b.t||(a.on?1:-1));let last=0;
  timeline.forEach(x=>{ev.push(...vlq(x.t-last),x.on?0x90:0x80,x.p,x.on?92:48);last=x.t;});
  ev.push(0,0xFF,0x2F,0);
  const head=[...Array.from("MThd").map(c=>c.charCodeAt(0)),...u32(6),...u16(0),...u16(1),...u16(ppq)];
  const tr=[...Array.from("MTrk").map(c=>c.charCodeAt(0)),...u32(ev.length),...ev];
  const blob=new Blob([new Uint8Array([...head,...tr])],{type:"audio/midi"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`${slug}.mid`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function bind(){
  $("#play").onclick=()=>playing?pause():play();$("#pause").onclick=pause;$("#stop").onclick=()=>stop(true);
  $("#loop").onclick=()=>{loop=!loop;updateButtons();};$("#midi").onclick=exportMidi;
  $("#tempo").oninput=e=>{$("#tempoOut").textContent=e.target.value;if(playing){pause();play();}}; $("#gate").oninput=e=>{$("#gateOut").textContent=`${e.target.value}%`;};
  document.addEventListener("keydown",e=>{
    if(["INPUT","SELECT","TEXTAREA"].includes(e.target.tagName))return;
    if(e.code==="Space"){e.preventDefault();playing?pause():play();}
    if(e.code==="ArrowRight"){e.preventDefault();pause();cursor=Math.min(flat.length-1,cursor+1);highlight();const x=flat[cursor];const el=findNoteEl(x);el&&audition(x.section.id,x.mi,x.ei,el);}
    if(e.code==="ArrowLeft"){e.preventDefault();pause();cursor=Math.max(0,cursor-1);highlight();const x=flat[cursor];const el=findNoteEl(x);el&&audition(x.section.id,x.mi,x.ei,el);}
  });
}
async function init(){
  song=await fetch(`${rootPath}/data/songs/${slug}.json`).then(r=>{if(!r.ok)throw new Error(r.status);return r.json();});
  renderHero();renderControls();bind();renderAll();
}
init().catch(err=>{console.error(err);$("#status").textContent="Could not load song JSON.";});
