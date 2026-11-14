// Gera os áudios que faltam num baralho, UMA carta por vez.
// Por que uma por vez? A camada gratuita limita pedidos por minuto.
// Cada áudio é salvo assim que chega: se o limite bater no meio,
// nada se perde e a próxima rodada continua de onde parou.

import { salvarAudio, chaveAudio } from "./audios";
import { salvarBaralho } from "./armazenamento";
import { cabecalhosComChave } from "./chave";
import { textoParaVoz } from "./textoVoz";

export const CAMPOS_AUDIO = { palavra: "palavra", exemplo: "exemplo" };

// Versão do processo de geração. Ao mudar como o áudio é gerado (ex.: v2 remove
// o chiado do certificado C2PA), aumente o número: os áudios antigos passam a
// contar como "faltando" e o app oferece gerar de novo.
export const VERSAO_AUDIO = 2;

// Um áudio precisa ser gerado (de novo) se: não existe, é de uma versão antiga do
// processo, ou foi gerado a partir de um texto diferente do que usaríamos hoje
// (ex.: japonês com kanji, que agora usa a leitura em hiragana).
export function precisaGerar(carta, campo, idioma) {
  if (!carta.audio?.[campo] || carta.audio?.versao !== VERSAO_AUDIO) return true;
  const textoUsado = carta.audio.textos?.[campo] ?? (campo === "palavra" ? carta.palavra : carta.exemplo);
  return textoUsado !== textoParaVoz(carta, idioma, campo);
}

export function audiosFaltando(baralho) {
  return baralho.cartas.reduce(
    (n, c) => n + Object.keys(CAMPOS_AUDIO).filter((k) => precisaGerar(c, k, baralho.idioma)).length,
    0
  );
}

async function pedirAudio(texto, idioma) {
  const r = await fetch("/api/voz", {
    method: "POST",
    headers: cabecalhosComChave(),
    body: JSON.stringify({ texto, idioma }),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw Object.assign(new Error(d.erro || "Falha ao gerar áudio."), { status: r.status, detalhe: d.detalhe, codigo: d.codigo });
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
      if (!precisaGerar(carta, campo, baralhoInicial.idioma)) continue;
      aoMudar(baralho, { cartaId: id, estado: "gerando" });
      try {
        const texto = textoParaVoz(carta, baralhoInicial.idioma, campo);
        const { blob, modelo } = await pedirAudio(texto, baralhoInicial.idioma);
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
                    textos: { ...(c.audio?.versao === VERSAO_AUDIO ? c.audio.textos : {}), [campo]: texto },
                    modelo,
                    versao: VERSAO_AUDIO,
                  },
                }
              : c
          ),
        };
        salvarBaralho(baralho);
        const atual = baralho.cartas.find((c) => c.id === id);
        const completa = ORDEM.every((k) => !precisaGerar(atual, k, baralhoInicial.idioma));
        aoMudar(baralho, { cartaId: id, estado: completa ? "pronto" : "palavra" });
      } catch (e) {
        falharam.add(id);
        aoMudar(baralho, { cartaId: id, estado: "falhou" });
        if (e.status === 429 || e.codigo === "sem-chave") {
          return { baralho, parouPorLimite: true, falhas: falharam.size, erro: e.message };
        }
      }
    }
  }
  return { baralho, parouPorLimite: false, falhas: falharam.size };
}
