// Exporta um baralho do Karta como .apkg, direto no navegador.
// Junta: SQLite (sql.js), ZIP (JSZip), áudios do IndexedDB e a montagem de lib/apkg.js.

import JSZip from "jszip";
import { montarApkg } from "./apkg";
import { obterAudio, chaveAudio } from "./audios";
import { precisaGerar } from "./gerarAudios";
import { IDIOMAS } from "./idiomas";

// O sql.js é carregado como script de /public/sqljs (copiado do node_modules
// no "postinstall"), fora do empacotador do Next.js, que não lida bem com ele.
let carregando = null;
function carregarSqlJs() {
  if (!carregando) {
    carregando = new Promise((ok, falha) => {
      if (window.initSqlJs) return ok();
      const script = document.createElement("script");
      script.src = "/sqljs/sql-wasm.js";
      script.onload = ok;
      script.onerror = () => falha(new Error("Não consegui carregar o SQLite. Rode npm install de novo."));
      document.head.appendChild(script);
    }).then(() => window.initSqlJs({ locateFile: (arquivo) => `/sqljs/${arquivo}` }));
    carregando.catch(() => { carregando = null; }); // permite tentar de novo
  }
  return carregando;
}

export async function exportarApkg(baralho) {
  const SQL = await carregarSqlJs();
  const { bytes, resumo, nomeBaralho } = await montarApkg({
    SQL,
    JSZip,
    baralho,
    idioma: IDIOMAS[baralho.idioma],
    // Só entra áudio atualizado (nem com o chiado antigo, nem gerado com o texto errado)
    obterAudio: async (cartaId, campo) => {
      const carta = baralho.cartas.find((c) => c.id === cartaId);
      if (!carta || precisaGerar(carta, campo, baralho.idioma)) return null;
      const blob = await obterAudio(chaveAudio(cartaId, campo));
      return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
    },
  });

  // Dispara o download
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `Karta - ${IDIOMAS[baralho.idioma].nome} - ${baralho.tema}.apkg`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);

  return { ...resumo, nomeBaralho };
}
