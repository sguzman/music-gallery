import {firstAttack,groupDuration,midiName,timelineEvents} from "./ensemble-model.js";
import {buildEnsembleMidi} from "./ensemble-midi.js";

const body=document.body;
const slug=body.dataset.song;
const rootPath=body.dataset.root||"../..";
const $=selector=>document.querySelector(selector);

let song=null;
let primaryGroup="default";
let sourceGroup=null;
let sourceParts=[];
let practiceTempo=60;
let ensembleTempo=60;
let activeMode="default";
let visualTimers=[];
let activeCounts=new Map();

function safe(value){return String(value??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));}
function later(fn,ms){const id=setTimeout(fn,Math.max(0,ms));visualTimers.push(id);return id;}
function clearTimers(){visualTimers.forEach(clearTimeout);visualTimers=[];activeCounts.clear();}
function waitForPanel(){
  const existing=$("#orchestraPanel");
  if(existing)return Promise.resolve(existing);
  return new Promise(resolve=>{
    const observer=new MutationObserver(()=>{
      const panel=$("#orchestraPanel");
      if(panel){observer.disconnect();resolve(panel);}
    });
    observer.observe(document.body,{childList:true,subtree:true});
  });
}
function enabled(part){return $(`[data-part-enabled="${CSS.escape(part.id)}"]`)?.checked!==false;}
function partInstrument(part){return $(`[data-part-inst="${CSS.escape(part.id)}"]`)?.value||part.defaultInstrument||"piano";}
function instrumentFor(part,section){
  const key=`${part.id}:${section.id}`;
  return $(`[data-section-inst="${CSS.escape(key)}"]`)?.value||partInstrument(part);
}
function sourceTempo(){return Number(ensembleTempo)||Number(song?.playbackGroups?.[sourceGroup]?.tempoBpm)||Number(song?.musical?.defaultBpm)||60;}
function setMainTempo(value){
  const tempo=$("#tempo"),out=$("#tempoOut");
  if(!tempo)return;
  const bounded=Math.max(Number(tempo.min)||1,Math.min(Number(tempo.max)||999,Number(value)));
  tempo.value=String(bounded);
  if(out)out.textContent=String(bounded);
}
function setTrackMuted(partId,muted){
  $(`.ensemble-track[data-part="${CSS.escape(partId)}"]`)?.classList.toggle("muted",muted);
}
function setLive(partId,index,on){
  const note=$(`.ensemble-note-block[data-part="${CSS.escape(partId)}"][data-index="${index}"]`);
  if(note)note.classList.toggle("live",on);
  const count=Math.max(0,(activeCounts.get(partId)||0)+(on?1:-1));
  activeCounts.set(partId,count);
  $(`.ensemble-track[data-part="${CSS.escape(partId)}"]`)?.classList.toggle("live",count>0);
}
function clearVisual(){
  clearTimers();
  document.querySelectorAll(".ensemble-note-block.live,.ensemble-track.live").forEach(el=>el.classList.remove("live"));
  const playhead=$("#ensemblePlayhead");
  if(playhead){playhead.style.transition="none";playhead.style.left="0%";}
}
function startVisual(){
  clearVisual();
  if(!sourceParts.length)return;
  const total=groupDuration(sourceParts);
  const unitsPerQuarter=Number(song.musical.unitsPerQuarter)||1;
  const secondsPerUnit=60/sourceTempo()/unitsPerQuarter;
  const startDelay=80;
  const active=sourceParts.filter(enabled);
  active.forEach(part=>{
    timelineEvents(part,total).forEach(item=>{
      later(()=>setLive(part.id,item.index,true),startDelay+item.start*secondsPerUnit*1000);
      later(()=>setLive(part.id,item.index,false),startDelay+(item.start+item.duration)*secondsPerUnit*1000);
    });
  });
  const playhead=$("#ensemblePlayhead");
  if(playhead){
    playhead.style.transition="none";
    playhead.style.left="0%";
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      playhead.style.transition=`left ${total*secondsPerUnit}s linear`;
      playhead.style.left="100%";
    }));
  }
  later(clearVisual,startDelay+total*secondsPerUnit*1000+180);
}
function downloadSourceMidi(){
  const parts=sourceParts.filter(enabled);
  if(!parts.length)return;
  const bytes=buildEnsembleMidi(parts,{
    bpm:sourceTempo(),
    unitsPerQuarter:Number(song.musical.unitsPerQuarter)||1,
    instrumentFor
  });
  const blob=new Blob([bytes],{type:"audio/midi"});
  const link=document.createElement("a");
  link.href=URL.createObjectURL(blob);
  link.download=`${slug}-source-ensemble.mid`;
  link.click();
  setTimeout(()=>URL.revokeObjectURL(link.href),1000);
}
function renderTimeline(panel){
  if(!sourceParts.length)return;
  panel.querySelector("#ensembleTimeline")?.remove();
  const total=groupDuration(sourceParts)||1;
  const firstMeasure=sourceParts.flatMap(part=>part.sections||[]).flatMap(section=>section.measures||[])[0];
  const barUnits=Number(firstMeasure?.duration)||4;
  const barCount=Math.max(1,Math.round(total/barUnits));
  const ruler=Array.from({length:barCount},(_,i)=>`<span style="left:${(i/barCount)*100}%">${i+1}</span>`).join("");
  const bars=Array.from({length:barCount+1},(_,i)=>`<i style="left:${(i/barCount)*100}%"></i>`).join("");
  const tracks=sourceParts.map(part=>{
    const attack=firstAttack(part);
    const entrance=attack===null?"no notes":attack===0?"starts bar 1":`enters bar ${Math.floor(attack/barUnits)+1}`;
    const blocks=timelineEvents(part,total).map(item=>{
      const label=item.width>=2.2?item.pitch:"";
      return `<span class="ensemble-note-block" data-part="${safe(part.id)}" data-index="${item.index}" style="left:${item.left}%;width:${item.width}%" title="${safe(item.pitch)} · attack ${item.start} · duration ${item.duration}">${safe(label)}</span>`;
    }).join("");
    return `<div class="ensemble-track ${enabled(part)?"":"muted"}" data-part="${safe(part.id)}"><div class="ensemble-track-label"><b>${safe(part.name)}</b><small>${safe(entrance)}</small></div><div class="ensemble-lane">${bars}${blocks}</div></div>`;
  }).join("");
  const min=Number(song.musical.bpmRange?.[0])||30,max=Number(song.musical.bpmRange?.[1])||160;
  const timeline=document.createElement("section");
  timeline.id="ensembleTimeline";
  timeline.className="ensemble-timeline";
  timeline.dataset.playbackGroup=sourceGroup;
  timeline.innerHTML=`
    <div class="ensemble-timeline-head">
      <div><div class="eyebrow">Source-score timeline</div><h3>${safe(song.playbackGroups?.[sourceGroup]?.name||"Source ensemble")}</h3><p>Literal score time. Bright lanes are sounding; dim lanes are muted.</p></div>
      <div class="ensemble-timeline-actions">
        <label>Source tempo <input id="ensembleTempo" type="range" min="${min}" max="${max}" value="${sourceTempo()}"><b id="ensembleTempoOut">${sourceTempo()}</b></label>
        <button id="ensembleMidi">⇩ Source MIDI · ${sourceParts.length} tracks</button>
      </div>
    </div>
    <div class="ensemble-ruler"><div></div><div class="ensemble-ruler-bars">${ruler}</div></div>
    <div class="ensemble-tracks"><div id="ensemblePlayhead" class="ensemble-playhead"></div>${tracks}</div>
    <p class="ensemble-timeline-note">Practice tab and source ensemble are separate provenance objects. Switching modes swaps the shared tempo control; changing a live source part restarts the source excerpt so the new mute/instrument state is audible immediately.</p>`;
  const grid=panel.querySelector(".orchestra-grid");
  panel.insertBefore(timeline,grid||panel.querySelector(".orchestra-note"));
  $("#ensembleMidi").onclick=downloadSourceMidi;
}
function sourceIsPlaying(){return activeMode===sourceGroup&&$("#status")?.textContent.startsWith("Playing ·");}
function restartSourceIfPlaying(target){
  const row=target.closest?.('[data-playback-group]');
  if(!row||row.dataset.playbackGroup!==sourceGroup)return;
  if(target.matches?.('[data-part-enabled]'))setTrackMuted(target.dataset.partEnabled,!target.checked);
  if(sourceIsPlaying())later(()=>$("#playAllParts")?.click(),0);
}
function bindInteractionBridge(){
  document.addEventListener("click",event=>{
    const sourceButton=event.target.closest?.(`#playAllParts[data-playback-group="${CSS.escape(sourceGroup)}"]`);
    if(sourceButton){
      activeMode=sourceGroup;
      setMainTempo(sourceTempo());
      later(startVisual,0);
      return;
    }
    if(event.target.closest?.("#play")){
      activeMode=primaryGroup;
      setMainTempo(practiceTempo);
      clearVisual();
      return;
    }
    if(event.target.closest?.("#pause,#stop"))clearVisual();
  },true);
  document.addEventListener("input",event=>{
    if(event.target.id==="ensembleTempo"){
      ensembleTempo=Number(event.target.value);
      $("#ensembleTempoOut").textContent=String(ensembleTempo);
      if(activeMode===sourceGroup){
        setMainTempo(ensembleTempo);
        $("#tempo")?.dispatchEvent(new Event("input",{bubbles:true}));
        if(sourceIsPlaying())later(startVisual,0);
      }
      return;
    }
    if(event.target.id==="tempo"){
      if(activeMode===sourceGroup){ensembleTempo=Number(event.target.value);if($("#ensembleTempo"))$("#ensembleTempo").value=String(ensembleTempo);if($("#ensembleTempoOut"))$("#ensembleTempoOut").textContent=String(ensembleTempo);}
      else practiceTempo=Number(event.target.value);
    }
  });
  document.addEventListener("change",event=>restartSourceIfPlaying(event.target));
}

async function init(){
  const response=await fetch(`${rootPath}/data/songs/${slug}.json`);
  if(!response.ok)throw new Error(`song JSON ${response.status}`);
  song=await response.json();
  const allParts=Array.isArray(song.parts)?song.parts:[];
  const primary=allParts.find(part=>part.tab)||allParts[0];
  primaryGroup=primary?.playbackGroup||"default";
  sourceParts=allParts.filter(part=>part.sourceDerived);
  sourceGroup=sourceParts[0]?.playbackGroup||null;
  if(!sourceGroup||!sourceParts.length)return;
  practiceTempo=Number(song.musical.defaultBpm)||60;
  ensembleTempo=Number(song.playbackGroups?.[sourceGroup]?.tempoBpm)||practiceTempo;
  activeMode=primaryGroup;
  const panel=await waitForPanel();
  renderTimeline(panel);
  bindInteractionBridge();
}

init().catch(error=>console.error("Ensemble visualization failed",error));
