// ─────────────────────────────────────────────────────────────
// REPOSITÓRIO (v2): as operações sobre os dados do Karta.
// Modelo de dados idealizado por CauanGS (docs/modelagem): concepts, facets,
// bridge_templates e user_cards. "decks" vem do documento de arquitetura.
// Funciona com qualquer adaptador (IndexedDB no navegador, memória nos testes).
// ─────────────────────────────────────────────────────────────

import { CATALOGO_PONTES, montarCartas, pontesDoBaralho } from "./pontes.js";

const agoraISO = () => new Date().toISOString();

export function criarRepositorio(db) {
  // Pontes que usam uma faceta: pelo tipo e, no áudio, pela faceta que ele fala
  function pontesQueUsam(faceta, facetasDaPalavra, catalogo) {
    const usa = (item) => {
      if (item.tipo !== faceta.facet_type) return false;
      if (faceta.facet_type !== "AUDIO") return true;
      const pai = facetasDaPalavra.find((f) => f.id === faceta.parent_facet_id);
      return pai?.facet_type === item.de;
    };
    return catalogo.filter((p) => [...p.layout.frente, ...p.layout.verso].some(usa)).map((p) => p.id);
  }

  const zerarMemoria = (carta) => ({ ...carta, state: "NEW", stability: null, difficulty: null, due_at: agoraISO(), last_review_at: null, reps: 0, lapses: 0 });

  const repo = {
    // Garante o catálogo de pontes no banco (dados de partida, seção 11 do documento)
    // Atualiza sempre: assim, mudanças no catálogo (ex.: áudio auxiliar) chegam a quem já tinha o banco
    async iniciar() {
      await db.salvar("bridge_templates", CATALOGO_PONTES);
    },
    pontes: () => db.todos("bridge_templates"),

    // ── Baralhos
    // facetas_opcionais: ["AUDIO"] com exercícios de áudio; [] sem (proposta: não está no documento)
    async criarBaralho({ name, creation_mode, theme = null, target_language, level, facetas_opcionais = ["AUDIO"] }) {
      const deck = { id: crypto.randomUUID(), name, creation_mode, theme, target_language, level, facetas_opcionais, pipeline_status: "draft", criado_em: agoraISO() };
      await db.salvar("decks", [deck]);
      return deck;
    },
    async atualizarBaralho(deck) { await db.salvar("decks", [deck]); return deck; },

    async listarBaralhos() {
      const decks = await db.todos("decks");
      return Promise.all(decks.map(async (d) => ({
        ...d,
        palavras: (await db.porIndice("concepts", "deck_id", d.id)).length,
        cartas: (await db.porIndice("user_cards", "deck_id", d.id)).filter((c) => !c.suspended).length,
      })));
    },

    // Tudo de um baralho: palavras (conceito + facetas, na ordem) e cartas
    async carregarBaralho(deckId) {
      const deck = await db.obter("decks", deckId);
      if (!deck) return null;
      const concepts = (await db.porIndice("concepts", "deck_id", deckId)).sort((a, b) => a.position - b.position);
      const palavras = await Promise.all(concepts.map(async (concept) => ({ concept, facets: await db.porIndice("facets", "concept_id", concept.id) })));
      const cartas = await db.porIndice("user_cards", "deck_id", deckId);
      return { deck, palavras, cartas };
    },

    // Guarda o resultado dos Módulos 2 e 3. Palavras já existentes não são reprocessadas (seção 3.3).
    // "posicao" (opcional) coloca a palavra num lugar exato, usado ao gerar uma palavra de novo
    async adicionarPalavras(deckId, palavrasEnriquecidas, { posicao: posicaoFixa = null } = {}) {
      const atuais = await db.porIndice("concepts", "deck_id", deckId);
      let posicao = atuais.reduce((m, c) => Math.max(m, c.position ?? -1), -1);
      const validas = palavrasEnriquecidas.filter((p) => p.facets?.length);
      const concepts = validas.map((p) => ({ ...p.concept, deck_id: deckId, position: posicaoFixa ?? ++posicao }));
      await db.salvar("concepts", concepts);
      await db.salvar("facets", validas.flatMap((p) => p.facets.map((f) => ({ ...f, concept_id: p.concept.id }))));

      const catalogo = await db.todos("bridge_templates");
      const existentes = await db.porIndice("user_cards", "deck_id", deckId);
      const deck = await db.obter("decks", deckId);
      const { cartas, naoCriadas } = montarCartas(validas, { catalogo, existentes, facetasOpcionais: deck?.facetas_opcionais ?? ["AUDIO"] });
      await db.salvar("user_cards", cartas.map((c) => ({ ...c, deck_id: deckId })));
      return { palavras: concepts.length, cartas: cartas.length, naoCriadas };
    },

    // Ligar/desligar os exercícios de áudio de um baralho já criado.
    // Desligar suspende as cartas de áudio (marcadas, para não confundir com suspensões da pessoa)
    // e guarda as gravações. Ligar reativa essas cartas com o histórico e cria as que faltam
    // (palavras que entraram com o áudio desligado).
    async definirAudio(deckId, ligado) {
      const deck = await db.obter("decks", deckId);
      if (!deck) throw new Error("Baralho não encontrado.");
      const opcionais = new Set(deck.facetas_opcionais ?? ["AUDIO"]);
      ligado ? opcionais.add("AUDIO") : opcionais.delete("AUDIO");
      await db.salvar("decks", [{ ...deck, facetas_opcionais: [...opcionais] }]);

      const catalogo = await db.todos("bridge_templates");
      const semAudio = new Set(pontesDoBaralho(catalogo, [...opcionais].filter((t) => t !== "AUDIO")).map((p) => p.id));
      const deAudio = catalogo.filter((p) => !semAudio.has(p.id)).map((p) => p.id);
      const cartas = await db.porIndice("user_cards", "deck_id", deckId);

      if (!ligado) {
        const alvo = cartas.filter((c) => deAudio.includes(c.bridge_template_id) && !c.suspended);
        await db.salvar("user_cards", alvo.map((c) => ({ ...c, suspended: true, suspensa_por: "audio_desligado" })));
        return { suspensas: alvo.length, reativadas: 0, criadas: 0 };
      }
      const voltar = cartas.filter((c) => c.suspensa_por === "audio_desligado");
      await db.salvar("user_cards", voltar.map(({ suspensa_por, ...c }) => ({ ...c, suspended: false })));
      const concepts = await db.porIndice("concepts", "deck_id", deckId);
      const palavras = await Promise.all(concepts.map(async (concept) => ({ concept, facets: await db.porIndice("facets", "concept_id", concept.id) })));
      const { cartas: novas } = montarCartas(palavras, { catalogo, existentes: cartas, facetasOpcionais: [...opcionais] });
      await db.salvar("user_cards", novas.map((c) => ({ ...c, deck_id: deckId })));
      return { suspensas: 0, reativadas: voltar.length, criadas: novas.length };
    },

    // ── Cartas
    async atualizarCarta(carta) { await db.salvar("user_cards", [carta]); },
    async suspenderCarta(cartaId, suspensa = true) {
      const c = await db.obter("user_cards", cartaId);
      if (c) await db.salvar("user_cards", [{ ...c, suspended: suspensa }]);
    },

    // ── Palavras e facetas
    // Excluir palavra: remove a palavra, suas facetas, suas cartas e os áudios (seção 3.4)
    async excluirPalavra(conceptId) {
      const facets = await db.porIndice("facets", "concept_id", conceptId);
      const cartas = await db.porIndice("user_cards", "concept_id", conceptId);
      await db.remover("arquivos", facets.filter((f) => f.facet_type === "AUDIO").map((f) => f.id));
      await db.remover("facets", facets.map((f) => f.id));
      await db.remover("user_cards", cartas.map((c) => c.id));
      await db.remover("concepts", [conceptId]);
    },

    // Gerar uma palavra de novo: a nova entra no mesmo lugar e a antiga sai com cartas, áudios e histórico
    async substituirPalavra(conceptId, enriquecida) {
      const antiga = await db.obter("concepts", conceptId);
      if (!antiga) throw new Error("Palavra não encontrada.");
      const r = await repo.adicionarPalavras(antiga.deck_id, [enriquecida], { posicao: antiga.position });
      if (r.palavras) await repo.excluirPalavra(conceptId);
      return r;
    },

    // Quantas cartas uma edição vai reiniciar (a interface mostra antes de confirmar, seção 6.4)
    async cartasAfetadas(facetId) {
      const faceta = await db.obter("facets", facetId);
      if (!faceta) return [];
      const facetas = await db.porIndice("facets", "concept_id", faceta.concept_id);
      const pontes = pontesQueUsam(faceta, facetas, await db.todos("bridge_templates"));
      return (await db.porIndice("user_cards", "concept_id", faceta.concept_id)).filter((c) => pontes.includes(c.bridge_template_id));
    },

    // Editar faceta (seção 6.4): marca edited_by_user, reinicia as cartas que a usam e,
    // se mudou a escrita ou a frase, marca o áudio correspondente como pendente.
    // reiniciar=false é a nossa proposta para correções pequenas (ex.: um acento),
    // que não deveriam apagar o histórico de estudo.
    async editarFaceta(facetId, mudancas, { reiniciar = true } = {}) {
      const faceta = await db.obter("facets", facetId);
      if (!faceta) throw new Error("Faceta não encontrada.");
      const nova = { ...faceta, ...mudancas, metadata: { ...faceta.metadata, ...(mudancas.metadata || {}) }, edited_by_user: true };
      await db.salvar("facets", [nova]);

      if (["WORD", "SENTENCE"].includes(faceta.facet_type) && mudancas.value !== undefined && mudancas.value !== faceta.value) {
        const audios = (await db.porIndice("facets", "concept_id", faceta.concept_id)).filter((f) => f.facet_type === "AUDIO" && f.parent_facet_id === facetId);
        await db.salvar("facets", audios.map((a) => ({ ...a, value: null, status: "pending" })));
        await db.remover("arquivos", audios.map((a) => a.id));
      }
      const afetadas = reiniciar ? await repo.cartasAfetadas(facetId) : [];
      await db.salvar("user_cards", afetadas.map(zerarMemoria));
      return { reiniciadas: afetadas.length };
    },

    // ── Áudio sob demanda (seção 5.2)
    // Baralho sem exercícios de áudio não tem áudio a gerar
    async audiosPendentes(deckId) {
      const deck = await db.obter("decks", deckId);
      if (!(deck?.facetas_opcionais ?? ["AUDIO"]).includes("AUDIO")) return [];
      const concepts = await db.porIndice("concepts", "deck_id", deckId);
      const listas = await Promise.all(concepts.map((c) => db.porIndice("facets", "concept_id", c.id)));
      return listas.flat().filter((f) => f.facet_type === "AUDIO" && f.status !== "ready");
    },
    async salvarAudio(facetId, blob) {
      const faceta = await db.obter("facets", facetId);
      await db.salvar("arquivos", [{ id: facetId, blob }]);
      await db.salvar("facets", [{ ...faceta, value: `arquivo:${facetId}`, status: "ready" }]);
    },
    async marcarAudioFalhou(facetId) {
      const faceta = await db.obter("facets", facetId);
      await db.salvar("facets", [{ ...faceta, status: "failed" }]);
    },
    async obterAudio(facetId) { return (await db.obter("arquivos", facetId))?.blob ?? null; },

    async excluirBaralho(deckId) {
      for (const c of await db.porIndice("concepts", "deck_id", deckId)) await repo.excluirPalavra(c.id);
      await db.remover("decks", [deckId]);
    },
  };
  return repo;
}
