const body=document.body;
const slug=body.dataset.song;
const rootPath=body.dataset.root||"../..";
const $=s=>document.querySelector(s);
const STRING_Y={e:19,B:57,G:95,D:133,A:171,E:209};

const INSTRUMENTS={
  "piano":{label:"Grand piano",program:0,family:"key"},
  "harpsichord":{label:"Harpsichord",program:6,family:"pluck"},
  "celesta":{label:"Celesta",program:8,family:"mallet"},
  "glockenspiel":{label:"Glockenspiel",program:9,family:"mallet"},
  "music-box":{label:"Music box",program:10,family:"mallet"},
  "vibraphone":{label:"Vibraphone",program:11,family:"mallet"},
  "marimba":{label:"Marimba",program:12,family:"mallet"},
  "xylophone":{label:"Xylophone",program:13,family:"mallet"},
  "tubular-bells":{label:"Tubular bells",program:14,family:"bell"},
  "dulcimer":{label:"Dulcimer",program:15,family:"pluck"},
  "organ":{label:"Pipe organ",program:19,family:"organ"},
  "nylon-guitar":{label:"Nylon-string guitar",program:24,family:"pluck"},
  "guitar":{label:"Steel-string guitar",program:25,family:"pluck"},
  "acoustic-bass":{label:"Acoustic bass",program:32,family:"pluck"},
  "violin":{label:"Violin",program:40,family:"string"},
  "viola":{label:"Viola",program:41,family:"string"},
  "cello":{label:"Cello",program:42,family:"string"},
  "double-bass":{label:"Double bass",program:43,family:"string"},
  "tremolo-strings":{label:"Tremolo strings",program:44,family:"string"},
  "pizzicato-strings":{label:"Pizzicato strings",program:45,family:"pluck"},
  "harp":{label:"Orchestral harp",program:46,family:"pluck"},
  "timpani":{label:"Timpani",program:47,family:"timpani"},
  "string-ensemble":{label:"String ensemble",program:48,family:"string"},
  "choir":{label:"Choir Aahs",program:52,family:"choir"},
  "voice-oohs":{label:"Voice Oohs",program:53,family:"choir"},
  "trumpet":{label:"Trumpet",program:56,family:"brass"},
  "trombone":{label:"Trombone",program:57,family:"brass"},
  "tuba":{label:"Tuba",program:58,family:"brass"},
  "muted-trumpet":{label:"Muted trumpet",program:59,family:"brass"},
  "french-horn":{label:"French horn",program:60,family:"brass"},
  "brass-section":{label:"Brass section",program:61,family:"brass"},
  "oboe":{label:"Oboe",program:68,family:"wind"},
  "english-horn":{label:"English horn",program:69,family:"wind"},
  "bassoon":{label:"Bassoon",program:70,family:"wind"},
  "contrabassoon":{label:"Contrabassoon",program:70,family:"wind"},
  "clarinet":{label:"Clarinet",program:71,family:"wind"},
  "bass-clarinet":{label:"Bass clarinet",program:71,family:"wind"},
  "piccolo":{label:"Piccolo",program:72,family:"wind"},
  "flute":{label:"Flute",program:73,family:"wind"},
  "recorder":{label:"Recorder",program:74,family:"wind"},
  "pan-flute":{label:"Pan flute",program:75,family:"wind"},
  "whistle":{label:"Whistle",program:78,family:"wind"},
  "ocarina":{label:"Ocarina",program:79,family:"wind"}
};

const RECOMMENDED={
  "sugar-plum-fairy":"celesta",
  "canon-in-d":"violin",
  "chopin-nocturne":"piano",
  "schubert-serenade":"clarinet",
  "genshin-main-theme":"whistle",
  "astral-observatory":"celesta"
};

let song=null,parts=[],primaryPart=null,primaryGroup="default",selectedSection=-1,cursor=0,flat=[];
let playing=false,playingGroup=null,lastPlaybackGroup=null,loop=false,audio=null,timers=[],nodes=[],runId=0;
const partState=new Map();
const sectionInstrument=new Map();

