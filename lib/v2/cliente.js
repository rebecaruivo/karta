// Acesso aos dados da v2 no navegador: um repositório só, sobre o IndexedDB.
import { criarRepositorio } from "./banco.js";
import { adaptadorIndexedDB } from "./adaptadores.js";

let repo = null;
export async function obterRepo() {
  if (!repo) {
    repo = criarRepositorio(adaptadorIndexedDB("karta-v2"));
    await repo.iniciar();
  }
  return repo;
}

// Facetas de uma palavra, por papel (para as cartas não precisarem procurar)
export function facetasDe(palavra) {
  const f = palavra.facets;
  const word = f.find((x) => x.facet_type === "WORD");
  const sentence = f.find((x) => x.facet_type === "SENTENCE");
  return {
    word,
    meaning: f.find((x) => x.facet_type === "MEANING"),
    sentence,
    audioPalavra: f.find((x) => x.facet_type === "AUDIO" && x.parent_facet_id === word?.id),
    audioFrase: f.find((x) => x.facet_type === "AUDIO" && x.parent_facet_id === sentence?.id),
  };
}
