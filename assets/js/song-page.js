import {secondsPerUnit,midiMicrosPerQuarter,unitsToTicks,transportTempoBounds} from "./timing.js";

const body=document.body;
const slug=body.dataset.song;
const rootPath=body.dataset.root || "../..";
const $=s=>document.querySelector(s);
const STRING_Y={e:19,B:57,G:95,D:133,A:171,E:209};
const GM_PROGRAM={guitar:25,piano:0,celesta:8,violin:40,cello:42,strings:48,flute:73,oboe:68,clarinet:71,bassoon:70};

let song=null, viewMode="practice", selectedSection=-1, flat=[], cursor=0, playing=false, loop=false, audio=null, timers=[], nodes=[], runId=0;
let trackState=new Map(), trackBuses=new Map(), masterBus=null;
let transportUnit=0, transportStartUnit=0, transportAudioStart=0, scheduleIndex=0, schedulerTimer=null, transportFrame=null;
const AUDIO_START_LEAD=.12,SCHEDULER_LOOKAHEAD_SEC=.9,SCHEDULER_INTERVAL_MS=40;

function safe(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));}
function fullAvailable(){return song?.fullVersion?.status==="available" && Array.isArray(song.fullVersion.tracks) && song.fullVersion.tracks.length>0;}
function currentTiming(){return viewMode==="full" && fullAvailable()?song.fullVersion.musical:song.musical;}
function tempoSecondsPerUnit(){const t=currentTiming();return secondsPerUnit(Number($("#tempo").value),t?.unitsPerQuarter||1);}
function sourceTempoMap(){
  if(viewMode!=="full"||!fullAvailable())return [];
  const map=song.fullVersion.musical?.tempoMap;
  return Array.isArray(map)?map.filter(x=>Number.isFinite(Number(x.start))&&Number(x.bpm)>0).map(x=>({start:Number(x.start),bpm:Number(x.bpm)})).sort((a,b)=>a.start-b.start):[];
}
function tempoMapScale(){
  const t=currentTiming(),base=Number(t?.defaultBpm)||60,chosen=Number($("#tempo").value)||base;
  return chosen/base;
}
function transportSecondsAtUnit(unit){
  unit=Math.max(0,Number(unit)||0);
  const t=currentTiming(),upq=Number(t?.unitsPerQuarter)||1,map=sourceTempoMap();
  if(viewMode!=="full"||!map.length)return unit*secondsPerUnit(Number($("#tempo").value),upq);
  const scale=tempoMapScale();let sec=0,pos=0,bpm=map[0].start<=0?map[0].bpm:Number(t?.defaultBpm)||60,i=map[0].start<=0?1:0;
  for(;i<map.length&&map[i].start<unit;i++){
    const next=Math.max(pos,map[i].start);if(next>pos)sec+=(next-pos)*60/(bpm*scale*upq);
    pos=next;bpm=map[i].bpm;
  }
  if(unit>pos)sec+=(unit-pos)*60/(bpm*scale*upq);
  return sec;
}
function transportUnitAtSeconds(seconds){
  seconds=Math.max(0,Number(seconds)||0);
  const t=currentTiming(),upq=Number(t?.unitsPerQuarter)||1,map=sourceTempoMap();
  if(viewMode!=="full"||!map.length)return seconds/secondsPerUnit(Number($("#tempo").value),upq);
  const scale=tempoMapScale();let sec=0,pos=0,bpm=map[0].start<=0?map[0].bpm:Number(t?.defaultBpm)||60,i=map[0].start<=0?1:0;
  for(;i<map.length;i++){
    const next=Math.max(pos,map[i].start),span=(next-pos)*60/(bpm*scale*upq);
    if(seconds<=sec+span+1e-9)return pos+(seconds-sec)*(bpm*scale*upq)/60;
    sec+=span;pos=next;bpm=map[i].bpm;
  }
  return pos+(seconds-sec)*(bpm*scale*upq)/60;
}
function transportSecondsBetween(a,b){return Math.max(0,transportSecondsAtUnit(b)-transportSecondsAtUnit(a));}
function activeSections(){return selectedSection===-1?song.sections:[song.sections[selectedSection]];}
function trackEnabled(track){return trackState.get(track.id)!==false;}

