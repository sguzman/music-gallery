import {secondsPerUnit,midiMicrosPerQuarter,unitsToTicks,transportTempoBounds} from "./timing.js";

const body=document.body;
const slug=body.dataset.song;
const rootPath=body.dataset.root || "../..";
const $=s=>document.querySelector(s);
const STRING_Y={e:19,B:57,G:95,D:133,A:171,E:209};
const GM_PROGRAM={guitar:25,piano:0,celesta:8,violin:40,cello:42,strings:48,flute:73,oboe:68,clarinet:71,bassoon:70};

let song=null, viewMode="practice", selectedSection=-1, flat=[], cursor=0, playing=false, loop=false, audio=null, timers=[], nodes=[], runId=0;
let trackState=new Map();

function safe(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));}
function fullAvailable(){return song?.fullVersion?.status==="available" && Array.isArray(song.fullVersion.tracks) && song.fullVersion.tracks.length>0;}
function currentTiming(){return viewMode==="full" && fullAvailable()?song.fullVersion.musical:song.musical;}
function tempoSecondsPerUnit(){const t=currentTiming();return secondsPerUnit(Number($("#tempo").value),t?.unitsPerQuarter||1);}
function activeSections(){return selectedSection===-1?song.sections:[song.sections[selectedSection]];}
function trackEnabled(track){return trackState.get(track.id)!==false;}

function buildFlat(){
  flat=[];
  if(viewMode==="full"&&fullAvailable()){
    song.fullVersion.tracks.forEach((track,ti)=>{
      if(!trackEnabled(track))return;
      track.events.forEach((event,ei)=>{if(event.type==="note")flat.push({mode:"full",track,ti,event,ei,start:event.start});});
    });
    flat.sort((a,b)=>a.start-b.start||a.ti-b.ti||a.event.midi-b.event.midi);
  }else{
    let global=0;
    activeSections().forEach((section,si)=>{
      section.measures.forEach((m,mi)=>{
        m.events.forEach((e,ei)=>{if(e.type==="note")flat.push({mode:"practice",section,si,measure:m,mi,event:e,ei,start:global+e.start});});
        global+=m.duration;
      });
    });
  }
  cursor=Math.min(cursor,Math.max(0,flat.length-1));
  updateStatus();
}

function renderHero(){
  document.documentElement.style.setProperty("--accent",song.presentation.accent);
  document.title=`${song.identity.displayTitle} — Music Gallery`;
  $("#eyebrow").textContent=`${song.origin.category} · Interactive music specimen`;
  $("#title").textContent=song.identity.displayTitle;
  $("#subtitle").textContent=`${song.identity.composer.name}${song.origin.franchise?` · ${song.origin.franchise}`:""} · ${song.presentation.description}`;
  const badges=[song.arrangement.tuning.name,song.arrangement.difficulty.label,song.musical.meter,`max fret ${song.stats.maxFret}`,`timing ${song.verification.timing.confidence}`,fullAvailable()?"full score available":"practice arrangement","MIDI export"];
  $("#badges").innerHTML=badges.map(b=>`<span class="badge">${safe(b)}</span>`).join("");
  $("#jsonLink").href=`${rootPath}/data/songs/${slug}.json`;
  $("#repoLink").href=`https://github.com/sguzman/music-gallery/blob/main/data/songs/${slug}.json`;
}

function renderControls(resetTempo=false){
  const timing=currentTiming(),tempo=$("#tempo"),bounds=transportTempoBounds(timing.bpmRange,timing.defaultBpm);
  tempo.min=bounds.min;tempo.max=bounds.max;tempo.step=1;
  if(resetTempo||!tempo.value)tempo.value=timing.defaultBpm;
  $("#tempoOut").textContent=`${tempo.value} BPM`;
  $("#gate").value=song.playback.gatePercent||86;$("#gateOut").textContent=`${$("#gate").value}%`;
  const inst=$("#instrument"),labels={guitar:"Steel-string guitar",piano:"Piano",both:"Guitar + piano",celesta:"Celesta","guitar-celesta":"Guitar + celesta","guitar-piano":"Guitar + piano"};
  if(viewMode==="full"){inst.innerHTML='<option value="score">Score instruments</option>';inst.disabled=true;}
  else{inst.disabled=false;inst.innerHTML=song.playback.instrumentOptions.map(v=>`<option value="${v}" ${v===song.playback.defaultInstrument?"selected":""}>${labels[v]||v}</option>`).join("");}
}

