// Baralho de exemplo da v2, estático em public/demo-v2.
// Cria o baralho, as palavras e as cartas no repositório e copia os áudios.

import { obterRepo } from "./cliente.js";

export async function carregarDemoV2() {
  const resp = await fetch("/demo-v2/baralho.json");
  if (!resp.ok) throw new Error("Não encontrei o baralho de exemplo.");
  const modelo = await resp.json();
  const repo = await obterRepo();

  const deck = await repo.criarBaralho(modelo.deck);
  await repo.atualizarBaralho({ ...deck, ...modelo.deck });
  await repo.adicionarPalavras(deck.id, modelo.palavras.map((p) => ({ concept: p.concept, facets: p.facets })));

  for (const p of modelo.palavras) {
    for (const [facetId, arquivo] of Object.entries(p.audios || {})) {
      const audio = await fetch(`/demo-v2/${arquivo}`);
      if (audio.ok) await repo.salvarAudio(facetId, await audio.blob());
    }
  }

  return deck;
}
