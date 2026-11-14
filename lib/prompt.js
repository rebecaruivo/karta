// ─────────────────────────────────────────────────────────────
// PROMPT DE GERAÇÃO DE BARALHO
// Aqui está a engenharia de prompt do projeto. Cada bloco existe
// por um motivo, anotado ao lado. A estrutura da resposta não é
// pedida em texto: ela é imposta pelo "schema" no fim do arquivo.
// ─────────────────────────────────────────────────────────────

import { Type } from "@google/genai";
import { IDIOMAS } from "./idiomas";

// 1) Instrução de sistema: define o papel e as regras que valem
//    para qualquer pedido. Fica separada do pedido do usuário.
export const INSTRUCAO_SISTEMA = `Você é um professor de idiomas que monta baralhos de flashcards para falantes de português do Brasil.

Regras que você sempre segue:
- Respeite o nível pedido. Uma palavra só entra se for típica daquele nível ou de um nível abaixo.
- A frase de exemplo usa apenas vocabulário do nível pedido ou mais fácil, tem no máximo 12 palavras e mostra um uso natural do dia a dia.
- Não repita palavras nem variações da mesma palavra no baralho.
- Traduções em português do Brasil, curtas e no sentido usado na frase de exemplo.
- Prefira palavras úteis e frequentes a palavras raras ou curiosas.
- Se o tema for amplo, cubra subtemas diferentes em vez de ficar num só.
- Se o tema não fizer sentido ou for impróprio para estudo, gere um baralho de vocabulário básico do nível e explique isso em "observacao".`;

// 2) Pedido do usuário: monta o texto a partir dos dados do formulário.
//    As regras de leitura e escrita mudam por idioma (vêm de idiomas.js).
export function montarPedido({ idioma, nivel, tema, quantidade }) {
  const cfg = IDIOMAS[idioma];
  return `Monte um baralho de ${quantidade} cartas.

Idioma: ${cfg.nome}
Nível: ${nivel}
Tema: ${tema}

Formato de cada campo:
- palavra: ${cfg.regraPalavra}
- leitura: ${cfg.regraLeitura}
- traducao: tradução em português
- classe: classe gramatical em português (substantivo, verbo, adjetivo, expressão...)
- exemplo: frase no idioma estudado
- exemploLeitura: a frase inteira no mesmo formato do campo "leitura"
- exemploTraducao: tradução da frase em português`;
}

// 3) Schema: o Gemini é obrigado a responder neste formato JSON.
//    Isso é "saída estruturada". Sem isso, o modelo às vezes
//    devolve texto solto ou markdown e o app quebra.
export const SCHEMA_BARALHO = {
  type: Type.OBJECT,
  properties: {
    cartas: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          palavra: { type: Type.STRING },
          leitura: { type: Type.STRING },
          traducao: { type: Type.STRING },
          classe: { type: Type.STRING },
          exemplo: { type: Type.STRING },
          exemploLeitura: { type: Type.STRING },
          exemploTraducao: { type: Type.STRING },
        },
        required: ["palavra", "leitura", "traducao", "classe", "exemplo", "exemploLeitura", "exemploTraducao"],
        propertyOrdering: ["palavra", "leitura", "traducao", "classe", "exemplo", "exemploLeitura", "exemploTraducao"],
      },
    },
    observacao: { type: Type.STRING },
  },
  required: ["cartas"],
};
