// Guarda uma cópia da imagem mais recente do radar do IPMA que cobre Almeirim (radar de Coruche).
// Procura os endereços das imagens na página pública de observação remota do IPMA; se não encontrar,
// usa os endereços conhecidos. Resultado: site/data/radar-ipma.<ext> e site/data/radar-ipma.json.
import { writeFile, mkdir } from "node:fs/promises";

const DIR = new URL("../site/data/", import.meta.url);
const UA = { "user-agent": "meteoalmeirim.github.io (pagina pessoal; dados publicos IPMA)" };
const PAGES = [
  "https://www.ipma.pt/pt/otempo/obs.remote/",
  "https://www.ipma.pt/pt/otempo/obs.remote/index.jsp",
];
const KNOWN = [
  "https://www.ipma.pt/resources.www/transf/radar/LIS_MAX.gif", // radar de Coruche
  "https://www.ipma.pt/resources.www/transf/radar/LIS_MAX.png",
];

async function get(url, timeout = 20000) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeout) });
  if (!r.ok) throw new Error(url + " → HTTP " + r.status);
  return r;
}

async function candidates() {
  const found = [];
  for (const page of PAGES) {
    try {
      const html = await (await get(page)).text();
      // Diagnóstico: linhas da página que falam do radar (para afinar os endereços).
      if (process.env.RADAR_DEBUG) {
        const lines = html.split(/\n/).filter(l => /png-geo|radar|\.js["']/i.test(l)).map(l => l.trim().slice(0, 300));
        console.log("DEBUG " + page + "\n" + lines.slice(0, 80).join("\n"));
      }
      for (const m of html.matchAll(/["'(]((?:https?:\/\/www\.ipma\.pt)?\/?resources\.www\/transf\/radar\/[^"')\s]+?\.(?:png|gif|jpg))/gi)) {
        found.push(new URL(m[1], "https://www.ipma.pt/").href);
      }
    } catch (e) { console.log("página IPMA:", e.message); }
  }
  // Preferir o radar de Coruche (LIS) e o composto do continente.
  const score = u => (/LIS|coruche/i.test(u) ? 0 : /por|pcr|cont/i.test(u) ? 1 : 2);
  const uniq = [...new Set(found)].filter(u => !/legenda|legend/i.test(u)).sort((a, b) => score(a) - score(b));
  console.log("imagens encontradas na página:", uniq.length ? uniq.join(", ") : "nenhuma");
  return [...uniq, ...KNOWN];
}

async function main() {
  await mkdir(DIR, { recursive: true });
  for (const url of await candidates()) {
    try {
      const r = await get(url);
      const type = r.headers.get("content-type") || "";
      if (!type.startsWith("image/")) throw new Error(url + " não é imagem (" + type + ")");
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 8000) throw new Error(url + " demasiado pequena");
      const ext = type.includes("png") ? "png" : type.includes("jpeg") ? "jpg" : "gif";
      await writeFile(new URL("radar-ipma." + ext, DIR), buf);
      await writeFile(new URL("radar-ipma.json", DIR), JSON.stringify({
        file: "radar-ipma." + ext, source_url: url, fetched_at: new Date().toISOString(),
        last_modified: r.headers.get("last-modified"),
      }));
      console.log("radar IPMA guardado de", url, `(${buf.length} bytes)`);
      return;
    } catch (e) { console.log("falhou:", e.message); }
  }
  await writeFile(new URL("radar-ipma.json", DIR), JSON.stringify({ file: null, fetched_at: new Date().toISOString() }));
  console.log("radar IPMA indisponível nesta recolha");
}

main().catch(e => { console.error(e); process.exit(0); }); // nunca impede a publicação da página