function buildFlat(){
  flat=[];
  if(viewMode==="full"){
    if(!fullAvailable()){cursor=0;updateStatus();return;}

    song.fullVersion.tracks.forEach((track,ti)=>{
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
  const gate=$("#gate"),gateWrap=gate.closest(".range");
  gate.value=viewMode==="full"?100:(song.playback.gatePercent||86);$("#gateOut").textContent=`${gate.value}%`;if(gateWrap)gateWrap.hidden=viewMode==="full";
  const inst=$("#instrument"),labels={guitar:"Steel-string guitar",piano:"Piano",both:"Guitar + piano",celesta:"Celesta","guitar-celesta":"Guitar + celesta","guitar-piano":"Guitar + piano"};
  const pendingFull=viewMode==="full"&&!fullAvailable();
  ["play","pause","stop","loop","midi"].forEach(id=>{$("#"+id).disabled=pendingFull;});
  tempo.disabled=pendingFull;
  if(viewMode==="full"){inst.innerHTML='<option value="score">Score instruments</option>';inst.disabled=true;}
  else{inst.disabled=false;inst.innerHTML=song.playback.instrumentOptions.map(v=>`<option value="${v}" ${v===song.playback.defaultInstrument?"selected":""}>${labels[v]||v}</option>`).join("");}
}

function switchView(mode){
  stop(true);viewMode=mode;selectedSection=-1;cursor=0;transportUnit=0;renderControls(true);renderAll();
}

function renderViewSwitch(){
  const practice=$("#practiceView"),full=$("#fullView"),note=$("#viewDescription");
  practice.classList.toggle("active",viewMode==="practice");practice.setAttribute("aria-selected",String(viewMode==="practice"));
  full.classList.toggle("active",viewMode==="full");full.setAttribute("aria-selected",String(viewMode==="full"));full.disabled=false;
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

function clefProfile(track){
  const clef=track.clef||(track.defaultInstrument==="cello"||track.defaultInstrument==="bassoon"?"bass":"treble");
  return clef==="grand"?{name:"Grand",min:21,max:108}:clef==="bass"?{name:"Bass",min:34,max:65}:{name:"Treble",min:55,max:91};
}
function scoreY(track,midi){
  const p=clefProfile(track),clamped=Math.max(p.min,Math.min(p.max,midi));
  return 60-((clamped-p.min)/(p.max-p.min))*48;
}
function renderFull(){
  const host=$("#tabs");host.innerHTML="";host.className="card tab-wrap full-score-view";
  const fv=song.fullVersion,total=fullDuration(),enabled=fv.tracks.filter(trackEnabled),allNotes=fv.tracks.reduce((n,t)=>n+t.events.filter(e=>e.type==="note").length,0);
  const intro=document.createElement("div");intro.className="full-score-intro";
  const source=fv.provenance?.url?'<a href="'+safe(fv.provenance.url)+'" target="_blank" rel="noreferrer">'+safe(fv.provenance.provider||"source")+'</a>':safe(fv.provenance?.provider||"");
  intro.innerHTML='<div><span class="full-kicker">Full rendition</span><h2>'+safe(fv.label||"Full score")+'</h2><p>'+safe(fv.description||"")+'</p><div class="full-score-stats">'+fv.tracks.length+' tracks · '+allNotes.toLocaleString()+' note events · '+(fv.measures?.length||"?")+' measures</div></div><div class="full-source">Source: '+source+'<br>'+safe(fv.provenance?.license||"")+'<br>'+safe(fv.fidelity||"")+'</div>';
  host.appendChild(intro);

  const mixer=document.createElement("div");mixer.className="full-mixer";
  fv.tracks.forEach((track,ti)=>{
    const label=document.createElement("label");label.className="mixer-track"+(trackEnabled(track)?" active":"");label.dataset.track=ti;
    const check=document.createElement("input");check.type="checkbox";check.checked=trackEnabled(track);
    check.onchange=()=>setTrackEnabledLive(track,ti,check.checked);
    const swatch=document.createElement("span");swatch.className="track-swatch track-"+(ti%8);
    const txt=document.createElement("span");txt.innerHTML="<b>"+safe(track.name)+"</b><small>"+safe(track.instrumentLabel||track.defaultInstrument||"instrument")+" · "+safe(track.role||"part")+"</small>";
    label.append(check,swatch,txt);mixer.appendChild(label);
  });
  const actions=document.createElement("div");actions.className="mixer-actions";
  const all=document.createElement("button");all.textContent="All on";all.onclick=()=>setAllTracksLive(true);
  const none=document.createElement("button");none.textContent="All off";none.onclick=()=>setAllTracksLive(false);
  actions.append(all,none);mixer.appendChild(actions);host.appendChild(mixer);

  const scroll=document.createElement("div");scroll.className="score-scroll";
  const score=document.createElement("div");score.className="score-sheet";
  const measureWidth=112;score.style.width=Math.max(1100,(fv.measures?.length||Math.ceil(total/4))*measureWidth)+"px";
  fv.tracks.forEach((track,ti)=>{
    const row=document.createElement("section");row.className="score-row"+(trackEnabled(track)?"":" muted-track");row.dataset.track=ti;
    const label=document.createElement("div");label.className="score-track-label";
    const profile=clefProfile(track);
    label.innerHTML="<b>"+safe(track.name)+"</b><span>"+safe(track.instrumentLabel||track.defaultInstrument||"instrument")+"</span><small>"+profile.name+" clef · "+track.events.length+" notes</small>";
    const staff=document.createElement("div");staff.className="score-staff";staff.dataset.track=ti;
    staff.onclick=e=>{
      const rect=staff.getBoundingClientRect(),x=Math.max(0,Math.min(rect.width,e.clientX-rect.left));
      seekFullToUnits((x/rect.width)*total);
    };
    for(let l=0;l<5;l++){const line=document.createElement("span");line.className="score-staff-line";line.style.top=(20+l*10)+"px";staff.appendChild(line);}
    const clef=document.createElement("span");clef.className="score-clef";clef.textContent=profile.name==="Bass"?"𝄢":profile.name==="Grand"?"𝄞 𝄢":"𝄞";staff.appendChild(clef);
    const playhead=document.createElement("span");playhead.className="score-playhead";staff.appendChild(playhead);
    (fv.measures||[]).forEach((m,mi)=>{
      const ml=document.createElement("span");ml.className="score-measure-line";ml.style.left=(m.start/total*100)+"%";staff.appendChild(ml);
      if(mi%4===0||mi===fv.measures.length-1){const lab=document.createElement("span");lab.className="score-measure-label";lab.style.left=(m.start/total*100)+"%";lab.textContent=m.label;staff.appendChild(lab);}
    });
    const endLine=document.createElement("span");endLine.className="score-measure-line score-end-line";endLine.style.left="100%";staff.appendChild(endLine);
    track.events.forEach((e,ei)=>{
      if(e.type!=="note")return;
      const note=document.createElement("button");note.type="button";note.className="score-note track-"+(ti%8);note.dataset.track=ti;note.dataset.event=ei;
      note.style.left=(e.start/total*100)+"%";note.style.top=scoreY(track,e.midi)+"px";
      const width=Math.max(9,(e.duration/total)*parseFloat(score.style.width)*.86);note.style.width=Math.min(width,44)+"px";
      note.title=track.name+" · MIDI "+e.midi+" · measure "+(e.sourceMeasure??"?")+" · duration "+e.duration;
      note.onclick=ev=>{ev.stopPropagation();seekFullToUnits(e.start);};staff.appendChild(note);
    });
    row.append(label,staff);score.appendChild(row);
  });
  scroll.appendChild(score);host.appendChild(scroll);
  const footer=document.createElement("div");footer.className="score-footer";footer.textContent=enabled.length+"/"+fv.tracks.length+" tracks enabled. Mixer changes are live. Click anywhere on the score to seek without leaving the full rendition.";host.appendChild(footer);
}

function renderFullPending(){
  const host=$("#tabs");host.innerHTML="";host.className="card tab-wrap full-score-view";
  const fv=song.fullVersion||{},status=fv.status||"not-yet-modeled";
  const intro=document.createElement("div");intro.className="full-score-intro";
  intro.innerHTML='<div><span class="full-kicker">Full rendition</span><h2>'+safe(fv.label||"Full rendition")+'</h2><p>'+safe(fv.description||"A complete full-rendition event graph has not been ingested yet.")+'</p><div class="full-score-stats">Status: '+safe(status.replaceAll("-"," "))+'</div></div>';
  host.appendChild(intro);
  const panel=document.createElement("div");panel.className="pending-rendition";
  const prov=fv.provenance||{},items=[];
  if(prov.evidenceState)items.push(["Evidence state",prov.evidenceState]);
  if(fv.fidelityTarget)items.push(["Target fidelity",fv.fidelityTarget]);
  if(Array.isArray(prov.knownInstrumentation))items.push(["Known instrumentation",prov.knownInstrumentation.join(", ")]);
  if(Array.isArray(prov.witnesses))prov.witnesses.forEach((w,i)=>items.push(["Witness "+(i+1),[w.provider,w.format,w.url].filter(Boolean).join(" · ")]));
  if(!items.length)items.push(["State","The complete event graph has not yet been admitted."]);
  panel.innerHTML=items.map(([k,v])=>'<div class="pending-item"><small>'+safe(k)+'</small><b>'+safe(v)+'</b></div>').join("");
  host.appendChild(panel);
  const note=document.createElement("div");note.className="score-footer";note.textContent="This is not a source-absence claim. The tab is visible so the exact remaining ingestion/provenance state is inspectable instead of hidden behind a disabled control.";host.appendChild(note);
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
function renderAll(){stop(false);renderViewSwitch();renderSectionButtons();if(viewMode==="full"){fullAvailable()?renderFull():renderFullPending();}else renderPractice();buildFlat();highlight();renderMetadata();renderHelp();}

function ensureAudio(){
  if(!audio){
    audio=new (window.AudioContext||window.webkitAudioContext)();
    const comp=audio.createDynamicsCompressor();
    comp.threshold.value=-12;comp.knee.value=18;comp.ratio.value=3;comp.attack.value=.008;comp.release.value=.18;
    const gain=audio.createGain();gain.gain.value=.9;comp.connect(gain).connect(audio.destination);masterBus={input:comp,gain};
  }
  if(audio.state==="suspended")audio.resume();
}
function hz(midi){return 440*Math.pow(2,(midi-69)/12);}
function trackNode(n){
  nodes.push(n);
  if(n.addEventListener)n.addEventListener("ended",()=>{const i=nodes.indexOf(n);if(i>=0)nodes.splice(i,1);},{once:true});
  return n;
}
function trackDestination(track){
  ensureAudio();
  let bus=trackBuses.get(track.id);
  if(!bus){
    const gain=audio.createGain();gain.gain.value=trackEnabled(track)?1:0;
    if(audio.createStereoPanner){
      const pan=audio.createStereoPanner();pan.pan.value=Math.max(-1,Math.min(1,track.pan??0));gain.connect(pan).connect(masterBus.input);bus={gain,pan};
    }else{gain.connect(masterBus.input);bus={gain,pan:null};}
    trackBuses.set(track.id,bus);
  }
  return bus.gain;
}
function setTrackGain(track,enabled){
  if(!audio)return;
  const node=trackDestination(track),param=node.gain,now=audio.currentTime;
  param.cancelScheduledValues(now);param.setValueAtTime(param.value,now);param.linearRampToValueAtTime(enabled?1:0,now+.025);
}
function setTrackEnabledLive(track,ti,enabled){
  trackState.set(track.id,enabled);setTrackGain(track,enabled);
  document.querySelector('.mixer-track[data-track="'+ti+'"]')?.classList.toggle("active",enabled);
  document.querySelector('.score-row[data-track="'+ti+'"]')?.classList.toggle("muted-track",!enabled);
  const cb=document.querySelector('.mixer-track[data-track="'+ti+'"] input');if(cb)cb.checked=enabled;
  const footer=document.querySelector(".score-footer");if(footer){const n=song.fullVersion.tracks.filter(trackEnabled).length;footer.textContent=n+"/"+song.fullVersion.tracks.length+" tracks enabled. Mixer changes are live. Click anywhere on the score to seek without leaving the full rendition.";}
}
function setAllTracksLive(enabled){song.fullVersion.tracks.forEach((track,ti)=>setTrackEnabledLive(track,ti,enabled));}
function envelope(start,hold,peak=.18,attack=.006,release=.24,destination=null){
  const g=audio.createGain(),dest=destination||audio.destination,end=start+Math.max(attack+.02,hold),tail=end+release;
  g.gain.setValueAtTime(.0001,start);g.gain.exponentialRampToValueAtTime(peak,start+attack);
  g.gain.linearRampToValueAtTime(Math.max(.0002,peak*.72),end);
  g.gain.exponentialRampToValueAtTime(.0001,tail);g.connect(dest);return {gain:g,stop:tail+.04};
}
function pianoRegisterGain(midi){
  const m=Number(midi);
  if(!Number.isFinite(m)||m>=60)return 1;
  if(m<=36)return 2;
  return 1+(60-m)/24;
}
function piano(midi,start,seconds,level=1,destination=null){
  const low=Math.max(0,Math.min(1,(60-Number(midi))/24)),registerGain=pianoRegisterGain(midi);
  const env=envelope(start,seconds,.17*level*registerGain,.006,.55,destination);
  [[1,"triangle",1],[2,"sine",.30+.28*low],[3,"sine",.11+.10*low],[4,"sine",.05*low]].forEach(([mult,type,amt])=>{
    if(amt<=0)return;
    const o=trackNode(audio.createOscillator()),g=audio.createGain();
    o.type=type;o.frequency.setValueAtTime(hz(midi)*mult,start);g.gain.value=amt;
    o.connect(g).connect(env.gain);o.start(start);o.stop(env.stop);
  });
}
function guitar(midi,start,seconds,level=1,destination=null){const env=envelope(start,seconds,.21*level,.004,.34,destination),body=audio.createBiquadFilter(),o=trackNode(audio.createOscillator()),h=trackNode(audio.createOscillator()),hg=audio.createGain();body.type="lowpass";body.frequency.setValueAtTime(4200,start);body.frequency.exponentialRampToValueAtTime(900,start+Math.max(.12,seconds));o.type="triangle";o.frequency.setValueAtTime(hz(midi),start);h.type="sine";h.frequency.setValueAtTime(hz(midi)*2,start);hg.gain.setValueAtTime(.12,start);hg.gain.exponentialRampToValueAtTime(.0001,start+Math.max(.07,seconds*.62));o.connect(body);h.connect(hg).connect(body);body.connect(env.gain);o.start(start);h.start(start);o.stop(env.stop);h.stop(env.stop);}
function celesta(midi,start,seconds,level=1,destination=null){const env=envelope(start,seconds,.15*level,.003,.38,destination);[[1,1],[2,.48],[3,.22],[4,.1],[6,.05]].forEach(([mult,amt])=>{const o=trackNode(audio.createOscillator()),g=audio.createGain();o.type="sine";o.frequency.setValueAtTime(hz(midi)*mult,start);g.gain.setValueAtTime(amt,start);g.gain.exponentialRampToValueAtTime(.0001,start+Math.max(.07,seconds*(mult===1?1:.62)));o.connect(g).connect(env.gain);o.start(start);o.stop(env.stop);});}
function bowed(midi,start,seconds,level=1,kind="violin",destination=null){
  const cello=kind==="cello",registerGain=cello?orchestralRegisterGain(midi,55,1.7):1,env=envelope(start,seconds,(cello?.18:.085)*level*registerGain,.035,cello?.34:.26,destination),f=audio.createBiquadFilter(),o=trackNode(audio.createOscillator());
  o.type=cello?"triangle":"sawtooth";o.frequency.setValueAtTime(hz(midi),start);f.type="lowpass";f.frequency.value=cello?2200:3400;o.connect(f).connect(env.gain);
  if(cello&&midi<48){const h=trackNode(audio.createOscillator()),hg=audio.createGain();h.type="sine";h.frequency.value=hz(midi)*2;hg.gain.value=.24;h.connect(hg).connect(env.gain);h.start(start);h.stop(env.stop);}
  o.start(start);o.stop(env.stop);
}
function voiceTone(midi,start,seconds,level=1,destination=null){
  const env=envelope(start,seconds,.14*level,.02,.36,destination),o=trackNode(audio.createOscillator());o.type="sawtooth";o.frequency.setValueAtTime(hz(midi),start);
  const voiceBody=audio.createBiquadFilter(),bodyGain=audio.createGain();
  voiceBody.type="lowpass";voiceBody.frequency.value=1900;voiceBody.Q.value=.7;bodyGain.gain.value=.68;
  o.connect(voiceBody).connect(bodyGain).connect(env.gain);
  [[650,.40,3.0],[1200,.25,3.4],[2500,.14,4.0]].forEach(([freq,amp,q])=>{const f=audio.createBiquadFilter(),g=audio.createGain();f.type="bandpass";f.frequency.value=freq;f.Q.value=q;g.gain.value=amp;o.connect(f).connect(g).connect(env.gain);});
  o.start(start);o.stop(env.stop);
}
function orchestralRegisterGain(midi,knee=55,maxGain=1.7){
  const m=Number(midi);if(!Number.isFinite(m)||m>=knee)return 1;
  return Math.min(maxGain,1+(knee-m)/24*(maxGain-1));
}
function fluteTone(midi,start,seconds,level=1,destination=null){
  const env=envelope(start,seconds,.12*level,.018,.24,destination),fund=hz(midi);
  [[1,"sine",1],[2,"sine",.16],[3,"sine",.05]].forEach(([mult,type,amt])=>{if(fund*mult>17000)return;const o=trackNode(audio.createOscillator()),g=audio.createGain();o.type=type;o.frequency.value=fund*mult;g.gain.value=amt;o.connect(g).connect(env.gain);o.start(start);o.stop(env.stop);});
}
function oboeTone(midi,start,seconds,level=1,destination=null){
  const env=envelope(start,seconds,.105*level,.022,.28,destination),o=trackNode(audio.createOscillator()),f=audio.createBiquadFilter();
  o.type="sawtooth";o.frequency.value=hz(midi);f.type="bandpass";f.frequency.value=1150;f.Q.value=.7;o.connect(f).connect(env.gain);o.start(start);o.stop(env.stop);
}
function clarinetTone(midi,start,seconds,level=1,destination=null){
  const env=envelope(start,seconds,.12*level*orchestralRegisterGain(midi,52,1.35),.018,.30,destination),o=trackNode(audio.createOscillator()),f=audio.createBiquadFilter();
  o.type="square";o.frequency.value=hz(midi);f.type="lowpass";f.frequency.value=2300;f.Q.value=.5;o.connect(f).connect(env.gain);o.start(start);o.stop(env.stop);
}
function bassoonTone(midi,start,seconds,level=1,destination=null){
  const boost=orchestralRegisterGain(midi,58,1.65),env=envelope(start,seconds,.13*level*boost,.025,.34,destination),o=trackNode(audio.createOscillator()),f=audio.createBiquadFilter();
  o.type="sawtooth";o.frequency.value=hz(midi);f.type="lowpass";f.frequency.value=1450;f.Q.value=.6;o.connect(f).connect(env.gain);o.start(start);o.stop(env.stop);
}
function hornTone(midi,start,seconds,level=1,destination=null){
  const boost=orchestralRegisterGain(midi,55,1.35),env=envelope(start,seconds,.12*level*boost,.035,.38,destination),o=trackNode(audio.createOscillator()),f=audio.createBiquadFilter();
  o.type="sawtooth";o.frequency.value=hz(midi);f.type="lowpass";f.frequency.value=1050;f.Q.value=.45;o.connect(f).connect(env.gain);o.start(start);o.stop(env.stop);
}
function generic(midi,start,seconds,level=1,destination=null){const env=envelope(start,seconds,.10*level*orchestralRegisterGain(midi,50,1.35),.012,.30,destination),o=trackNode(audio.createOscillator());o.type="triangle";o.frequency.value=hz(midi);o.connect(env.gain);o.start(start);o.stop(env.stop);}
function toneFor(mode,midi,start,seconds,level=1,destination=null){if(mode==="guitar")guitar(midi,start,seconds,level,destination);else if(mode==="piano")piano(midi,start,seconds,level,destination);else if(mode==="celesta")celesta(midi,start,seconds,level,destination);else if(mode==="voice")voiceTone(midi,start,seconds,level,destination);else if(mode==="flute")fluteTone(midi,start,seconds,level,destination);else if(mode==="oboe")oboeTone(midi,start,seconds,level,destination);else if(mode==="clarinet")clarinetTone(midi,start,seconds,level,destination);else if(mode==="bassoon")bassoonTone(midi,start,seconds,level,destination);else if(mode==="horn")hornTone(midi,start,seconds,level,destination);else if(mode==="violin"||mode==="strings")bowed(midi,start,seconds,level,"violin",destination);else if(mode==="cello")bowed(midi,start,seconds,level,"cello",destination);else if(mode==="both"||mode==="guitar-piano"){guitar(midi,start,seconds,.68*level,destination);piano(midi,start,seconds,.60*level,destination);}else if(mode==="guitar-celesta"){guitar(midi,start,seconds,.64*level,destination);celesta(midi,start,seconds,.68*level,destination);}else generic(midi,start,seconds,level,destination);}
function toneForEntry(x,start,seconds){if(x.mode==="full")toneFor(x.track.defaultInstrument||"strings",x.event.midi,start,seconds,x.track.level??1,trackDestination(x.track));else toneFor($("#instrument").value,x.event.midi,start,seconds,1);}

function clearTimers(){timers.forEach(clearTimeout);timers=[];}
function later(fn,ms){const id=setTimeout(fn,Math.max(0,ms));timers.push(id);}
function stopNodes(){nodes.slice().forEach(n=>{try{n.stop();}catch(_){}});nodes=[];}
function clearScheduler(){if(schedulerTimer){clearTimeout(schedulerTimer);schedulerTimer=null;}if(transportFrame){cancelAnimationFrame(transportFrame);transportFrame=null;}}
function clearHighlights(){document.querySelectorAll(".note.live,.note.next,.note.dimmed,.score-note.live,.score-note.next").forEach(n=>n.classList.remove("live","next","dimmed"));}
function playbackEndUnit(){
  if(viewMode==="full"&&fullAvailable())return fullDuration();
  return flat.reduce((m,x)=>Math.max(m,x.start+x.event.duration),0);
}
function transportUnitForAudioTime(contextTime){
  if(!playing||!audio)return transportUnit;
  const elapsed=Math.max(0,Number(contextTime)-transportAudioStart);
  if(viewMode==="full"&&sourceTempoMap().length){
    const startSec=transportSecondsAtUnit(transportStartUnit);
    return Math.min(playbackEndUnit(),transportUnitAtSeconds(startSec+elapsed));
  }
  const secPerUnit=tempoSecondsPerUnit();
  return Math.min(playbackEndUnit(),transportStartUnit+elapsed/secPerUnit);
}
function audibleContextTime(){
  if(!audio)return 0;
  if(typeof audio.getOutputTimestamp==="function"){
    try{
      const stamp=audio.getOutputTimestamp();
      if(Number.isFinite(stamp?.contextTime)&&stamp.contextTime>=0)return stamp.contextTime;
    }catch(_){}
  }
  const outputLag=Math.max(Number(audio.outputLatency)||0,Number(audio.baseLatency)||0);
  return Math.max(0,audio.currentTime-outputLag);
}
function currentTransportUnit(){return transportUnitForAudioTime(audibleContextTime());}
function schedulerTransportUnit(){return transportUnitForAudioTime(audio?.currentTime??0);}
function lowerBoundStart(unit){
  let lo=0,hi=flat.length;
  while(lo<hi){const mid=(lo+hi)>>1;if(flat[mid].start<unit)lo=mid+1;else hi=mid;}
  return lo;
}
function lastOnsetIndex(unit){
  const i=lowerBoundStart(unit+1e-7)-1;return Math.max(0,Math.min(flat.length-1,i));
}
function stop(reset=true){
  const pos=currentTransportUnit();runId++;playing=false;clearScheduler();clearTimers();stopNodes();
  transportUnit=reset?0:pos;if(reset)cursor=0;else if(flat.length)cursor=lastOnsetIndex(transportUnit);
  clearHighlights();updateButtons();highlight();updateStatus();
}
function pause(){
  if(!playing)return;
  const pos=currentTransportUnit();runId++;playing=false;clearScheduler();stopNodes();transportUnit=pos;if(flat.length)cursor=lastOnsetIndex(pos);updateButtons();highlight();updateStatus();
}
function activePlayEvents(){if(viewMode==="full")return flat.map((x,i)=>({...x,flatIndex:i}));const anchorsOnly=$("#salvage").checked;return flat.map((x,i)=>({...x,flatIndex:i})).filter(x=>!anchorsOnly||x.event.anchor);}
function scheduleEntry(x,unitNow,horizonUnit,gate){
  const endUnit=x.start+x.event.duration;if(endUnit<=unitNow+1e-8)return;
  const overlap=Math.max(0,unitNow-x.start),effectiveStart=Math.max(unitNow,x.start);
  const when=overlap>0?audio.currentTime+.018:transportAudioStart+transportSecondsBetween(transportStartUnit,x.start);
  if(when>audio.currentTime+.75)return;
  const seconds=viewMode==="full"?transportSecondsBetween(effectiveStart,endUnit):Math.max(.001,endUnit-effectiveStart)*tempoSecondsPerUnit();
  toneForEntry(x,Math.max(audio.currentTime+.012,when),Math.max(.045,seconds*gate));
}
function schedulerStep(myRun){
  if(!playing||myRun!==runId)return;
  const unitNow=schedulerTransportUnit(),nowSec=transportSecondsAtUnit(unitNow),horizonUnit=transportUnitAtSeconds(nowSec+SCHEDULER_LOOKAHEAD_SEC),gate=viewMode==="full"?1:Number($("#gate").value)/100,candidates=activePlayEvents();
  while(scheduleIndex<candidates.length&&candidates[scheduleIndex].start<horizonUnit){
    scheduleEntry(candidates[scheduleIndex],unitNow,horizonUnit,gate);scheduleIndex++;
  }
  schedulerTimer=setTimeout(()=>schedulerStep(myRun),SCHEDULER_INTERVAL_MS);
}
function visualStep(myRun){
  if(!playing||myRun!==runId)return;
  const unit=currentTransportUnit(),end=playbackEndUnit();
  if(flat.length){const idx=lastOnsetIndex(unit);if(idx!==cursor){cursor=idx;highlight();}else updatePlayhead(unit);}
  updateStatus(unit);
  if(unit>=end-.002){
    if(loop){transportUnit=0;playing=false;clearScheduler();stopNodes();cursor=0;play();return;}
    playing=false;transportUnit=end;clearScheduler();stopNodes();updateButtons();highlight();updateStatus(end);return;
  }
  transportFrame=requestAnimationFrame(()=>visualStep(myRun));
}
function play(){
  if(!flat.length)return;
  clearScheduler();stopNodes();ensureAudio();
  const end=playbackEndUnit();if(transportUnit>=end-.002)transportUnit=0;
  if(transportUnit===0&&cursor>0)transportUnit=flat[cursor]?.start??0;
  playing=true;const myRun=++runId;
  transportStartUnit=transportUnit;transportAudioStart=audio.currentTime+AUDIO_START_LEAD;
  const candidates=activePlayEvents();scheduleIndex=0;
  while(scheduleIndex<candidates.length&&candidates[scheduleIndex].start+candidates[scheduleIndex].event.duration<=transportStartUnit+1e-8)scheduleIndex++;
  if(viewMode==="practice"&&$("#salvage").checked)document.querySelectorAll(".note:not(.anchor)").forEach(n=>n.classList.add("dimmed"));
  updateButtons();schedulerStep(myRun);visualStep(myRun);
}
function seekFullToUnits(units){
  if(viewMode!=="full"||!flat.length)return;
  const wasPlaying=playing,target=Math.max(0,Math.min(fullDuration(),units));
  runId++;playing=false;clearScheduler();stopNodes();transportUnit=target;cursor=lastOnsetIndex(target);highlight();updateButtons();updateStatus(target);
  if(wasPlaying)play();
}
function updatePlayhead(unit=currentTransportUnit()){
  if(viewMode!=="full"||!fullAvailable())return;
  const p=Math.max(0,Math.min(100,unit/fullDuration()*100));
  document.querySelectorAll(".score-playhead").forEach(el=>el.style.left=p+"%");
}
function findNoteEl(x){return x.mode==="full"?document.querySelector(`.score-note[data-track="${x.ti}"][data-event="${x.ei}"]`):document.querySelector(`.note[data-section="${CSS.escape(x.section.id)}"][data-measure="${x.mi}"][data-event="${x.ei}"]`);}
function highlight(){document.querySelectorAll(".note.live,.note.next,.score-note.live,.score-note.next").forEach(n=>n.classList.remove("live","next"));if(!flat.length){updatePlayhead();return;}const start=flat[cursor].start;flat.forEach(x=>{if(Math.abs(x.start-start)<1e-8)findNoteEl(x)?.classList.add("live");});const next=flat.find(x=>x.start>start+1e-8);if(next){const ns=next.start;flat.forEach(x=>{if(Math.abs(x.start-ns)<1e-8)findNoteEl(x)?.classList.add("next");});}updatePlayhead();}
function updateButtons(){$("#play").textContent=playing?"▶ Playing":"▶ Play";$("#loop").classList.toggle("active",loop);}
function updateStatus(unit=currentTransportUnit()){const total=flat.length,pos=total?cursor+1:0;$("#counter").textContent=`${pos} / ${total}`;const end=playbackEndUnit(),p=end?Math.max(0,Math.min(1,unit/end)):0;$("#progress").style.width=`${p*100}%`;$("#status").textContent=playing?"Playing":(transportUnit>0?"Paused / positioned":"Ready");}
function auditionPractice(sectionId,mi,ei,el){pause();ensureAudio();const section=song.sections.find(s=>s.id===sectionId),e=section.measures[mi].events[ei];toneFor($("#instrument").value,e.midi,audio.currentTime+.02,Math.max(.18,e.duration*tempoSecondsPerUnit()*Number($("#gate").value)/100));document.querySelectorAll(".note.live").forEach(n=>n.classList.remove("live"));el.classList.add("live");later(()=>el.classList.remove("live"),500);}
function auditionFull(ti,ei,el){const e=song.fullVersion.tracks[ti].events[ei];seekFullToUnits(e.start);}

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
  const ppq=480,timing=currentTiming(),units=timing.unitsPerQuarter||1,bpm=Number($("#tempo").value),tracks=song.fullVersion.tracks.filter(trackEnabled),map=sourceTempoMap(),scale=tempoMapScale();
  const tempoTimeline=(map.length?map:[{start:0,bpm}]).map(x=>({t:unitsToTicks(x.start,units,ppq),bpm:map.length?x.bpm*scale:bpm})).sort((a,b)=>a.t-b.t);
  if(!tempoTimeline.length||tempoTimeline[0].t>0)tempoTimeline.unshift({t:0,bpm});
  let tempo=[],lastTempoTick=0;
  tempoTimeline.forEach(x=>{const us=midiMicrosPerQuarter(x.bpm);tempo.push(...vlq(x.t-lastTempoTick),0xFF,0x51,0x03,(us>>16)&255,(us>>8)&255,us&255);lastTempoTick=x.t;});
  tempo.push(0,0xFF,0x2F,0);const chunks=[chunk(tempo)];
  tracks.forEach((track,i)=>{const channel=i>=9?i+1:i,name=[...new TextEncoder().encode(track.name)].slice(0,120),program=track.gmProgram??GM_PROGRAM[track.defaultInstrument]??0;let ev=[0,0xFF,0x03,name.length,...name,0,0xC0|(channel&15),program],timeline=[];track.events.forEach(e=>{if(e.type!=="note")return;const t=unitsToTicks(e.start,units,ppq),dur=Math.max(1,unitsToTicks(e.duration,units,ppq));timeline.push({t,on:true,p:e.midi});timeline.push({t:t+dur,on:false,p:e.midi});});timeline.sort((a,b)=>a.t-b.t||(a.on?1:-1));let last=0;timeline.forEach(x=>{ev.push(...vlq(x.t-last),(x.on?0x90:0x80)|(channel&15),x.p,x.on?(track.velocity??84):48);last=x.t;});ev.push(0,0xFF,0x2F,0);chunks.push(chunk(ev));});
  const head=[...Array.from("MThd").map(c=>c.charCodeAt(0)),...u32(6),...u16(1),...u16(chunks.length),...u16(ppq)];downloadMidi([...head,...chunks.flat()],`${slug}-full.mid`);
}
function exportMidi(){viewMode==="full"&&fullAvailable()?exportFullMidi():exportPracticeMidi();}

function bind(){
  $("#play").onclick=()=>playing?pause():play();$("#pause").onclick=pause;$("#stop").onclick=()=>stop(true);$("#loop").onclick=()=>{loop=!loop;updateButtons();};$("#midi").onclick=exportMidi;
  $("#practiceView").onclick=()=>switchView("practice");$("#fullView").onclick=()=>switchView("full");
  $("#tempo").oninput=e=>{const wasPlaying=playing;if(wasPlaying)pause();$("#tempoOut").textContent=`${e.target.value} BPM`;if(wasPlaying)play();};$("#gate").oninput=e=>{$("#gateOut").textContent=`${e.target.value}%`;};
  document.addEventListener("keydown",e=>{if(["INPUT","SELECT","TEXTAREA"].includes(e.target.tagName))return;if(e.code==="Space"){e.preventDefault();playing?pause():play();}if(e.code==="ArrowRight"||e.code==="ArrowLeft"){e.preventDefault();pause();cursor=e.code==="ArrowRight"?Math.min(flat.length-1,cursor+1):Math.max(0,cursor-1);highlight();const x=flat[cursor],el=x?findNoteEl(x):null;if(x&&el){if(x.mode==="full")auditionFull(x.ti,x.ei,el);else auditionPractice(x.section.id,x.mi,x.ei,el);}}});
}
async function init(){
  song=await fetch(`${rootPath}/data/songs/${slug}.json`).then(r=>{if(!r.ok)throw new Error(r.status);return r.json();});
  if(fullAvailable())song.fullVersion.tracks.forEach(t=>trackState.set(t.id,t.enabled!==false));
  renderHero();renderControls(true);bind();renderAll();
}
init().catch(err=>{console.error(err);$("#status").textContent="Could not load song JSON.";});