function safe(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));}
function keyify(v){return String(v??"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");}
function instrumentOptions(selected){return Object.entries(INSTRUMENTS).map(([id,x])=>`<option value="${id}" ${id===selected?"selected":""}>${safe(x.label)}</option>`).join("");}
function unitsPerQuarter(){return Number(song?.musical?.unitsPerQuarter)||1;}
function secondsPerUnit(){return 60/Number($("#tempo").value)/unitsPerQuarter();}
function groupMeta(group){return song?.playbackGroups?.[group]||{};}
function groupLabel(group){return groupMeta(group).name||group||"arrangement";}
function activeSectionsFor(part){return selectedSection===-1?part.sections:[part.sections[selectedSection]].filter(Boolean);}
function sectionDuration(section){return (section?.measures||[]).reduce((a,m)=>a+Number(m.duration||0),0);}

function normalizeParts(){
  const raw=Array.isArray(song.parts)&&song.parts.length?song.parts:[{
    id:"melody",name:"Melody",role:"lead",defaultInstrument:RECOMMENDED[slug]||song.playback?.defaultInstrument||"guitar",sections:song.sections,playbackGroup:"default"
  }];
  parts=raw.map((p,i)=>({
    id:p.id||`part-${i+1}`,
    name:p.name||`Part ${i+1}`,
    role:p.role||"part",
    defaultInstrument:p.defaultInstrument||p.instrument||RECOMMENDED[slug]||song.playback?.defaultInstrument||"guitar",
    enabled:p.enabled!==false,
    sections:p.sections||song.sections,
    tab:p.tab!==false,
    playbackGroup:p.playbackGroup||"default",
    sourceDerived:Boolean(p.sourceDerived)
  }));
  primaryPart=parts.find(p=>p.tab)||parts[0];
  primaryGroup=primaryPart.playbackGroup;
  lastPlaybackGroup=primaryGroup;
  parts.forEach(p=>partState.set(p.id,{enabled:p.enabled,instrument:p.defaultInstrument}));
}

function eventsForPart(part){
  const out=[];let global=0;
  activeSectionsFor(part).forEach((section,si)=>{
    const originalIndex=part.sections.indexOf(section);
    let measureBase=0;
    (section.measures||[]).forEach((m,mi)=>{
      (m.events||[]).forEach((e,ei)=>{
        if(e.type!=="note")return;
        out.push({part,section,sectionIndex:originalIndex,si,measure:m,mi,event:e,ei,start:global+measureBase+Number(e.start||0)});
      });
      measureBase+=Number(m.duration||0);
    });
    global+=sectionDuration(section);
  });
  return out;
}

function buildFlat(){
  flat=eventsForPart(primaryPart);
  if($("#salvage")?.checked)flat=flat.filter(x=>x.event.anchor);
  cursor=Math.min(cursor,Math.max(0,flat.length-1));
  updateStatus();
}

function renderHero(){
  document.documentElement.style.setProperty("--accent",song.presentation.accent);
  document.title=`${song.identity.displayTitle} — Music Gallery`;
  $("#eyebrow").textContent=`${song.origin.category} · Interactive acoustic melody`;
  $("#title").textContent=song.identity.displayTitle;
  $("#subtitle").textContent=`${song.identity.composer.name}${song.origin.franchise?` · ${song.origin.franchise}`:""} · ${song.presentation.description}`;
  const sourceParts=parts.filter(p=>p.sourceDerived).length;
  const badges=[song.arrangement.tuning.name,song.arrangement.difficulty.label,song.musical.meter,`max fret ${song.stats.maxFret}`,`timing ${song.verification.timing.confidence}`,sourceParts?`${sourceParts} source parts`:`${parts.length} part${parts.length===1?"":"s"}`,"MIDI export"];
  $("#badges").innerHTML=badges.map(b=>`<span class="badge">${safe(b)}</span>`).join("");
  $("#jsonLink").href=`${rootPath}/data/songs/${slug}.json`;
  $("#repoLink").href=`https://github.com/sguzman/music-gallery/blob/player-v2/data/songs/${slug}.json`;
}

function renderControls(){
  $("#tempo").min=song.musical.bpmRange[0];
  $("#tempo").max=song.musical.bpmRange[1];
  $("#tempo").value=song.musical.defaultBpm;
  $("#tempoOut").textContent=song.musical.defaultBpm;
  $("#gate").value=100;
  $("#gateOut").textContent="100%";
  const st=partState.get(primaryPart.id);
  $("#instrument").innerHTML=instrumentOptions(st.instrument);
  $("#instrument").value=st.instrument;
}