function switchView(mode){
  if(mode==="full"&&!fullAvailable())return;
  stop(true);viewMode=mode;selectedSection=-1;cursor=0;renderControls(true);renderAll();
}

function renderViewSwitch(){
  const practice=$("#practiceView"),full=$("#fullView"),note=$("#viewDescription");
  practice.classList.toggle("active",viewMode==="practice");practice.setAttribute("aria-selected",String(viewMode==="practice"));
  full.classList.toggle("active",viewMode==="full");full.setAttribute("aria-selected",String(viewMode==="full"));full.disabled=!fullAvailable();
  if(viewMode==="full")note.textContent=song.fullVersion.description||"Source-backed full rendition with simultaneous tracks.";
  else if(fullAvailable())note.textContent="Practice arrangement: segmented, guitar-first, and easy to isolate. Full rendition is available in the other tab.";
  else{const status=song.fullVersion?.status,desc=song.fullVersion?.description;note.textContent=desc||((status?`Practice arrangement. Full rendition status: ${status.replaceAll("-"," ")}.`:"Practice arrangement. A provenance-backed full rendition has not been loaded yet."));}
}

function renderSectionButtons(){
  const host=$("#sectionButtons");host.innerHTML="";host.hidden=viewMode!=="practice";if(viewMode!=="practice")return;
  const all=document.createElement("button");all.textContent="All sections";all.className=selectedSection===-1?"active":"";all.onclick=()=>{selectedSection=-1;cursor=0;renderAll();};host.appendChild(all);
  song.sections.forEach((s,i)=>{const b=document.createElement("button");b.textContent=s.name;b.className=i===selectedSection?"active":"";b.onclick=()=>{selectedSection=i;cursor=0;renderAll();};host.appendChild(b);});
}

function renderPractice(){
  const host=$("#tabs");host.innerHTML="";host.className="card tab-wrap";
  activeSections().forEach(section=>{
    const sec=document.createElement("section");sec.className="section-block";
    const total=section.measures.reduce((a,m)=>a+m.duration,0);
    sec.innerHTML=`<div class="section-head"><h2>${safe(section.name)}</h2><span>${safe(section.description||"")} · ${section.measures.length} groups</span></div>`;
    const scroll=document.createElement("div");scroll.className="tab-scroll";
    const grid=document.createElement("div");grid.className="tab-grid";grid.style.minWidth=`${Math.max(760,total*36)}px`;
    const labels=document.createElement("div");labels.className="string-labels";
    ["e","B","G","D","A","E"].forEach(n=>{const d=document.createElement("div");d.className="string-label";d.textContent=n;labels.appendChild(d);});
    const staff=document.createElement("div");staff.className="staff";
    ["e","B","G","D","A","E"].forEach(n=>{const l=document.createElement("span");l.className="string-line";l.style.top=`${STRING_Y[n]}px`;staff.appendChild(l);});
    let measureStart=0;
    section.measures.forEach((m,mi)=>{
      const left=measureStart/total*100,ml=document.createElement("span");ml.className="measure-line";ml.style.left=`${left}%`;staff.appendChild(ml);
      const lab=document.createElement("span");lab.className="measure-label";lab.style.left=`${left}%`;lab.textContent=m.label;staff.appendChild(lab);
      for(let b=1;b<Math.floor(m.duration);b++){const bl=document.createElement("span");bl.className="beat-line";bl.style.left=`${(measureStart+b)/total*100}%`;staff.appendChild(bl);}
      m.events.forEach((e,ei)=>{
        if(e.type!=="note")return;
        const local=m.duration?(.055*m.duration+e.start*.89):e.start,x=(measureStart+local)/total*100;
        const n=document.createElement("button");n.type="button";n.className=`note ${e.position}${e.anchor?" anchor":""}`;n.textContent=e.fret;n.style.left=`${x}%`;n.style.top=`${STRING_Y[e.string]}px`;
        n.dataset.section=section.id;n.dataset.measure=mi;n.dataset.event=ei;n.title=`${e.string} string · fret ${e.fret} · MIDI ${e.midi} · duration ${e.duration}`;
        n.onclick=()=>auditionPractice(section.id,mi,ei,n);staff.appendChild(n);
      });
      measureStart+=m.duration;
    });
    const end=document.createElement("span");end.className="measure-line";end.style.left="100%";staff.appendChild(end);
    grid.append(labels,staff);scroll.appendChild(grid);sec.appendChild(scroll);host.appendChild(sec);
  });
  const leg=document.createElement("div");leg.className="legend";leg.innerHTML='<span><i class="lopen"></i>open</span><span><i class="llow"></i>frets 1–3</span><span><i class="lmid"></i>frets 3–5</span><span><i class="lupper"></i>frets 6–8</span><span><i class="lhigh"></i>frets 8–10</span><span>outlined = salvage anchor</span>';host.appendChild(leg);
}

