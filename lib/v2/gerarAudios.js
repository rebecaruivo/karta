// Gera as gravações (Gemini TTS) das facetas AUDIO pendentes de um baralho da v2.
// Reaproveita a rota /api/voz da v1 (modelos reserva, remoção do certificado C2PA).
// Ordem: primeiro o áudio das PALAVRAS, depois o das frases. Lição do teste da v1:
// com a cota curta, a mesma cota rende mais cartas úteis assim.
// Se a cota acabar (429), para e guarda o que já foi gerado.

import { cabecalhosComChave } from "../chave.js";

export async function gerarAudiosDoBaralho(repo, deckId, aoProgresso = () => {}) {
  const { palavras } = await repo.carregarBaralho(deckId);
  const pendentes = await repo.audiosPendentes(deckId);
  const textoDe = (audio) => palavras.flatMap((p) => p.facets).find((f) => f.id === audio.parent_facet_id);
  const ordenados = [...pendentes].sort((a, b) => (textoDe(a)?.facet_type === "WORD" ? 0 : 1) - (textoDe(b)?.facet_type === "WORD" ? 0 : 1));

  let feitos = 0, falhas = 0;
  for (const audio of ordenados) {
    const pai = textoDe(audio);
    if (!pai?.value) continue;
    aoProgresso({ feitos, total: ordenados.length });
    const r = await fetch("/api/voz", { method: "POST", headers: cabecalhosComChave(), body: JSON.stringify({ texto: pai.value, idioma: "mandarim" }) });
    if (r.ok) {
      await repo.salvarAudio(audio.id, await r.blob());
      feitos++;
    } else {
      const d = await r.json().catch(() => ({}));
      if (r.status === 429 || d.codigo === "sem-chave") return { feitos, falhas, parou: d.erro || "Limite de voz atingido." };
      await repo.marcarAudioFalhou(audio.id);
      falhas++;
    }
  }
  aoProgresso({ feitos, total: ordenados.length });
  return { feitos, falhas, parou: null };
}