function renderSectionButtons(){
  const host=$("#sectionButtons");host.innerHTML="";
  const all=document.createElement("button");all.textContent="All sections";all.className=selectedSection===-1?"active":"";all.onclick=()=>{selectedSection=-1;cursor=0;renderAll();};host.appendChild(all);
  primaryPart.sections.forEach((s,i)=>{const b=document.createElement("button");b.textContent=s.name;b.className=i===selectedSection?"active":"";b.onclick=()=>{selectedSection=i;cursor=0;renderAll();};host.appendChild(b);});
}

function renderTabs(){
  const host=$("#tabs");host.innerHTML="";
  activeSectionsFor(primaryPart).forEach(section=>{
    const sec=document.createElement("section");sec.className="section-block";
    const total=sectionDuration(section)||1;
    sec.innerHTML=`<div class="section-head"><h2>${safe(section.name)}</h2><span>${safe(section.description||"")} · ${(section.measures||[]).length} groups</span></div>`;
    const scroll=document.createElement("div");scroll.className="tab-scroll";
    const grid=document.createElement("div");grid.className="tab-grid";grid.style.minWidth=`${Math.max(760,total*36)}px`;
    const labels=document.createElement("div");labels.className="string-labels";["e","B","G","D","A","E"].forEach(n=>{const d=document.createElement("div");d.className="string-label";d.textContent=n;labels.appendChild(d);});
    const staff=document.createElement("div");staff.className="staff";["e","B","G","D","A","E"].forEach(n=>{const l=document.createElement("span");l.className="string-line";l.style.top=`${STRING_Y[n]}px`;staff.appendChild(l);});
    let measureStart=0;
    (section.measures||[]).forEach((m,mi)=>{
      const left=(measureStart/total)*100,ml=document.createElement("span");ml.className="measure-line";ml.style.left=`${left}%`;staff.appendChild(ml);
      const lab=document.createElement("span");lab.className="measure-label";lab.style.left=`${left}%`;lab.textContent=m.label;staff.appendChild(lab);
      for(let b=1;b<Math.floor(m.duration);b++){const bl=document.createElement("span");bl.className="beat-line";bl.style.left=`${((measureStart+b)/total)*100}%`;staff.appendChild(bl);}
      (m.events||[]).forEach((e,ei)=>{if(e.type!=="note")return;const x=((measureStart+Number(e.start||0))/total)*100;
        const n=document.createElement("button");n.type="button";n.className=`note ${e.position}${e.anchor?" anchor":""}`;n.textContent=e.fret;n.style.left=`${x}%`;n.style.top=`${STRING_Y[e.string]}px`;n.dataset.section=section.id;n.dataset.measure=mi;n.dataset.event=ei;n.dataset.exactTiming="true";n.title=`${e.string} string · fret ${e.fret} · attack ${e.start} · duration ${e.duration} timing units`;n.onclick=()=>audition(section.id,mi,ei,n);staff.appendChild(n);
      });
      measureStart+=Number(m.duration||0);
    });
    const end=document.createElement("span");end.className="measure-line";end.style.left="100%";staff.appendChild(end);grid.append(labels,staff);scroll.appendChild(grid);sec.appendChild(scroll);host.appendChild(sec);
  });
  const leg=document.createElement("div");leg.className="legend";leg.innerHTML='<span><i class="lopen"></i>open</span><span><i class="llow"></i>frets 1–3</span><span><i class="lmid"></i>frets 3–5</span><span><i class="lupper"></i>frets 6–8</span><span><i class="lhigh"></i>frets 8–10</span><span>outlined = salvage anchor</span>';host.appendChild(leg);applySalvageVisuals();
}

