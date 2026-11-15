// Baixa a lista oficial de vocabulário do HSK e gera lib/v2/dados/hsk.js
// Fonte: github.com/drkameleon/complete-hsk-vocabulary (licença MIT)
// Uso (uma vez só; o arquivo gerado vai para o git):  npm run baixar:hsk
//
// Resultado: { "苹果": 3, ... } — palavra → nível do HSK 2.0 (1 a 6).
// Palavras que só existem na lista nova (HSK 3.0) ficam com 7, que o Karta lê como "acima do HSK 6".

import { writeFileSync } from "node:fs";

const URL = "https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/main/complete.json";
const resp = await fetch(URL);
if (!resp.ok) { console.log(`Não consegui baixar (${resp.status}).`); process.exit(1); }
const lista = await resp.json();
console.log("Exemplo de entrada:", JSON.stringify(lista[0]).slice(0, 200));

const mapa = {};
for (const e of lista) {
  const palavra = e.simplified ?? e.s ?? e.hanzi;
  const niveis = [].concat(e.level ?? e.l ?? []).map(String);
  if (!palavra || !niveis.length) continue;
  const antigo = niveis.map((n) => n.match(/^old-(\d)$/)?.[1]).filter(Boolean).map(Number);
  const nivel = antigo.length ? Math.min(...antigo) : 7;
  mapa[palavra] = Math.min(mapa[palavra] ?? 99, nivel);
}
const total = Object.keys(mapa).length;
if (total < 5000) { console.log(`Só ${total} palavras reconhecidas: o formato da fonte deve ter mudado. Nada foi gravado.`); process.exit(1); }

writeFileSync("lib/v2/dados/hsk.js",
  `// Gerado por scripts/baixar-hsk.mjs a partir de github.com/drkameleon/complete-hsk-vocabulary (licença MIT).\n` +
  `// Palavra → nível do HSK 2.0 (1 a 6); 7 = só na lista do HSK 3.0 (acima do HSK 6). Não edite à mão.\n` +
  `export default ${JSON.stringify(mapa)};\n`);
const porNivel = Object.values(mapa).reduce((c, n) => ((c[n] = (c[n] || 0) + 1), c), {});
console.log(`Gravado lib/v2/dados/hsk.js: ${total} palavras. Por nível:`, porNivel);
for (const p of ["西瓜", "苹果", "橙子", "析璉", "节林"]) console.log(`  ${p}: ${mapa[p] ?? "fora da lista"}`);
