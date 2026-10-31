// Recolhe dados hidrológicos do Tejo a partir das páginas públicas do InfoÁgua (APA / SNIRH).
// As páginas trazem os dados num bloco JSON embutido; este script lê esse JSON sem executar código da página.
// Resultado: site/data/tejo.json, lido pela página da estação.
import { writeFile, mkdir } from "node:fs/promises";

const BASE = "https://infoagua.apambiente.pt/pt/cheias/cheia-detalhe/";
const OUT = new URL("../site/data/tejo.json", import.meta.url);
const PREVIOUS = process.env.PREVIOUS_URL || ""; // tejo.json publicado da última vez (para não perder dados se a APA falhar)

// Ordem de montante para jusante. Coordenadas aproximadas, só para o mapa.
const STATIONS = [
  { id: "21042",      name: "Alcântara",       kind: "barragem", river: "Tejo",   country: "ES", lat: 39.725, lon: -6.883 },
  { id: "1693711514", name: "Cedillo",         kind: "barragem", river: "Tejo",   country: "ES", lat: 39.662, lon: -7.545 },
  { id: "1627758658", name: "Fratel",          kind: "barragem", river: "Tejo", lat: 39.544, lon: -7.8 },
  { id: "1627759292", name: "Pracana",         kind: "barragem", river: "Ocreza", lat: 39.588, lon: -7.805 },
  { id: "1627743544", name: "Belver",          kind: "barragem", river: "Tejo", lat: 39.482, lon: -7.996 },
  { id: "1627743896", name: "Castelo do Bode", kind: "barragem", river: "Zêzere", lat: 39.543, lon: -8.322 },
  { id: "1627759478", name: "Tramagal",        kind: "rio",      river: "Tejo", lat: 39.452, lon: -8.248 },
  { id: "1627758984", name: "Ponte de Abrantes", kind: "rio",    river: "Tejo", lat: 39.457, lon: -8.199 },
  { id: "1627743414", name: "Almourol",        kind: "rio",      river: "Tejo", lat: 39.468, lon: -8.392 },
  { id: "1627759062", name: "Ponte da Chamusca", kind: "rio",    river: "Tejo", lat: 39.357, lon: -8.481 },
  { id: "1627758916", name: "Ómnias (Santarém)", kind: "rio",    river: "Tejo", lat: 39.215, lon: -8.68 },
  { id: "1627759542", name: "Vila Franca de Xira", kind: "rio",  river: "Tejo", lat: 38.952, lon: -8.988 },
];

// Parâmetros do InfoÁgua que interessam (id → chave e unidade esperada).
const PARAMS = {
  1: ["caudal", "m3/s"],
  2: ["descarga", "m3/s"],
  3: ["cota", "m"],
  4: ["nivel", "m"],
  6: ["afluencia", "m3/s"],
  7: ["armazenamento", "%"],
};
const KEEP_HOURS = 72;

function embeddedJSON(html, name) {
  const m = new RegExp("\\bvar\\s+" + name + "\\s*=\\s*").exec(html);
  if (!m) throw new Error("bloco " + name + " não encontrado");
  const start = m.index + m[0].length;
  if (!"[{".includes(html[start])) throw new Error("formato inesperado em " + name);
  let quoted = false, esc = false, depth = 0;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (quoted) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') quoted = false; }
    else if (c === '"') quoted = true;
    else if (c === "[" || c === "{") depth++;
    else if ((c === "]" || c === "}") && --depth === 0) return JSON.parse(html.slice(start, i + 1));
  }
  throw new Error("JSON incompleto em " + name);
}

// "2026-10-31 14:00:00" (hora de Lisboa, sem fuso) → ISO UTC. Hora ambígua na mudança de hora é rejeitada.
const fmt = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
function lisbonToISO(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return null;
  const wall = Date.parse(s.replace(" ", "T") + "Z");
  const hits = [0, 3600e3].map(o => wall - o).filter(t => fmt.format(new Date(t)) === s);
  return hits.length === 1 ? new Date(hits[0]).toISOString() : null;
}

async function getPage(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { "user-agent": "meteo-almeirim (pagina pessoal; dados publicos APA)" } });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.text();
}

async function collect(st) {
  const html = await getPage(BASE + st.id);
  const params = embeddedJSON(html, "DATA_StationParameters");
  const now = Date.now(), cutoff = now - KEEP_HOURS * 3600e3;
  const series = {};
  for (const p of params) {
    const def = PARAMS[p.id];
    if (!def || (p.unit || "").trim() !== def[1]) continue;
    const rows = [];
    const seen = new Set();
    for (const v of p.values || []) {
      const t = lisbonToISO(v.moment);
      const val = v.value;
      if (!t || typeof val !== "number" || !Number.isFinite(val) || val === -99) continue;
      if (def[1] !== "m" && val < 0) continue;
      const ms = Date.parse(t);
      if (ms < cutoff || ms > now + 6 * 60e3 || seen.has(t)) continue;
      seen.add(t); rows.push([t, val]);
    }
    rows.sort((a, b) => a[0].localeCompare(b[0]));
    if (rows.length) series[def[0]] = { unit: def[1], rows };
  }
  return { ...st, url: BASE + st.id, series };
}

async function main() {
  let previous = null;
  if (PREVIOUS) { try { const r = await fetch(PREVIOUS, { signal: AbortSignal.timeout(15000) }); if (r.ok) previous = await r.json(); } catch {} }
  const out = { source: "APA — InfoÁgua / SNIRH (rede de vigilância e alerta de cheias)", generated_at: new Date().toISOString(), stations: [], failures: [] };
  for (const st of STATIONS) {
    try {
      out.stations.push(await collect(st));
    } catch (e) {
      out.failures.push(st.name + ": " + e.message);
      const old = previous?.stations?.find(s => s.id === st.id);
      out.stations.push(old ? { ...old, stale: true } : { ...st, url: BASE + st.id, series: {}, stale: true });
    }
    await new Promise(r => setTimeout(r, 400)); // não sobrecarregar o servidor da APA
  }
  await mkdir(new URL(".", OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(out));
  console.log(`tejo.json: ${out.stations.length} estações, ${out.failures.length} falhas`);
  out.failures.forEach(f => console.log("  falha:", f));
}

main().catch(e => { console.error(e); process.exit(1); });
