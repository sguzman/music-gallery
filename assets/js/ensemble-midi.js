import {partEvents} from "./ensemble-model.js";

export const GM_PROGRAMS={
  "piano":0,"harpsichord":6,"celesta":8,"glockenspiel":9,"music-box":10,"vibraphone":11,"marimba":12,"xylophone":13,"tubular-bells":14,"dulcimer":15,
  "organ":19,"nylon-guitar":24,"guitar":25,"acoustic-bass":32,"violin":40,"viola":41,"cello":42,"double-bass":43,"tremolo-strings":44,"pizzicato-strings":45,
  "harp":46,"timpani":47,"string-ensemble":48,"choir":52,"voice-oohs":53,"trumpet":56,"trombone":57,"tuba":58,"muted-trumpet":59,"french-horn":60,
  "brass-section":61,"oboe":68,"english-horn":69,"bassoon":70,"contrabassoon":70,"clarinet":71,"bass-clarinet":71,"piccolo":72,"flute":73,"recorder":74,
  "pan-flute":75,"whistle":78,"ocarina":79
};

function u16(n){return[(n>>>8)&255,n&255];}
function u32(n){return[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];}
function vlq(n){let bytes=[n&127];while(n>>=7)bytes.unshift((n&127)|128);return bytes;}
function ascii(text){return Array.from(new TextEncoder().encode(String(text)));}
function chunk(name,data){return[...ascii(name),...u32(data.length),...data];}
function metaText(type,text){const bytes=ascii(text);return[0,0xFF,type,...vlq(bytes.length),...bytes];}

function tempoTrack(bpm){
  const micros=Math.round(60000000/Number(bpm));
  return chunk("MTrk",[
    0,0xFF,0x51,0x03,(micros>>16)&255,(micros>>8)&255,micros&255,
    0,0xFF,0x2F,0
  ]);
}

function partTrack(part,index,{ppq,unitsPerQuarter,instrumentFor}){
  const channel=index>=9?index+1:index;
  const ticksPerUnit=ppq/unitsPerQuarter;
  const events=[];
  let lastProgram=null;
  for(const item of partEvents(part)){
    const instrument=instrumentFor(part,item.section);
    const program=GM_PROGRAMS[instrument]??0;
    const on=Math.round(item.start*ticksPerUnit);
    const off=Math.round((item.start+item.duration)*ticksPerUnit);
    if(program!==lastProgram){events.push({tick:on,kind:"program",program});lastProgram=program;}
    events.push({tick:on,kind:"on",note:item.event.midi});
    events.push({tick:off,kind:"off",note:item.event.midi});
  }
  const rank={off:0,program:1,on:2};
  events.sort((a,b)=>a.tick-b.tick||rank[a.kind]-rank[b.kind]);
  const data=[...metaText(0x03,part.name||part.id||`Part ${index+1}`)];
  let lastTick=0;
  for(const event of events){
    data.push(...vlq(event.tick-lastTick));
    if(event.kind==="program")data.push(0xC0|channel,event.program);
    else if(event.kind==="on")data.push(0x90|channel,event.note,94);
    else data.push(0x80|channel,event.note,48);
    lastTick=event.tick;
  }
  data.push(0,0xFF,0x2F,0);
  return chunk("MTrk",data);
}

export function buildEnsembleMidi(parts,{bpm=60,unitsPerQuarter=1,ppq=480,instrumentFor=(part)=>part.defaultInstrument||"piano"}={}){
  const enabled=(parts||[]).filter(Boolean).slice(0,15);
  if(!enabled.length)throw new Error("Cannot export an empty ensemble");
  if(!(Number(bpm)>0))throw new Error("MIDI tempo must be positive");
  if(!(Number(unitsPerQuarter)>0))throw new Error("unitsPerQuarter must be positive");
  const tracks=[tempoTrack(bpm),...enabled.map((part,index)=>partTrack(part,index,{ppq,unitsPerQuarter,instrumentFor}))];
  const header=[...ascii("MThd"),...u32(6),...u16(1),...u16(tracks.length),...u16(ppq)];
  return new Uint8Array([...header,...tracks.flat()]);
}
