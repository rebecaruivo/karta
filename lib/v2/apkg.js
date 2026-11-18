// ─────────────────────────────────────────────────────────────
// EXPORTAÇÃO DA v2 PARA O ANKI (.apkg)
// Usa as partes comuns de lib/anki.js (SQLite, ZIP, mídia, IDs estáveis)
// com um modelo próprio: uma NOTA por palavra (as facetas viram campos) e um
// TIPO DE CARTÃO por ponte do catálogo. Cada carta do Karta vira um cartão do Anki.
//
// Um modelo com campos de leitura: pinyin/hiragana no mandarim e no japonês,
// IPA no inglês, francês e espanhol. A escrita própria (CJK) decide onde o
// áudio aparece; nos idiomas latinos o verso não repete o som.
//
// Áudio: se a gravação do Gemini existe, vai junto no pacote ([sound:]).
// Se não existe, o cartão usa a voz do sistema do Anki ({{tts}}).
// O histórico de estudo (FSRS) não é exportado: os cartões chegam novos no Anki.
// ─────────────────────────────────────────────────────────────

import { montarModelo, criarColecao, empacotar, idEstavel, checksum, escaparHtml, SEPARADOR } from "../anki.js";
import { CATALOGO_PONTES } from "./pontes.js";
import { idiomaV2, leituraDe, leituraParaExibir, classeComGenero } from "./idiomas.js";

export const CAMPOS_COM_LEITURA = [
  "Palavra", "Leitura", "Significado", "Classe",
  "Frase", "FraseDestaque", "FraseLacuna", "FraseLeitura", "FraseTraducao",
  "AudioPalavra", "AudioFrase", "ComAudio",
];
export const CAMPOS_SEM_LEITURA = [
  "Palavra", "Significado", "Classe",
  "Frase", "FraseDestaque", "FraseLacuna", "FraseTraducao",
  "AudioPalavra", "AudioFrase", "ComAudio",
];
export const CAMPOS_V2 = CAMPOS_COM_LEITURA;

const rotulo = (t) => `<div class="rotulo">${t}</div>`;

function modelosPorPonte({ temLeitura, escritaPropria, tts }) {
  const somDe = (audio, texto) => `{{#${audio}}}{{${audio}}}{{/${audio}}}{{^${audio}}}{{tts ${tts}:${texto}}}{{/${audio}}}`;
  const SOM_PALAVRA = somDe("AudioPalavra", "Palavra");
  const SOM_FRASE = somDe("AudioFrase", "Frase");
  const OUVIR_FRASE = `{{#ComAudio}}<div class="ouvir">${SOM_FRASE}</div>{{/ComAudio}}`;
  // Idiomas latinos não repetem o áudio no verso (mesma regra das cartas na tela).
  const OUVIR_PALAVRA = escritaPropria ? `{{#ComAudio}}<div class="ouvir">${SOM_PALAVRA}</div>{{/ComAudio}}` : "";
  const OUVIR_FRASE_VERSO = escritaPropria ? OUVIR_FRASE : "";
  const SOM_PALAVRA_VERSO = escritaPropria ? SOM_PALAVRA : "";
  const leitura = temLeitura ? " · {{Leitura}}" : "";
  const blocoLeituraPalavra = temLeitura ? `<div class="pinyin">{{Leitura}}</div>` : "";
  const blocoLeituraFrase = temLeitura ? `<div class="suave">{{FraseLeitura}}</div>` : "";

  return {
    WORD_TO_MEANING: {
      exige: ["Palavra", "Significado"],
      frente: `${rotulo("Tradução de palavra")}<div class="hanzi">{{Palavra}}</div>`,
      verso: `{{FrontSide}}<hr id="answer"><div class="significado">{{Significado}}</div><div class="suave">{{Classe}}</div>`,
    },
    AUDIO_TO_MEANING: {
      exige: ["Palavra", "Significado"],
      frente: `${rotulo("Tradução de palavra")}${SOM_PALAVRA}`,
      verso: `${rotulo("Tradução de palavra")}<hr id="answer"><div class="significado">{{Significado}}</div><div class="suave"><span class="cjk">{{Palavra}}</span>${leitura}</div>${SOM_PALAVRA_VERSO}`,
    },
    AUDIO_TO_WORD: {
      exige: ["Palavra"],
      frente: `${rotulo("Compreensão de palavra")}${SOM_PALAVRA}`,
      verso: `${rotulo("Compreensão de palavra")}<hr id="answer"><div class="hanzi">{{Palavra}}</div>${blocoLeituraPalavra}${SOM_PALAVRA_VERSO}<div class="dica">{{hint:Significado}}</div>`,
    },
    WORD_TO_AUDIO: {
      exige: ["Palavra"],
      frente: `${rotulo("Pronúncia de palavra")}<div class="hanzi">{{Palavra}}</div>`,
      // Só o controle de áudio no verso: a leitura não se repete embaixo.
      verso: `{{FrontSide}}<hr id="answer">${SOM_PALAVRA}`,
    },
    SENTENCE_AUDIO_TO_SENTENCE: {
      exige: ["Frase"],
      frente: `${rotulo("Compreensão de frase")}${SOM_FRASE}`,
      verso: `${rotulo("Compreensão de frase")}<hr id="answer"><div class="frase">{{FraseDestaque}}</div>${blocoLeituraFrase}${SOM_FRASE}<div class="dica">{{hint:FraseTraducao}}</div>`,
    },
    CLOZE_SENTENCE_TO_WORD: {
      exige: ["FraseLacuna"],
      frente: `${rotulo("Complete a lacuna")}<div class="frase">{{FraseLacuna}}</div><div class="suave">{{FraseTraducao}}</div>`,
      verso: `${rotulo("Complete a lacuna")}<hr id="answer"><div class="frase">{{FraseDestaque}}</div><div class="suave"><span class="cjk">{{Palavra}}</span>${leitura} · {{Significado}}</div>${OUVIR_FRASE_VERSO}${OUVIR_PALAVRA}`,
    },
    MEANING_TO_SENTENCE: {
      exige: ["FraseTraducao"],
      frente: `${rotulo("Tradução para o idioma-alvo")}<div class="traducao">{{FraseTraducao}}</div>`,
      verso: `{{FrontSide}}<hr id="answer"><div class="frase">{{FraseDestaque}}</div>${blocoLeituraFrase}${OUVIR_FRASE_VERSO}`,
    },
  };
}