function fullDuration(){return song.fullVersion.durationUnits||Math.max(0,...song.fullVersion.tracks.flatMap(t=>t.events.map(e=>e.start+e.duration)));}
function renderFull(){
  const host=$("#tabs");host.innerHTML="";host.className="card tab-wrap full-version-wrap";
  const fv=song.fullVersion,total=fullDuration(),intro=document.createElement("div");intro.className="full-score-intro";
  const source=fv.provenance?.url?`<a href="${safe(fv.provenance.url)}" target="_blank" rel="noreferrer">${safe(fv.provenance.provider||"source")}</a>`:safe(fv.provenance?.provider||"");
  intro.innerHTML=`<div><span class="full-kicker">Full rendition</span><h2>${safe(fv.label||"Full score")}</h2><p>${safe(fv.description||"")}</p></div><div class="full-source">Source: ${source}<br>${safe(fv.provenance?.license||"")}</div>`;host.appendChild(intro);
  const tools=document.createElement("div");tools.className="track-tools";
  const all=document.createElement("button");all.textContent="Enable all tracks";all.onclick=()=>{fv.tracks.forEach(t=>trackState.set(t.id,true));cursor=0;renderAll();};
  const none=document.createElement("button");none.textContent="Mute all";none.onclick=()=>{fv.tracks.forEach(t=>trackState.set(t.id,false));cursor=0;renderAll();};tools.append(all,none);host.appendChild(tools);
  const scrolls=[];
  fv.tracks.forEach((track,ti)=>{
    const block=document.createElement("section");block.className=`full-track-block${trackEnabled(track)?"":" muted-track"}`;
    const head=document.createElement("div");head.className="full-track-head",check=document.createElement("input");check.type="checkbox";check.checked=trackEnabled(track);check.setAttribute("aria-label",`Enable ${track.name}`);
    check.onchange=()=>{stop(false);trackState.set(track.id,check.checked);cursor=0;renderAll();};
    const label=document.createElement("div");label.innerHTML=`<b>${safe(track.name)}</b><small>${safe(track.role||"")} · ${safe(track.instrumentLabel||track.defaultInstrument||"instrument")} · ${track.events.length} notes</small>`;head.append(check,label);block.appendChild(head);
    const scroll=document.createElement("div");scroll.className="full-track-scroll";scrolls.push(scroll);
    const roll=document.createElement("div");roll.className="full-track-roll";roll.style.minWidth=`${Math.max(980,total*9)}px`;
    const mids=track.events.filter(e=>e.type==="note").map(e=>e.midi),lo=Math.min(...mids),hi=Math.max(...mids),span=Math.max(1,hi-lo);
    (fv.measures||[]).forEach((m,mi)=>{const line=document.createElement("span");line.className="full-measure-line";line.style.left=`${m.start/total*100}%`;roll.appendChild(line);if(mi%4===0){const lab=document.createElement("span");lab.className="full-measure-label";lab.style.left=`${m.start/total*100}%`;lab.textContent=m.label;roll.appendChild(lab);}});
    track.events.forEach((e,ei)=>{if(e.type!=="note")return;const n=document.createElement("button");n.type="button";n.className="full-note";n.dataset.track=ti;n.dataset.event=ei;n.style.left=`${e.start/total*100}%`;n.style.width=`${Math.max(.08,e.duration/total*100)}%`;n.style.top=`${8+(hi-e.midi)/span*58}px`;n.title=`${track.name} · MIDI ${e.midi} · bar ${e.sourceMeasure??"?"} · ${e.duration} quarter-note units`;n.onclick=()=>auditionFull(ti,ei,n);roll.appendChild(n);});
    scroll.appendChild(roll);block.appendChild(scroll);host.appendChild(block);
  });
  let syncing=false;scrolls.forEach(sc=>sc.addEventListener("scroll",()=>{if(syncing)return;syncing=true;scrolls.forEach(other=>{if(other!==sc)other.scrollLeft=sc.scrollLeft;});syncing=false;}));
}

