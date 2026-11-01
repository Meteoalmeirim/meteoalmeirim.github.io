// Lista das imagens do radar de precipitação do IPMA (mosaico do Continente), as mesmas do
// mapa dinâmico em ipma.pt/pt/otempo/obs.remote/. A página mostra-as diretamente do IPMA por cima
// de um mapa centrado em Almeirim; aqui só se copia a lista (o navegador não a pode ler do IPMA).
// Resultado: site/data/radar-ipma.json
import { writeFile, mkdir } from "node:fs/promises";

const DIR = new URL("../site/data/", import.meta.url);
const LIST = "https://www.ipma.pt/resources.www/transf/radar/imgs-radar.json";
const BASE = "https://www.ipma.pt/resources.www/transf/radar/por/";
// Limites geográficos da imagem do mosaico (os mesmos que o IPMA usa no seu mapa).
const BOUNDS = [[34.011513, -12.454795], [43.792862, -4.345465]];

async function main() {
  await mkdir(DIR, { recursive: true });
  const out = { source: "IPMA — radar meteorológico, mosaico do Continente", page: "https://www.ipma.pt/pt/otempo/obs.remote/", bounds: BOUNDS, fetched_at: new Date().toISOString(), frames: [] };
  try {
    const r = await fetch(LIST, { headers: { "user-agent": "meteoalmeirim.github.io (pagina pessoal; dados publicos IPMA)" }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    // As horas da lista estão em UTC ("AAAA-MM-DD HH:MM").
    out.frames = (j.Portugal || [])
      .filter(f => f && f.path && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(f.date))
      .map(f => ({ time: f.date.replace(" ", "T") + ":00Z", url: BASE + f.path }))
      .sort((a, b) => a.time.localeCompare(b.time));
    console.log(`radar IPMA: ${out.frames.length} imagens, a mais recente às ${out.frames.at(-1)?.time || "--"}`);
  } catch (e) {
    console.log("radar IPMA indisponível:", e.message);
  }
  await writeFile(new URL("radar-ipma.json", DIR), JSON.stringify(out));
}

main().catch(e => { console.error(e); process.exit(0); }); // nunca impede a publicação da página