function renderOrchestra(){
  let host=$("#orchestraPanel");
  if(!host){host=document.createElement("section");host.id="orchestraPanel";host.className="card orchestra-panel";$("#sectionButtons").before(host);}
  const sourceGroup=parts.find(p=>p.sourceDerived)?.playbackGroup||null;
  const playGroup=sourceGroup||primaryGroup;
  const rows=parts.map(p=>{
    const st=partState.get(p.id);
    const sectionRows=p.sections.map(s=>{const key=`${p.id}:${s.id}`,inst=sectionInstrument.get(key)||"";return `<div class="section-orch-row"><span>${safe(s.name)}</span><select data-section-inst="${safe(key)}"><option value="">Use part instrument</option>${instrumentOptions(inst)}</select></div>`;}).join("");
    const kind=p.sourceDerived?"source score":"practice";
    return `<div class="part-row" data-part="${safe(p.id)}" data-playback-group="${safe(p.playbackGroup)}"><label class="part-enable"><input type="checkbox" data-part-enabled="${safe(p.id)}" ${st.enabled?"checked":""}><b>${safe(p.name)}</b><small>${safe(p.role)} · ${kind}</small></label><select data-part-inst="${safe(p.id)}">${instrumentOptions(st.instrument)}</select><details><summary>Section overrides</summary>${sectionRows}</details></div>`;
  }).join("");
  const sourceCount=parts.filter(p=>p.playbackGroup===sourceGroup&&p.sourceDerived).length;
  const sourceTempo=sourceGroup?groupMeta(sourceGroup).tempoBpm:null;
  const buttonLabel=sourceGroup?"▶ Play source ensemble":"▶ Play full arrangement";
  const note=sourceGroup
    ?`${sourceCount} independent source-score parts. The source excerpt is isolated from the guitar practice reduction${sourceTempo?` · source MIDI tempo ♩=${sourceTempo}`:""}.`
    :"This song currently has one practice transcription; the player can host synchronized source parts when they are available.";
  host.innerHTML=`<div class="orchestra-head"><div><div class="eyebrow">Mini orchestra</div><h2>Orchestration</h2><p>Parts are grouped by provenance. Practice and source-score timelines never play together unless explicitly authored into the same group.</p></div><button id="playAllParts" data-playback-group="${safe(playGroup)}" class="primary">${buttonLabel}</button></div><div class="orchestra-grid">${rows}</div><div class="orchestra-note">${safe(note)}</div>`;
  host.querySelectorAll("[data-part-enabled]").forEach(el=>el.onchange=e=>{partState.get(e.target.dataset.partEnabled).enabled=e.target.checked;});
  host.querySelectorAll("[data-part-inst]").forEach(el=>el.onchange=e=>{const id=e.target.dataset.partInst;partState.get(id).instrument=e.target.value;if(id===primaryPart.id)$("#instrument").value=e.target.value;});
  host.querySelectorAll("[data-section-inst]").forEach(el=>el.onchange=e=>{const key=e.target.dataset.sectionInst;if(e.target.value)sectionInstrument.set(key,e.target.value);else sectionInstrument.delete(key);});
  $("#playAllParts").onclick=()=>{selectedSection=-1;cursor=0;renderSectionButtons();renderTabs();buildFlat();highlight();play(playGroup);};
}

const META_COLORS={creator:"#67d7ff",origin:"#7ee7c4",musical:"#b49cff",arrangement:"#70a8ff",difficulty:"#f0b35a",stats:"#72d59b",verification:"#ff8fa8"};
function metaGroup(label){const k=label.toLowerCase();if(/composer/.test(k))return"creator";if(/category|era|year|original/.test(k))return"origin";if(/meter|tempo|key/.test(k))return"musical";if(/difficulty|pinky|max fret/.test(k))return"difficulty";if(/confidence|method|source ensemble/.test(k))return"verification";if(/notes|anchors/.test(k))return"stats";return"arrangement";}
function renderMetadata(){
  const meta=[["Composer",song.identity.composer.name],["Category",song.origin.category],["Era",song.origin.era],["Year",song.origin.year??"—"],["Original key",song.origin.originalKey??"—"],["Arranged key",song.arrangement.arrangedKey??"—"],["Meter",song.musical.meter],["Tempo unit",song.musical.tempoUnit],["Difficulty",`${song.arrangement.difficulty.label} (${song.arrangement.difficulty.rating}/5)`],["Max fret",song.stats.maxFret],["Notes",song.stats.notes],["Anchors",song.stats.anchorNotes],["Note confidence",song.verification.notes.confidence],["Timing confidence",song.verification.timing.confidence],["Timing method",song.verification.timing.method],["Pinky required",song.arrangement.pinkyRequired?"yes":"no"]];
  if(song.verification.ensembleTiming){meta.push(["Source ensemble confidence",song.verification.ensembleTiming.confidence||"—"],["Source ensemble method",song.verification.ensembleTiming.method||"—"]);}
  if(song.playbackGroups?.ensemble?.tempoBpm)meta.push(["Source ensemble tempo",`♩ = ${song.playbackGroups.ensemble.tempoBpm}`]);
  $("#metaGrid").innerHTML=meta.map(([a,b])=>{const g=metaGroup(a);return `<div class="meta-item" data-meta-key="${keyify(a)}" data-meta-group="${g}" style="--meta-accent:${META_COLORS[g]}"><small>${safe(a)}</small><b>${safe(b)}</b></div>`;}).join("");
  $("#sourceList").innerHTML=(song.sources||[]).map(src=>`<li><a href="${safe(src.url)}" target="_blank" rel="noreferrer">${safe(src.label)}</a> — ${safe(src.kind)}</li>`).join("");
  $("#qualityNote").textContent=(song.verification.notesAboutQuality||[]).join(" ");
}
function renderAll(){stop(false);renderSectionButtons();renderTabs();buildFlat();highlight();renderOrchestra();renderMetadata();}

