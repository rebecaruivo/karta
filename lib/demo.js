// Baralho de exemplo que vem junto com o app (public/demo).
// Permite ver o Karta funcionando sem chave nem cota.

import { salvarBaralho } from "./armazenamento";
import { salvarAudio, chaveAudio } from "./audios";
import { VERSAO_AUDIO } from "./gerarAudios";

export async function carregarDemo() {
  const r = await fetch("/demo/baralho.json");
  if (!r.ok) throw new Error("Não encontrei o baralho de exemplo.");
  const modelo = await r.json();

  const cartas = [];
  for (const c of modelo.cartas) {
    // IDs próprios ("demo-…") para não misturar com baralhos reais do usuário
    const id = `demo-${c.id}`;
    const audio = {};
    for (const campo of Object.keys(c.audioDemo || {})) {
      const resp = await fetch(`/demo/audio/${c.id}_${campo}.wav`);
      if (!resp.ok) continue;
      await salvarAudio(chaveAudio(id, campo), await resp.blob());
      audio[campo] = true;
    }
    const { audioDemo, ...resto } = c;
    cartas.push({
      ...resto,
      id,
      ...(Object.keys(audio).length ? { audio: { ...audio, versao: VERSAO_AUDIO, modelo: "exemplo" } } : {}),
    });
  }
  const baralho = { ...modelo, cartas, criadoEm: new Date().toISOString() };
  salvarBaralho(baralho);
  return baralho;
}
