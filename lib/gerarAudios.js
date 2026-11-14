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

// Ordem de prioridade: primeiro a PALAVRA de todas as cartas, depois as FRASES.
// Por quê? A cota gratuita de voz é curta. O cartão de audição do Anki só precisa
// do áudio da palavra, então gerar as palavras primeiro faz a mesma cota render
// mais cartões úteis (no teste real: 5 áudios = 3 cartões de audição na ordem
// antiga; 5 na ordem nova).
const ORDEM = ["palavra", "exemplo"];

// aoMudar(baralhoAtualizado, { cartaId, estado }) é chamado a cada passo para a tela se atualizar
export async function gerarAudiosDoBaralho(baralhoInicial, aoMudar) {
  let baralho = baralhoInicial;
  const falharam = new Set();

  for (const campo of ORDEM) {
    for (const { id } of baralhoInicial.cartas) {
      const carta = baralho.cartas.find((c) => c.id === id);
      if (!precisaGerar(carta, campo)) continue;
      aoMudar(baralho, { cartaId: id, estado: "gerando" });
      try {
        const { blob, modelo } = await pedirAudio(carta[CAMPOS_AUDIO[campo]]);
        await salvarAudio(chaveAudio(id, campo), blob);
        baralho = {
          ...baralho,
          cartas: baralho.cartas.map((c) =>
            c.id === id
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
        const atual = baralho.cartas.find((c) => c.id === id);
        const completa = ORDEM.every((k) => !precisaGerar(atual, k));
        aoMudar(baralho, { cartaId: id, estado: completa ? "pronto" : "palavra" });
      } catch (e) {
        falharam.add(id);
        aoMudar(baralho, { cartaId: id, estado: "falhou" });
        if (e.status === 429) {
          return { baralho, parouPorLimite: true, falhas: falharam.size, erro: e.message };
        }
      }
    }
  }
  return { baralho, parouPorLimite: false, falhas: falharam.size };
}
