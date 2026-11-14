// Gera os áudios que faltam num baralho, UMA carta por vez.
// Por que uma por vez? A camada gratuita limita pedidos por minuto.
// Cada áudio é salvo assim que chega: se o limite bater no meio,
// nada se perde e a próxima rodada continua de onde parou.

import { salvarAudio, chaveAudio } from "./audios";
import { salvarBaralho } from "./armazenamento";

export const CAMPOS_AUDIO = { palavra: "palavra", exemplo: "exemplo" };

// Versão do processo de geração. Ao mudar como o áudio é gerado (ex.: v2 remove
// o chiado do certificado C2PA), aumente o número: os áudios antigos passam a
// contar como "faltando" e o app oferece gerar de novo.
export const VERSAO_AUDIO = 2;

const precisaGerar = (carta, campo) => !carta.audio?.[campo] || carta.audio?.versao !== VERSAO_AUDIO;

export function audiosFaltando(baralho) {
  return baralho.cartas.reduce(
    (n, c) => n + Object.keys(CAMPOS_AUDIO).filter((k) => precisaGerar(c, k)).length,
    0
  );
}

async function pedirAudio(texto) {
  const r = await fetch("/api/voz", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texto }),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw Object.assign(new Error(d.erro || "Falha ao gerar áudio."), { status: r.status, detalhe: d.detalhe });
  }
  return { blob: await r.blob(), modelo: r.headers.get("X-Modelo") };
}

// aoMudar(baralhoAtualizado, { cartaId, estado }) é chamado a cada passo para a tela se atualizar
export async function gerarAudiosDoBaralho(baralhoInicial, aoMudar) {
  let baralho = baralhoInicial;
  let falhas = 0;

  for (const carta of baralhoInicial.cartas) {
    const faltam = Object.keys(CAMPOS_AUDIO).filter((k) => precisaGerar(carta, k));
    if (!faltam.length) continue;
    aoMudar(baralho, { cartaId: carta.id, estado: "gerando" });

    let falhou = false;
    for (const campo of faltam) {
      try {
        const { blob, modelo } = await pedirAudio(carta[CAMPOS_AUDIO[campo]]);
        await salvarAudio(chaveAudio(carta.id, campo), blob);
        baralho = {
          ...baralho,
          cartas: baralho.cartas.map((c) =>
            c.id === carta.id
              ? {
                  ...c,
                  audio: {
                    ...(c.audio?.versao === VERSAO_AUDIO ? c.audio : {}),
                    [campo]: true,
                    modelo,
                    versao: VERSAO_AUDIO,
                  },
                }
              : c
          ),
        };
        salvarBaralho(baralho);
      } catch (e) {
        if (e.status === 429) {
          aoMudar(baralho, { cartaId: carta.id, estado: "falhou" });
          return { baralho, parouPorLimite: true, falhas: falhas + 1, erro: e.message };
        }
        falhou = true;
      }
    }
    if (falhou) falhas++;
    aoMudar(baralho, { cartaId: carta.id, estado: falhou ? "falhou" : "pronto" });
  }
  return { baralho, parouPorLimite: false, falhas };
}
