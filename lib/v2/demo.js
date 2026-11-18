// Baralho de exemplo da v2, estático em public/demo-v2.
// Cria o baralho, as palavras e as cartas no repositório e copia os áudios.

import { obterRepo } from "./cliente.js";
import { facetasDoBaralho } from "./pontes.js";

export async function carregarDemoV2() {
  const resp = await fetch("/demo-v2/baralho.json");
  if (!resp.ok) throw new Error("Não encontrei o baralho de exemplo.");
  const modelo = await resp.json();
  const repo = await obterRepo();

  // O JSON do exemplo é do formato antigo (sem facetas_versao), em que "só áudio" ainda incluía a frase.
  // Converte para o formato novo, senão o exemplo nasce sem as cartas de frase.
  const facetas = { facetas_opcionais: facetasDoBaralho(modelo.deck), facetas_versao: 2 };
  const deck = await repo.criarBaralho({ ...modelo.deck, ...facetas });
  await repo.atualizarBaralho({ ...deck, ...modelo.deck, ...facetas });
  await repo.adicionarPalavras(deck.id, modelo.palavras.map((p) => ({ concept: p.concept, facets: p.facets })));

  for (const p of modelo.palavras) {
    for (const [facetId, arquivo] of Object.entries(p.audios || {})) {
      const audio = await fetch(`/demo-v2/${arquivo}`);
      if (audio.ok) await repo.salvarAudio(facetId, await audio.blob());
    }
  }

  return deck;
}
