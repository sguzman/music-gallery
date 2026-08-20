const body = document.body;
const slug = body.dataset.song;
const rootPath = body.dataset.root || "../..";

let song = null;
let scheduled = false;

function sectionById(id) {
  return (song?.sections || []).find(section => section.id === id) || null;
}

function exactPosition(section, measureIndex, eventIndex) {
  if (!section) return null;
  const measures = section.measures || [];
  const measure = measures[measureIndex];
  const event = measure?.events?.[eventIndex];
  if (!measure || !event) return null;

  const total = measures.reduce((sum, item) => sum + Number(item.duration || 0), 0);
  if (!(total > 0)) return null;

  let measureStart = 0;
  for (let i = 0; i < measureIndex; i++) {
    measureStart += Number(measures[i].duration || 0);
  }

  const start = measureStart + Number(event.start || 0);
  return Math.max(0, Math.min(100, (start / total) * 100));
}

function applyExactTiming() {
  scheduled = false;
  if (!song) return;

  document.querySelectorAll("#tabs .note[data-section][data-measure][data-event]").forEach(note => {
    const section = sectionById(note.dataset.section);
    const measureIndex = Number(note.dataset.measure);
    const eventIndex = Number(note.dataset.event);
    const percent = exactPosition(section, measureIndex, eventIndex);
    if (percent === null) return;

    note.style.left = `${percent}%`;
    note.dataset.exactTiming = "true";
  });
}

function scheduleExactTiming() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(applyExactTiming);
}

async function init() {
  const response = await fetch(`${rootPath}/data/songs/${slug}.json`);
  if (!response.ok) throw new Error(`song JSON ${response.status}`);
  song = await response.json();

  const tabs = document.querySelector("#tabs");
  if (!tabs) return;

  new MutationObserver(scheduleExactTiming).observe(tabs, {
    childList: true,
    subtree: true
  });

  scheduleExactTiming();
}

init().catch(error => console.error("Exact timing overlay failed", error));
