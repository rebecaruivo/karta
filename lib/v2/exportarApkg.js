// Exporta um baralho da v2 como .apkg, direto no navegador (mesmo caminho da v1).
import JSZip from "jszip";
import { carregarSqlJs } from "../exportarApkg";
import { montarApkgV2 } from "./apkg";

export async function exportarApkgV2(repo, deckId) {
  const { deck, palavras, cartas } = await repo.carregarBaralho(deckId);
  const SQL = await carregarSqlJs();
  const { bytes, resumo, nomeBaralho } = await montarApkgV2({
    SQL, JSZip, deck, palavras, cartas,
    obterAudio: async (facetId) => {
      const blob = await repo.obterAudio(facetId);
      return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
    },
  });

  const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `Karta v2 - ${deck.name}.apkg`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return { ...resumo, nomeBaralho };
}
