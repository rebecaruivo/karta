// Acesso aos dados da v2 no navegador.
// Sem login: tudo no IndexedDB deste navegador (como sempre foi).
// Com login (fase 2): baralhos, cartas e progresso no banco (/api/v2/dados);
// os áudios continuam neste navegador e o catálogo de pontes vem do código.
import { criarRepositorio } from "./banco.js";
import { adaptadorIndexedDB, adaptadorServidor, adaptadorMisto, adaptadorMemoria } from "./adaptadores.js";
import { sessaoAtual } from "../auth/client.js";

let repo = null;
let estado = null; // { modo: "conta" | "navegador", usuario }

async function preparar() {
  const usuario = await sessaoAtual();
  const local = adaptadorIndexedDB("karta-v2");
  const db = usuario ? adaptadorMisto({ servidor: adaptadorServidor(), local, memoria: adaptadorMemoria() }) : local;
  repo = criarRepositorio(db);
  await repo.iniciar();
  estado = { modo: usuario ? "conta" : "navegador", usuario };
}

let preparando = null;
export async function obterRepo() {
  if (!repo) { preparando ??= preparar(); await preparando; }
  return repo;
}
export async function estadoDados() { await obterRepo(); return estado; }

// Baralhos que estão só neste navegador (e ainda não na conta)
export async function baralhosSoNoNavegador() {
  const { modo } = await estadoDados();
  if (modo !== "conta") return [];
  const local = criarRepositorio(adaptadorIndexedDB("karta-v2"));
  const naConta = new Set((await repo.listarBaralhos()).map((d) => d.id));
  return (await local.listarBaralhos()).filter((d) => !naConta.has(d.id));
}

// Copia para a conta os baralhos deste navegador, com palavras, facetas, cartas e progresso.
// Os IDs são mantidos, então copiar duas vezes não duplica nada. A cópia local continua.
export async function levarParaConta(deckIds) {
  const local = adaptadorIndexedDB("karta-v2");
  const servidor = adaptadorServidor();
  const ids = new Set(deckIds);
  const decks = (await local.todos("decks")).filter((d) => ids.has(d.id));
  const concepts = (await local.todos("concepts")).filter((c) => ids.has(c.deck_id));
  const conceitos = new Set(concepts.map((c) => c.id));
  const facets = (await local.todos("facets")).filter((f) => conceitos.has(f.concept_id));
  const cartas = (await local.todos("user_cards")).filter((c) => ids.has(c.deck_id));
  const revisoes = (await local.todos("revisoes")).filter((r) => ids.has(r.deck_id));
  // Em lotes, para não mandar pedidos grandes demais
  const emLotes = async (t, regs) => { for (let i = 0; i < regs.length; i += 100) await servidor.salvar(t, regs.slice(i, i + 100)); };
  await emLotes("decks", decks);
  await emLotes("concepts", concepts);
  await emLotes("facets", facets);
  await emLotes("user_cards", cartas);
  await emLotes("revisoes", revisoes);
  return { baralhos: decks.length, cartas: cartas.length };
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