function ensureAudio(){if(!audio)audio=new(window.AudioContext||window.webkitAudioContext)();if(audio.state==="suspended")audio.resume();}
function hz(midi){return 440*Math.pow(2,(midi-69)/12);}
function track(n){nodes.push(n);return n;}
function osc(type,freq,start,stop,out,level=1,detune=0){const o=track(audio.createOscillator()),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(freq,start);o.detune.value=detune;g.gain.value=level;o.connect(g).connect(out);o.start(start);o.stop(stop);return o;}
function synthTone(midi,start,seconds,id,level=1){
  const inst=INSTRUMENTS[id]||INSTRUMENTS.guitar,f=hz(midi),dur=Math.max(.06,seconds);
  if(inst.family==="timpani"){const out=audio.createGain(),o=track(audio.createOscillator());o.type="sine";o.frequency.setValueAtTime(f*.72,start);o.frequency.exponentialRampToValueAtTime(f*.58,start+Math.min(.18,dur));out.gain.setValueAtTime(.0001,start);out.gain.exponentialRampToValueAtTime(.28*level,start+.008);out.gain.exponentialRampToValueAtTime(.0001,start+dur);o.connect(out).connect(audio.destination);o.start(start);o.stop(start+dur+.05);return;}
  const out=audio.createGain(),filter=audio.createBiquadFilter();filter.type="lowpass";
  let attack=.008,release=Math.min(.16,dur*.25),cutoff=3400,harm=[[1,"sine",1]];
  if(inst.family==="pluck"){attack=.004;release=Math.max(.05,dur*.55);cutoff=3000;harm=[[1,"triangle",1],[2,"sine",.18],[3,"sine",.06]];}
  if(inst.family==="key"){attack=.006;release=Math.max(.08,dur*.45);cutoff=5200;harm=[[1,"triangle",1],[2,"sine",.28],[3,"sine",.1]];}
  if(inst.family==="mallet"||inst.family==="bell"){attack=.003;release=Math.max(.08,dur*.7);cutoff=7000;harm=[[1,"sine",1],[2,"sine",.45],[3,"sine",.18],[4,"sine",.08]];}
  if(inst.family==="string"){attack=.055;release=.12;cutoff=2600;harm=[[1,"sawtooth",.72],[1,"triangle",.45],[2,"sine",.08]];}
  if(inst.family==="wind"){attack=.035;release=.09;cutoff=3200;harm=[[1,"sine",1],[2,"sine",.16],[3,"sine",.05]];}
  if(inst.family==="brass"){attack=.045;release=.11;cutoff=4200;harm=[[1,"sawtooth",.72],[1,"square",.12],[2,"sine",.08]];}
  if(inst.family==="organ"){attack=.018;release=.08;cutoff=5500;harm=[[1,"sine",1],[2,"sine",.42],[3,"sine",.2],[4,"sine",.12]];}
  if(inst.family==="choir"){attack=.085;release=.18;cutoff=2200;harm=[[1,"triangle",.75],[1,"sine",.55],[2,"sine",.12]];}
  filter.frequency.setValueAtTime(cutoff,start);out.gain.setValueAtTime(.0001,start);out.gain.linearRampToValueAtTime(.18*level,start+attack);const releaseStart=Math.max(start+attack+.01,start+dur-release);out.gain.setValueAtTime(.18*level,releaseStart);out.gain.exponentialRampToValueAtTime(.0001,start+dur);filter.connect(out).connect(audio.destination);harm.forEach(([mult,type,amt],i)=>osc(type,f*mult,start,start+dur+.04,filter,amt,i?0:(inst.family==="string"?-4:0)));
}
function clearTimers(){timers.forEach(clearTimeout);timers=[];}
function later(fn,ms){const id=setTimeout(fn,Math.max(0,ms));timers.push(id);}
function stopNodes(){nodes.forEach(n=>{try{n.stop();}catch(_){}});nodes=[];}
function stop(reset=true){runId++;playing=false;playingGroup=null;clearTimers();stopNodes();if(reset)cursor=0;document.querySelectorAll(".note.live,.note.next").forEach(n=>n.classList.remove("live","next"));updateButtons();highlight();updateStatus();}
function pause(){runId++;playing=false;playingGroup=null;clearTimers();stopNodes();updateButtons();updateStatus();}
function currentInstrument(part,section){return sectionInstrument.get(`${part.id}:${section.id}`)||partState.get(part.id)?.instrument||part.defaultInstrument||"guitar";}
function groupParts(group){return parts.filter(p=>p.playbackGroup===group&&partState.get(p.id)?.enabled);}
function allPlaybackEvents(group=primaryGroup){
  const salvage=group===primaryGroup&&$("#salvage").checked;
  if(salvage)return eventsForPart(primaryPart).filter(x=>x.event.anchor).map(x=>({...x,instrument:currentInstrument(primaryPart,x.section)}));
  return groupParts(group).flatMap(p=>eventsForPart(p).map(x=>({...x,instrument:currentInstrument(p,x.section)})));
}
function play(group=primaryGroup){
  const isPrimary=group===primaryGroup;
  if(isPrimary&&!flat.length)return;
  const all=allPlaybackEvents(group);
  if(!all.length)return;
  ensureAudio();stopNodes();clearTimers();playing=true;playingGroup=group;lastPlaybackGroup=group;updateButtons();updateStatus();
  const myRun=++runId,spu=secondsPerUnit(),gate=Number($("#gate").value)/100;
  const currentStart=isPrimary?(flat[cursor]?.start??0):0;
  const events=all.filter(x=>x.start>=currentStart-1e-6);
  const activeParts=Math.max(1,new Set(events.map(x=>x.part.id)).size);
  const mixLevel=Math.min(.9,1.2/Math.sqrt(activeParts));
  const audioStart=audio.currentTime+.08;
  events.forEach(x=>{const rel=(x.start-currentStart)*spu;synthTone(x.event.midi,audioStart+rel,Math.max(.06,Number(x.event.duration||.25)*spu*gate),x.instrument,mixLevel);});
  if(isPrimary){
    flat.map((x,i)=>({...x,flatIndex:i})).filter(x=>x.start>=currentStart-1e-6).forEach(x=>{const rel=(x.start-currentStart)*spu;later(()=>{if(myRun!==runId)return;cursor=x.flatIndex;highlight();updateStatus();},80+rel*1000);});
  }
  const last=events.reduce((a,b)=>(!a||b.start+Number(b.event.duration||0)>a.start+Number(a.event.duration||0))?b:a,null);
  const total=last?((last.start-currentStart)+Number(last.event.duration||0))*spu*1000:0;
  later(()=>{if(myRun!==runId)return;if(loop){if(isPrimary)cursor=0;play(group);}else{playing=false;playingGroup=null;updateButtons();updateStatus();}},total+160);
}
function findNoteEl(x){return document.querySelector(`.note[data-section="${CSS.escape(x.section.id)}"][data-measure="${x.mi}"][data-event="${x.ei}"]`);}
function highlight(){document.querySelectorAll(".note.live,.note.next").forEach(n=>n.classList.remove("live","next"));if(!flat.length)return;findNoteEl(flat[cursor])?.classList.add("live");if(flat[cursor+1])findNoteEl(flat[cursor+1])?.classList.add("next");}
function updateButtons(){$("#play").textContent=playing&&playingGroup===primaryGroup?"▶ Playing":"▶ Play";$("#loop").classList.toggle("active",loop);}
function updateStatus(){const total=flat.length,pos=total?cursor+1:0;$("#counter").textContent=`${pos} / ${total}`;$("#progress").style.width=total?`${(pos/total)*100}%`:"0%";if(playing){$("#status").textContent=`Playing · ${groupLabel(playingGroup)}`;return;}$("#status").textContent=$("#salvage")?.checked?`Salvage mode · ${total} anchors`:(cursor?"Paused / positioned":"Ready");}
function audition(sectionId,mi,ei,el){pause();ensureAudio();const section=primaryPart.sections.find(s=>s.id===sectionId),e=section.measures[mi].events[ei];synthTone(e.midi,audio.currentTime+.02,Math.max(.18,Number(e.duration||.25)*secondsPerUnit()),currentInstrument(primaryPart,section),1);document.querySelectorAll(".note.live").forEach(n=>n.classList.remove("live"));el.classList.add("live");later(()=>el.classList.remove("live"),500);}
function applySalvageVisuals(){document.body.classList.toggle("salvage-mode",Boolean($("#salvage")?.checked));}

