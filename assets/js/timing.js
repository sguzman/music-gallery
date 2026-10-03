export function secondsPerUnit(bpm, unitsPerQuarter=1){
  const b=Number(bpm), u=Number(unitsPerQuarter)||1;
  if(!(b>0)||!(u>0)) throw new Error("bpm and unitsPerQuarter must be > 0");
  return 60/b/u;
}

export function midiMicrosPerQuarter(bpm){
  const b=Number(bpm);
  if(!(b>0)) throw new Error("bpm must be > 0");
  return Math.round(60000000/b);
}

export function unitsToTicks(units, unitsPerQuarter=1, ppq=480){
  const u=Number(unitsPerQuarter)||1;
  if(!(u>0)||!(ppq>0)) throw new Error("unitsPerQuarter and ppq must be > 0");
  return Math.round(Number(units)/u*ppq);
}

export function transportTempoBounds(recommendedRange=[], defaultBpm=120){
  const recMin=Number(recommendedRange?.[0]), recMax=Number(recommendedRange?.[1]), d=Number(defaultBpm)||120;
  return {
    min: Math.max(10, Math.min(Number.isFinite(recMin)?Math.floor(recMin/2):20, 20)),
    max: Math.max(320, Number.isFinite(recMax)?Math.ceil(recMax*2):0, Math.ceil(d*3))
  };
}
