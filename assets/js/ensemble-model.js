export function sectionDuration(section){
  return (section?.measures||[]).reduce((sum,measure)=>sum+Number(measure.duration||0),0);
}

export function partDuration(part){
  return (part?.sections||[]).reduce((sum,section)=>sum+sectionDuration(section),0);
}

export function partEvents(part){
  const events=[];
  let sectionBase=0;
  (part?.sections||[]).forEach((section,sectionIndex)=>{
    let measureBase=0;
    (section.measures||[]).forEach((measure,measureIndex)=>{
      (measure.events||[]).forEach((event,eventIndex)=>{
        if(event.type!=="note")return;
        events.push({
          part,
          section,
          sectionIndex,
          measure,
          measureIndex,
          event,
          eventIndex,
          start:sectionBase+measureBase+Number(event.start||0),
          duration:Number(event.duration||0)
        });
      });
      measureBase+=Number(measure.duration||0);
    });
    sectionBase+=sectionDuration(section);
  });
  return events;
}

export function groupDuration(parts){
  return Math.max(0,...(parts||[]).map(partDuration));
}

export function midiName(midi){
  const n=Number(midi);
  if(!Number.isInteger(n)||n<0||n>127)return "?";
  const names=["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"];
  return `${names[n%12]}${Math.floor(n/12)-1}`;
}

export function timelineEvents(part,totalUnits){
  const total=Number(totalUnits)||partDuration(part)||1;
  return partEvents(part).map((item,index)=>({
    ...item,
    index,
    left:(item.start/total)*100,
    width:Math.max(.15,(item.duration/total)*100),
    pitch:midiName(item.event.midi)
  }));
}

export function firstAttack(part){
  return partEvents(part)[0]?.start??null;
}