function renderMetadata(){
  const timing=currentTiming(),meta=[["Composer",song.identity.composer.name],["Category",song.origin.category],["Era",song.origin.era],["Year",song.origin.year??"—"],["Original key",song.origin.originalKey??"—"],["Arranged key",song.arrangement.arrangedKey??"—"],["Meter",timing.meter],["Tempo unit",timing.tempoUnit],["Difficulty",`${song.arrangement.difficulty.label} (${song.arrangement.difficulty.rating}/5)`],["Max fret",song.stats.maxFret],["Practice notes",song.stats.notes],["View",viewMode==="full"?"full rendition":"practice arrangement"],["Note confidence",song.verification.notes.confidence],["Timing confidence",song.verification.timing.confidence],["Timing method",song.verification.timing.method],["Pinky required",song.arrangement.pinkyRequired?"yes":"no"]];
  $("#metaGrid").innerHTML=meta.map(([a,b])=>`<div class="meta-item"><small>${safe(a)}</small><b>${safe(b)}</b></div>`).join("");
  $("#sourceList").innerHTML=song.sources.map(src=>`<li><a href="${safe(src.url)}" target="_blank" rel="noreferrer">${safe(src.label)}</a> — ${safe(src.kind)}</li>`).join("");
  $("#qualityNote").textContent=(song.verification.notesAboutQuality||[]).join(" ");
}
function renderHelp(){
  $("#salvageWrap").hidden=viewMode==="full";
  $("#helpText").innerHTML=viewMode==="full"?'<b>Full rendition:</b> simultaneous source-score tracks · uncheck any track to mute it · horizontal scrolling is synchronized · <kbd>Space</kbd> play/pause · <kbd>←</kbd>/<kbd>→</kbd> step through score events.':'<b>Practice controls:</b> <kbd>Space</kbd> play/pause · <kbd>←</kbd>/<kbd>→</kbd> step note-by-note · click any fret box to audition it · click a section name to isolate it. Box color is hand position; box number is fret; horizontal spacing carries attack timing.';
}
function renderAll(){stop(false);renderViewSwitch();renderSectionButtons();viewMode==="full"&&fullAvailable()?renderFull():renderPractice();buildFlat();highlight();renderMetadata();renderHelp();}

