// ─────────────────────────────────────────────────────────────
// ANÁLISE DO PROGRESSO COM IA (aba "Progresso")
// Recebe só números e palavras agregados (resumoParaIA, sem IDs) e devolve um
// diagnóstico curto: padrões nos pontos fracos e sugestões concretas de prática.
// ─────────────────────────────────────────────────────────────
import { Type } from "@google/genai";

export const VERSAO_PROMPT_ANALISE = 1;
export const MINIMO_RESPOSTAS = 20; // com menos que isso, não há o que analisar (e a IA nem é chamada)

// Nomes dos tipos de carta em português (a IA não vê os IDs internos)
export const NOMES_CARTAS = {
  WORD_TO_MEANING: "Palavra → Significado", AUDIO_TO_MEANING: "Áudio → Significado", AUDIO_TO_WORD: "Áudio → Palavra",
  WORD_TO_AUDIO: "Palavra → Áudio (pronúncia)", SENTENCE_AUDIO_TO_SENTENCE: "Áudio da frase → Frase",
  CLOZE_SENTENCE_TO_WORD: "Frase com lacuna → Palavra", MEANING_TO_SENTENCE: "Significado → Frase (tradução para o idioma)",
};

export function traduzirResumo(resumo) {
  const nome = (id) => NOMES_CARTAS[id] ?? id;
  return {
    ...resumo,
    palavras_dificeis: (resumo.palavras_dificeis ?? []).map((p) => ({ ...p, tipo_de_carta_mais_dificil: p.tipo_de_carta_mais_dificil ? nome(p.tipo_de_carta_mais_dificil) : null })),
    dificil_por_tipo_de_carta: (resumo.dificil_por_tipo_de_carta ?? []).map((t) => ({ ...t, tipo: nome(t.tipo) })),
  };
}

export const INSTRUCAO_SISTEMA = `Você é um tutor de idiomas que analisa o progresso de estudo de uma pessoa no Karta, um app de flashcards.

Você recebe estatísticas agregadas dos últimos 30 dias. No Karta, cada resposta é "Difícil", "Médio" ou "Fácil".
Cada palavra vira vários tipos de carta (reconhecer a palavra, ouvir, completar a lacuna de uma frase, traduzir uma frase...).

Regras:
- Fale com a pessoa em português do Brasil, na segunda pessoa ("você"), com frases curtas e tom encorajador, sem exagero.
- Baseie TUDO nos números recebidos. Nunca invente palavras, porcentagens ou hábitos que não estejam nos dados.
- Cite palavras concretas dos dados quando ajudar (escreva a palavra no idioma e o significado entre parênteses).
- "resumo": 2 ou 3 frases com o diagnóstico principal.
- "padroes": até 3 padrões que os dados mostram (ex.: um tipo de carta ou uma classe gramatical com mais "Difícil" que as outras). Se não houver padrão claro, lista vazia.
- "sugestoes": até 3 ações práticas que a pessoa pode fazer no Karta (ex.: estudar só as palavras difíceis, prestar atenção à frase na carta de lacuna, ouvir o áudio antes de responder).
- "dados_suficientes": false se os números forem poucos demais para tirar conclusões; nesse caso, diga isso no resumo e deixe as listas vazias.`;

export const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    dados_suficientes: { type: Type.BOOLEAN },
    resumo: { type: Type.STRING },
    padroes: { type: Type.ARRAY, items: { type: Type.STRING } },
    sugestoes: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["dados_suficientes", "resumo", "padroes", "sugestoes"],
  propertyOrdering: ["dados_suficientes", "resumo", "padroes", "sugestoes"],
};

// Confere e limita a resposta da IA antes de mostrar
export function limparAnalise(dados) {
  const lista = (l) => (Array.isArray(l) ? l.map((x) => String(x).trim()).filter(Boolean).slice(0, 3) : []);
  return {
    dados_suficientes: dados?.dados_suficientes !== false,
    resumo: String(dados?.resumo ?? "").trim().slice(0, 600),
    padroes: lista(dados?.padroes),
    sugestoes: lista(dados?.sugestoes),
  };
}

export async function analisarProgresso(ai, modelo, resumo) {
  const r = await ai.models.generateContent({
    model: modelo,
    contents: `Estatísticas de estudo (JSON):\n${JSON.stringify(traduzirResumo(resumo))}`,
    config: { systemInstruction: INSTRUCAO_SISTEMA, responseMimeType: "application/json", responseSchema: SCHEMA, httpOptions: { timeout: 45_000 } },
  });
  return limparAnalise(JSON.parse(r.text));
}