function vlq(n){let b=[n&127];while(n>>=7)b.unshift((n&127)|128);return b;}
function u32(n){return[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];}
function u16(n){return[(n>>>8)&255,n&255];}
function exportMidi(){
  const group=lastPlaybackGroup||primaryGroup;
  const ppq=480,ticksPerUnit=ppq/unitsPerQuarter(),bpm=Number($("#tempo").value),us=Math.round(60000000/bpm);let ev=[0,0xFF,0x51,0x03,(us>>16)&255,(us>>8)&255,us&255],timeline=[];
  const enabled=groupParts(group).slice(0,15);
  enabled.forEach((p,pi)=>{const ch=pi>=9?pi+1:pi;let lastInst=null;eventsForPart(p).forEach(x=>{const inst=currentInstrument(p,x.section),prog=INSTRUMENTS[inst]?.program??0,t=Math.round(x.start*ticksPerUnit);if(prog!==lastInst){timeline.push({t,kind:"program",ch,prog});lastInst=prog;}const off=x.start+Number(x.event.duration||.25);timeline.push({t,kind:"on",ch,p:x.event.midi});timeline.push({t:Math.round(off*ticksPerUnit),kind:"off",ch,p:x.event.midi});});});
  timeline.sort((a,b)=>a.t-b.t||({off:0,program:1,on:2}[a.kind]-{off:0,program:1,on:2}[b.kind]));let last=0;timeline.forEach(x=>{ev.push(...vlq(x.t-last));if(x.kind==="program")ev.push(0xC0|x.ch,x.prog);else ev.push((x.kind==="on"?0x90:0x80)|x.ch,x.p,x.kind==="on"?94:48);last=x.t;});ev.push(0,0xFF,0x2F,0);
  const head=[...Array.from("MThd").map(c=>c.charCodeAt(0)),...u32(6),...u16(0),...u16(1),...u16(ppq)],tr=[...Array.from("MTrk").map(c=>c.charCodeAt(0)),...u32(ev.length),...ev],blob=new Blob([new Uint8Array([...head,...tr])],{type:"audio/midi"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`${slug}-${group}.mid`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function step(dir){pause();if(!flat.length)return;cursor=Math.max(0,Math.min(flat.length-1,cursor+dir));highlight();const x=flat[cursor],el=findNoteEl(x);if(el)audition(x.section.id,x.mi,x.ei,el);}

function bind(){
  $("#play").onclick=()=>playing?pause():play(primaryGroup);$("#pause").onclick=pause;$("#stop").onclick=()=>stop(true);$("#loop").onclick=()=>{loop=!loop;updateButtons();};$("#midi").onclick=exportMidi;
  $("#tempo").oninput=e=>{$("#tempoOut").textContent=e.target.value;if(playing){const group=playingGroup||primaryGroup;pause();play(group);}};$("#gate").oninput=e=>{$("#gateOut").textContent=`${e.target.value}%`;};
  $("#instrument").onchange=e=>{partState.get(primaryPart.id).instrument=e.target.value;renderOrchestra();};
  $("#salvage").onchange=()=>{pause();cursor=0;applySalvageVisuals();buildFlat();highlight();updateStatus();};
  document.addEventListener("keydown",e=>{if(["INPUT","SELECT","TEXTAREA"].includes(e.target.tagName))return;if(e.code==="Space"){e.preventDefault();playing?pause():play(primaryGroup);}if(e.code==="ArrowRight"){e.preventDefault();step(1);}if(e.code==="ArrowLeft"){e.preventDefault();step(-1);}});
}

async function init(){song=await fetch(`${rootPath}/data/songs/${slug}.json`).then(r=>{if(!r.ok)throw new Error(r.status);return r.json();});normalizeParts();renderHero();renderControls();bind();renderAll();}
init().catch(err=>{console.error(err);$("#status").textContent="Could not load song JSON.";});
