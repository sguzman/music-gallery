import fs from 'node:fs/promises';
import vm from 'node:vm';

class ClassList {
  add(){} remove(){} toggle(){}
}
class MockEl {
  constructor(id='') { this.id=id; this.dataset={}; this.style={setProperty(){}}; this.classList=new ClassList(); this.children=[]; this.value=''; this.checked=false; this.textContent=''; this.innerHTML=''; }
  appendChild(x){ this.children.push(x); return x; }
  append(...xs){ this.children.push(...xs); }
  before(){}
  querySelectorAll(){ return []; }
  setAttribute(){}
  addEventListener(){}
}

const ids = ['eyebrow','title','subtitle','badges','jsonLink','repoLink','tempo','tempoOut','gate','gateOut','instrument','sectionButtons','tabs','metaGrid','sourceList','qualityNote','play','pause','stop','loop','midi','salvage','status','progress','counter','playAllParts'];
const els = new Map(ids.map(id => [id,new MockEl(id)]));
els.get('gate').value='100';
els.get('salvage').checked=false;

const body=new MockEl('body'); body.dataset={song:'chopin-nocturne',root:'../..'};
const documentElement=new MockEl('html');
const document={
  body, documentElement,
  querySelector(sel){ if(sel.startsWith('#')) return els.get(sel.slice(1)) ?? new MockEl(sel); return new MockEl(sel); },
  querySelectorAll(){ return []; },
  createElement(tag){ return new MockEl(tag); },
  addEventListener(){}
};

const song=JSON.parse(await fs.readFile('data/songs/chopin-nocturne.json','utf8'));
if(!song.stats) throw new Error('Build did not materialize song.stats before smoke test');

const context={
  console, document,
  window:{ AudioContext:class{}, webkitAudioContext:class{} },
  CSS:{escape:s=>String(s)},
  fetch:async()=>({ok:true,json:async()=>song}),
  setTimeout:(fn)=>{ fn(); return 1; }, clearTimeout(){},
  Blob:class{}, URL:{createObjectURL(){return 'blob:test'},revokeObjectURL(){}},
  Uint8Array, Array, Object, Map, Math, Number, String, Boolean, JSON, Error
};
context.globalThis=context;
vm.createContext(context);
const source=await fs.readFile('assets/js/song-page-v2.js','utf8');
vm.runInContext(source,context,{filename:'song-page-v2.js'});
await new Promise(r=>setTimeout(r,0));
if(els.get('status').textContent==='Loading…') throw new Error('Player never left Loading state');
if(!els.get('tabs').children.length) throw new Error('Player did not render tab sections');
console.log('Player smoke test passed:', els.get('status').textContent, 'sections:', els.get('tabs').children.length);