function ensureAudio(){if(!audio)audio=new (window.AudioContext||window.webkitAudioContext)();if(audio.state==="suspended")audio.resume();}
function hz(midi){return 440*Math.pow(2,(midi-69)/12);}
function trackNode(n){nodes.push(n);return n;}
function envelope(start,seconds,peak=.18,attack=.006){const g=audio.createGain();g.gain.setValueAtTime(.0001,start);g.gain.exponentialRampToValueAtTime(peak,start+attack);g.gain.exponentialRampToValueAtTime(.0001,start+Math.max(attack+.03,seconds));g.connect(audio.destination);return g;}
function piano(midi,start,seconds,level=1){const out=envelope(start,seconds,.18*level,.006);[[1,"triangle",1],[2,"sine",.30],[3,"sine",.11]].forEach(([mult,type,amt])=>{const o=trackNode(audio.createOscillator()),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(hz(midi)*mult,start);g.gain.value=amt;o.connect(g).connect(out);o.start(start);o.stop(start+seconds+.05);});}
function guitar(midi,start,seconds,level=1){const out=envelope(start,seconds,.22*level,.004),body=audio.createBiquadFilter(),o=trackNode(audio.createOscillator()),h=trackNode(audio.createOscillator()),hg=audio.createGain();body.type="lowpass";body.frequency.setValueAtTime(4200,start);body.frequency.exponentialRampToValueAtTime(900,start+Math.max(.12,seconds));o.type="triangle";o.frequency.setValueAtTime(hz(midi),start);h.type="sine";h.frequency.setValueAtTime(hz(midi)*2,start);hg.gain.setValueAtTime(.12,start);hg.gain.exponentialRampToValueAtTime(.0001,start+Math.max(.07,seconds*.42));o.connect(body);h.connect(hg).connect(body);body.connect(out);o.start(start);h.start(start);o.stop(start+seconds+.05);h.stop(start+seconds+.05);}
function celesta(midi,start,seconds,level=1){const out=envelope(start,seconds,.16*level,.003);[[1,1],[2,.48],[3,.22],[4,.1],[6,.05]].forEach(([mult,amt])=>{const o=trackNode(audio.createOscillator()),g=audio.createGain();o.type="sine";o.frequency.setValueAtTime(hz(midi)*mult,start);g.gain.setValueAtTime(amt,start);g.gain.exponentialRampToValueAtTime(.0001,start+Math.max(.07,seconds*(mult===1?1:.45)));o.connect(g).connect(out);o.start(start);o.stop(start+seconds+.05);});}
function bowed(midi,start,seconds,level=1,kind="violin"){const out=envelope(start,seconds,(kind==="cello"?.11:.075)*level,.035),f=audio.createBiquadFilter(),o=trackNode(audio.createOscillator());o.type=kind==="cello"?"triangle":"sawtooth";o.frequency.setValueAtTime(hz(midi),start);f.type="lowpass";f.frequency.value=kind==="cello"?1800:3300;o.connect(f).connect(out);o.start(start);o.stop(start+seconds+.08);}
function generic(midi,start,seconds,level=1){const out=envelope(start,seconds,.10*level,.012),o=trackNode(audio.createOscillator());o.type="triangle";o.frequency.value=hz(midi);o.connect(out);o.start(start);o.stop(start+seconds+.05);}
function toneFor(mode,midi,start,seconds,level=1){if(mode==="guitar")guitar(midi,start,seconds,level);else if(mode==="piano")piano(midi,start,seconds,level);else if(mode==="celesta")celesta(midi,start,seconds,level);else if(mode==="violin"||mode==="strings")bowed(midi,start,seconds,level,"violin");else if(mode==="cello")bowed(midi,start,seconds,level,"cello");else if(mode==="both"||mode==="guitar-piano"){guitar(midi,start,seconds,.68*level);piano(midi,start,seconds,.60*level);}else if(mode==="guitar-celesta"){guitar(midi,start,seconds,.64*level);celesta(midi,start,seconds,.68*level);}else generic(midi,start,seconds,level);}
function toneForEntry(x,start,seconds){if(x.mode==="full")toneFor(x.track.defaultInstrument||"strings",x.event.midi,start,seconds,x.track.level??1);else toneFor($("#instrument").value,x.event.midi,start,seconds,1);}
function clearTimers(){timers.forEach(clearTimeout);timers=[];}
function later(fn,ms){const id=setTimeout(fn,Math.max(0,ms));timers.push(id);}
function stopNodes(){nodes.forEach(n=>{try{n.stop();}catch(_){}});nodes=[];}
function clearHighlights(){document.querySelectorAll(".note.live,.note.next,.note.dimmed,.full-note.live,.full-note.next").forEach(n=>n.classList.remove("live","next","dimmed"));}
function stop(reset=true){runId++;playing=false;clearTimers();stopNodes();if(reset)cursor=0;clearHighlights();updateButtons();highlight();updateStatus();}
function pause(){runId++;playing=false;clearTimers();stopNodes();updateButtons();updateStatus();}
function activePlayEvents(){if(viewMode==="full")return flat.map((x,i)=>({...x,flatIndex:i}));const anchorsOnly=$("#salvage").checked;return flat.map((x,i)=>({...x,flatIndex:i})).filter(x=>!anchorsOnly||x.event.anchor);}
function play(){
  if(!flat.length)return;stopNodes();clearTimers();playing=true;updateButtons();
  const myRun=++runId,secPerUnit=tempoSecondsPerUnit(),gate=Number($("#gate").value)/100,candidates=activePlayEvents(),currentStart=flat[cursor]?.start??0,events=candidates.filter(x=>x.start>=currentStart-1e-6);
  if(viewMode==="practice"&&$("#salvage").checked)document.querySelectorAll(".note:not(.anchor)").forEach(n=>n.classList.add("dimmed"));
  ensureAudio();const audioStart=audio.currentTime+.10;
  events.forEach(x=>{const rel=(x.start-currentStart)*secPerUnit,dur=Math.max(.06,x.event.duration*secPerUnit*gate);toneForEntry(x,audioStart+rel,dur);later(()=>{if(myRun!==runId)return;cursor=x.flatIndex;highlight();updateStatus();},100+rel*1000);});
  const lastEnd=events.reduce((m,x)=>Math.max(m,(x.start-currentStart)+x.event.duration),0)*secPerUnit*1000;
  later(()=>{if(myRun!==runId)return;if(loop){cursor=0;play();}else{playing=false;updateButtons();updateStatus();}},lastEnd+220);
}
function findNoteEl(x){return x.mode==="full"?document.querySelector(`.full-note[data-track="${x.ti}"][data-event="${x.ei}"]`):document.querySelector(`.note[data-section="${CSS.escape(x.section.id)}"][data-measure="${x.mi}"][data-event="${x.ei}"]`);}
function highlight(){document.querySelectorAll(".note.live,.note.next,.full-note.live,.full-note.next").forEach(n=>n.classList.remove("live","next"));if(!flat.length)return;const start=flat[cursor].start;flat.forEach(x=>{if(Math.abs(x.start-start)<1e-8)findNoteEl(x)?.classList.add("live");});const next=flat.find(x=>x.start>start+1e-8);if(next){const ns=next.start;flat.forEach(x=>{if(Math.abs(x.start-ns)<1e-8)findNoteEl(x)?.classList.add("next");});}}
function updateButtons(){$("#play").textContent=playing?"▶ Playing":"▶ Play";$("#loop").classList.toggle("active",loop);}
function updateStatus(){const total=flat.length,pos=total?cursor+1:0;$("#counter").textContent=`${pos} / ${total}`;$("#progress").style.width=total?`${pos/total*100}%`:"0%";$("#status").textContent=playing?"Playing":(cursor?"Paused / positioned":"Ready");}
function auditionPractice(sectionId,mi,ei,el){pause();ensureAudio();const section=song.sections.find(s=>s.id===sectionId),e=section.measures[mi].events[ei];toneFor($("#instrument").value,e.midi,audio.currentTime+.02,Math.max(.18,e.duration*tempoSecondsPerUnit()*Number($("#gate").value)/100));document.querySelectorAll(".note.live").forEach(n=>n.classList.remove("live"));el.classList.add("live");later(()=>el.classList.remove("live"),500);}
function auditionFull(ti,ei,el){pause();ensureAudio();const track=song.fullVersion.tracks[ti],e=track.events[ei];toneFor(track.defaultInstrument||"strings",e.midi,audio.currentTime+.02,Math.max(.14,e.duration*tempoSecondsPerUnit()*Number($("#gate").value)/100),track.level??1);document.querySelectorAll(".full-note.live").forEach(n=>n.classList.remove("live"));el.classList.add("live");later(()=>el.classList.remove("live"),500);}

