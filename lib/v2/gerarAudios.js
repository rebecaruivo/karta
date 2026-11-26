// Gera as gravações (Gemini TTS) das facetas AUDIO pendentes de um baralho da v2.
// Reaproveita a rota /api/voz da v1 (modelos reserva, remoção do certificado C2PA).
// Ordem: primeiro o áudio das PALAVRAS, depois o das frases. Lição do teste da v1:
// com a cota curta, a mesma cota rende mais cartas úteis assim.
// Se a cota acabar (429), para e guarda o que já foi gerado.

import { cabecalhosComChave } from "../chave.js";
import { idiomaV2, textoParaVoz } from "./idiomas.js";
import { registrarEvento } from "./eventos.js";

export async function gerarAudiosDoBaralho(repo, deckId, aoProgresso = () => {}) {
  const { deck, palavras } = await repo.carregarBaralho(deckId);
  const cfg = idiomaV2(deck.target_language);
  const pendentes = await repo.audiosPendentes(deckId);
  const textoDe = (audio) => palavras.flatMap((p) => p.facets).find((f) => f.id === audio.parent_facet_id);
  const ordenados = [...pendentes].sort((a, b) => (textoDe(a)?.facet_type === "WORD" ? 0 : 1) - (textoDe(b)?.facet_type === "WORD" ? 0 : 1));

  let feitos = 0, falhas = 0;
  // Custo das gravações desta rodada (lido dos cabeçalhos da rota /api/voz), registrado num evento no fim
  const custo = { usd: 0, tokens: 0, estimado: false };
  const registrarCusto = () => {
    if (feitos) registrarEvento("audios_gerados", { deck_id: deckId, idioma: deck.target_language, payload: { n_audios: feitos, custo_usd: custo.usd, tokens: custo.tokens, estimado: custo.estimado } });
  };
  for (const audio of ordenados) {
    const pai = textoDe(audio);
    if (!pai?.value) continue;
    aoProgresso({ feitos, total: ordenados.length });
    const r = await fetch("/api/voz", { method: "POST", headers: cabecalhosComChave(), body: JSON.stringify({ texto: textoParaVoz(pai.value, pai.metadata, cfg), idioma: deck.target_language }) });
    if (r.ok) {
      await repo.salvarAudio(audio.id, await r.blob());
      feitos++;
      const usd = r.headers.get("X-Custo-Usd");
      if (usd) custo.usd += Number(usd); else custo.estimado = true;
      custo.tokens += Number(r.headers.get("X-Tokens")) || 0;
      if (r.headers.get("X-Custo-Estimado")) custo.estimado = true;
    } else {
      const d = await r.json().catch(() => ({}));
      if (r.status === 429 || d.codigo === "sem-chave") { registrarCusto(); return { feitos, falhas, parou: d.erro || "Limite de voz atingido." }; }
      await repo.marcarAudioFalhou(audio.id);
      falhas++;
    }
  }
  aoProgresso({ feitos, total: ordenados.length });
  registrarCusto();
  return { feitos, falhas, parou: null };
}