// Ordem dos tipos de cartão = ordem de apresentação do catálogo (fácil → difícil)
const NOMES = {
  WORD_TO_MEANING: "Palavra → Significado", AUDIO_TO_MEANING: "Áudio → Significado", AUDIO_TO_WORD: "Áudio → Palavra",
  WORD_TO_AUDIO: "Palavra → Áudio", SENTENCE_AUDIO_TO_SENTENCE: "Áudio da frase → Frase",
  CLOZE_SENTENCE_TO_WORD: "Frase com lacuna → Palavra", MEANING_TO_SENTENCE: "Significado → Frase",
};

function tiposDe(cfg) {
  const modelos = modelosPorPonte({ temLeitura: cfg.temLeitura, escritaPropria: cfg.escritaPropria, tts: cfg.codigoTts });
  return [...CATALOGO_PONTES].sort((a, b) => a.ordem - b.ordem)
    .map((p, i) => ({ ponte: p.id, nome: `${i + 1}. ${NOMES[p.id]}`, ...modelos[p.id] }));
}

export const TIPOS_V2 = tiposDe(idiomaV2("zh"));

const cssDe = (cfg) => {
  const fonte = cfg.escritaPropria
    ? (cfg.codigo === "ja" ? '"Noto Sans JP", sans-serif' : '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif')
    : '"Figtree", Arial, sans-serif';
  return `.card { font-family: "Figtree", Arial, sans-serif; text-align: center; color: #0F1B2D; background: #F3F7FF; padding: 28px 20px; }
.rotulo { display: inline-block; font-size: 14px; color: #1E3A8A; background: #DCE7FF; border-radius: 999px; padding: 4px 12px; margin-bottom: 24px; }
.hanzi, .frase, .cjk { font-family: ${fonte}; }
.hanzi { font-size: 72px; line-height: 1.1; }
.frase { font-size: 32px; margin: 8px 0; }
.destaque { color: #1E4FD8; font-weight: 700; box-shadow: inset 0 -4px #B5C9F7; }
.lacuna { display: inline-block; width: 64px; border-bottom: 3px solid #1E4FD8; margin: 0 4px; }
.significado { font-size: 40px; font-weight: 600; margin: 8px 0; }
.traducao { font-size: 28px; font-weight: 500; }
.pinyin { font-size: 22px; margin: 6px 0; }
.suave { color: #475569; font-size: 17px; margin-top: 6px; }
.dica, .ouvir { margin-top: 18px; }
hr#answer { border: 0; border-top: 1px solid #D3DEF3; margin: 24px 0; }`;
};

const ID_MODELO_V2 = idEstavel("karta-modelo-v2-cartas-por-conexao");

// Frase com o trecho da palavra destacado ou trocado pela lacuna (posições calculadas pelo código)
function marcarFrase(frase, indices, modo) {
  const chars = Array.from(frase || "");
  if (!indices) return escaparHtml(frase || "");
  const [ini, fim] = indices;
  const meio = modo === "lacuna" ? `<span class="lacuna"></span>` : `<span class="destaque">${escaparHtml(chars.slice(ini, fim).join(""))}</span>`;
  return escaparHtml(chars.slice(0, ini).join("")) + meio + escaparHtml(chars.slice(fim).join(""));
}