function vlq(n){let b=[n&127];while(n>>=7)b.unshift((n&127)|128);return b;}
const u32=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255],u16=n=>[(n>>>8)&255,n&255];
function chunk(bytes){return [...Array.from("MTrk").map(c=>c.charCodeAt(0)),...u32(bytes.length),...bytes];}
function downloadMidi(bytes,name){const blob=new Blob([new Uint8Array(bytes)],{type:"audio/midi"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function exportPracticeMidi(){
  const ppq=480,timing=currentTiming(),units=timing.unitsPerQuarter||1,bpm=Number($("#tempo").value),us=midiMicrosPerQuarter(bpm);
  let ev=[0,0xFF,0x51,0x03,(us>>16)&255,(us>>8)&255,us&255,0,0xC0,GM_PROGRAM[$("#instrument").value]??GM_PROGRAM.guitar],timeline=[];
  flat.forEach(x=>{const t=unitsToTicks(x.start,units,ppq),dur=Math.max(1,Math.round(unitsToTicks(x.event.duration,units,ppq)*Number($("#gate").value)/100));timeline.push({t,on:true,p:x.event.midi});timeline.push({t:t+dur,on:false,p:x.event.midi});});
  timeline.sort((a,b)=>a.t-b.t||(a.on?1:-1));let last=0;timeline.forEach(x=>{ev.push(...vlq(x.t-last),x.on?0x90:0x80,x.p,x.on?92:48);last=x.t;});ev.push(0,0xFF,0x2F,0);
  const head=[...Array.from("MThd").map(c=>c.charCodeAt(0)),...u32(6),...u16(0),...u16(1),...u16(ppq)];downloadMidi([...head,...chunk(ev)],`${slug}.mid`);
}
function exportFullMidi(){
  const ppq=480,timing=currentTiming(),units=timing.unitsPerQuarter||1,bpm=Number($("#tempo").value),us=midiMicrosPerQuarter(bpm),tracks=song.fullVersion.tracks.filter(trackEnabled);
  const tempo=[0,0xFF,0x51,0x03,(us>>16)&255,(us>>8)&255,us&255,0,0xFF,0x2F,0],chunks=[chunk(tempo)];
  tracks.forEach((track,i)=>{const channel=i>=9?i+1:i,name=[...new TextEncoder().encode(track.name)].slice(0,120),program=track.gmProgram??GM_PROGRAM[track.defaultInstrument]??0;let ev=[0,0xFF,0x03,name.length,...name,0,0xC0|(channel&15),program],timeline=[];track.events.forEach(e=>{if(e.type!=="note")return;const t=unitsToTicks(e.start,units,ppq),dur=Math.max(1,unitsToTicks(e.duration,units,ppq));timeline.push({t,on:true,p:e.midi});timeline.push({t:t+dur,on:false,p:e.midi});});timeline.sort((a,b)=>a.t-b.t||(a.on?1:-1));let last=0;timeline.forEach(x=>{ev.push(...vlq(x.t-last),(x.on?0x90:0x80)|(channel&15),x.p,x.on?(track.velocity??84):48);last=x.t;});ev.push(0,0xFF,0x2F,0);chunks.push(chunk(ev));});
  const head=[...Array.from("MThd").map(c=>c.charCodeAt(0)),...u32(6),...u16(1),...u16(chunks.length),...u16(ppq)];downloadMidi([...head,...chunks.flat()],`${slug}-full.mid`);
}
function exportMidi(){viewMode==="full"&&fullAvailable()?exportFullMidi():exportPracticeMidi();}

function bind(){
  $("#play").onclick=()=>playing?pause():play();$("#pause").onclick=pause;$("#stop").onclick=()=>stop(true);$("#loop").onclick=()=>{loop=!loop;updateButtons();};$("#midi").onclick=exportMidi;
  $("#practiceView").onclick=()=>switchView("practice");$("#fullView").onclick=()=>switchView("full");
  $("#tempo").oninput=e=>{$("#tempoOut").textContent=`${e.target.value} BPM`;if(playing){pause();play();}};$("#gate").oninput=e=>{$("#gateOut").textContent=`${e.target.value}%`;};
  document.addEventListener("keydown",e=>{if(["INPUT","SELECT","TEXTAREA"].includes(e.target.tagName))return;if(e.code==="Space"){e.preventDefault();playing?pause():play();}if(e.code==="ArrowRight"||e.code==="ArrowLeft"){e.preventDefault();pause();cursor=e.code==="ArrowRight"?Math.min(flat.length-1,cursor+1):Math.max(0,cursor-1);highlight();const x=flat[cursor],el=x?findNoteEl(x):null;if(x&&el){if(x.mode==="full")auditionFull(x.ti,x.ei,el);else auditionPractice(x.section.id,x.mi,x.ei,el);}}});
}
async function init(){
  song=await fetch(`${rootPath}/data/songs/${slug}.json`).then(r=>{if(!r.ok)throw new Error(r.status);return r.json();});
  if(fullAvailable())song.fullVersion.tracks.forEach(t=>trackState.set(t.id,t.enabled!==false));
  renderHero();renderControls(true);bind();renderAll();
}
init().catch(err=>{console.error(err);$("#status").textContent="Could not load song JSON.";});