// deck, palavras ([{ concept, facets }]) e cartas vêm de repo.carregarBaralho
// obterAudio(facetId) -> Uint8Array | null
export async function montarApkgV2({ SQL, JSZip, deck, palavras, cartas, obterAudio }) {
  const cfg = idiomaV2(deck.target_language);
  const agoraMs = Date.now();
  const agoraS = Math.floor(agoraMs / 1000);
  const comAudio = (deck.facetas_opcionais ?? ["AUDIO"]).includes("AUDIO");
  const idBaralho = idEstavel(`baralho-v2:${deck.id}`);
  const nomeBaralho = `Karta::${cfg.nome}::${deck.name} (${deck.level})`;
  const tipos = tiposDe(cfg);
  const campos = cfg.temLeitura ? CAMPOS_COM_LEITURA : CAMPOS_SEM_LEITURA;
  const modelo = montarModelo({
    id: ID_MODELO_V2,
    nome: "Karta (cartas por conexão)",
    idBaralho, css: cssDe(cfg), campos, tipos,
  });
  const db = criarColecao({ SQL, modelo, idBaralho, nomeBaralho, descricao: `Gerado pelo Karta (cartas por conexão)${deck.modelo ? ` com ${deck.modelo}` : ""}.` });

  const midia = {};
  const arquivos = [];
  const resumo = { notas: 0, cartoes: 0, audios: 0, semGravacao: 0, porTipo: Object.fromEntries(tipos.map((t) => [t.ponte, 0])) };
  const tags = ` karta cartas-por-conexao ${cfg.chave ?? cfg.codigo} ${String(deck.level).replace(/\s+/g, "")} `;
  const ordDe = Object.fromEntries(tipos.map((t, ord) => [t.ponte, ord]));
  let posicao = 0;

  for (const [i, { concept, facets }] of palavras.entries()) {
    const ativas = cartas.filter((c) => c.concept_id === concept.id && !c.suspended && ordDe[c.bridge_template_id] !== undefined);
    if (!ativas.length) continue;
    const word = facets.find((f) => f.facet_type === "WORD");
    const meaning = facets.find((f) => f.facet_type === "MEANING");
    const sentence = facets.find((f) => f.facet_type === "SENTENCE");
    const audioDe = (pai) => facets.find((f) => f.facet_type === "AUDIO" && f.parent_facet_id === pai?.id);

    // Áudios: só gravações prontas vão no pacote
    const som = {};
    for (const [campo, pai] of [["palavra", word], ["frase", sentence]]) {
      const faceta = audioDe(pai);
      const bytes = comAudio && faceta?.status === "ready" ? await obterAudio(faceta.id) : null;
      if (!bytes) { som[campo] = ""; if (comAudio) resumo.semGravacao++; continue; }
      const nome = `karta_v2_${faceta.id}.wav`;
      const indice = String(arquivos.length);
      midia[indice] = nome;
      arquivos.push({ indice, bytes });
      som[campo] = `[sound:${nome}]`;
      resumo.audios++;
    }

    const indices = sentence?.metadata?.cloze_indices;
    const leitura = leituraParaExibir(leituraDe(word?.metadata), cfg);
    const leituraFrase = leituraDe(sentence?.metadata);
    const valores = cfg.temLeitura
      ? [
        escaparHtml(word?.value), escaparHtml(leitura), escaparHtml(meaning?.value), escaparHtml(classeComGenero(word?.metadata)),
        escaparHtml(sentence?.value), marcarFrase(sentence?.value, indices, "destaque"), indices ? marcarFrase(sentence?.value, indices, "lacuna") : "",
        escaparHtml(leituraFrase), escaparHtml(sentence?.metadata?.translation),
        som.palavra, som.frase, comAudio ? "1" : "",
      ]
      : [
        escaparHtml(word?.value), escaparHtml(meaning?.value), escaparHtml(classeComGenero(word?.metadata)),
        escaparHtml(sentence?.value), marcarFrase(sentence?.value, indices, "destaque"), indices ? marcarFrase(sentence?.value, indices, "lacuna") : "",
        escaparHtml(sentence?.metadata?.translation),
        som.palavra, som.frase, comAudio ? "1" : "",
      ];
    const idNota = agoraMs + i * 10;
    db.run("INSERT INTO notes VALUES (?, ?, ?, ?, -1, ?, ?, ?, ?, 0, '')", [
      idNota, `karta-v2-${concept.id}`, modelo.id, agoraS, tags, valores.join(SEPARADOR), valores[0], await checksum(valores[0]),
    ]);
    resumo.notas++;

    // Um cartão do Anki para cada carta (ativa) do Karta
    for (const carta of ativas) {
      const ord = ordDe[carta.bridge_template_id];
      db.run("INSERT INTO cards VALUES (?, ?, ?, ?, ?, -1, 0, 0, ?, 0, 0, 0, 0, 0, 0, 0, 0, '')", [
        agoraMs + 1_000_000 + i * 10 + ord, idNota, idBaralho, ord, agoraS, ++posicao,
      ]);
      resumo.cartoes++;
      resumo.porTipo[carta.bridge_template_id]++;
    }
  }

  const bytes = await empacotar({ JSZip, db, midia, arquivos });
  return { bytes, resumo, nomeBaralho };
}
