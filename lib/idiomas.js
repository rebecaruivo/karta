// Configuração de cada idioma. Esse arquivo é usado tanto pela tela
// quanto pelo prompt, então os dois nunca ficam fora de sincronia.

export const IDIOMAS = {
  mandarim: {
    codigoVoz: "zh-CN", // usado pela voz do navegador (plano B)
    nome: "Mandarim",
    sigla: "中",
    niveis: ["HSK 1", "HSK 2", "HSK 3", "HSK 4", "HSK 5", "HSK 6"],
    rotuloLeitura: "Pinyin",
    regraLeitura:
      "pinyin com marcas de tom (ex.: píngguǒ), nunca números de tom; sílabas da mesma palavra juntas",
    regraPalavra: "caracteres simplificados",
  },
  japones: {
    codigoVoz: "ja-JP", // usado pela voz do navegador (plano B)
    nome: "Japonês",
    sigla: "あ",
    niveis: ["N5", "N4", "N3", "N2", "N1"],
    rotuloLeitura: "Leitura",
    regraLeitura: "leitura em hiragana seguida do romaji entre parênteses (ex.: たべる (taberu))",
    regraPalavra: "a forma escrita mais comum (kanji quando usual no nível, senão kana)",
  },
  ingles: {
    codigoVoz: "en-US", // usado pela voz do navegador (plano B)
    nome: "Inglês",
    sigla: "En",
    niveis: ["A1", "A2", "B1", "B2", "C1", "C2"],
    rotuloLeitura: "Pronúncia",
    regraLeitura: "transcrição fonética IPA do inglês americano entre barras (ex.: /ˈæp.əl/)",
    regraPalavra: "a palavra ou expressão em inglês, em minúsculas salvo nomes próprios",
  },
  frances: {
    codigoVoz: "fr-FR", // usado pela voz do navegador (plano B)
    nome: "Francês",
    sigla: "Fr",
    niveis: ["A1", "A2", "B1", "B2", "C1", "C2"],
    rotuloLeitura: "Pronúncia",
    regraLeitura: "transcrição fonética IPA entre barras (ex.: /pɔm/)",
    regraPalavra: "a palavra com artigo definido quando for substantivo (ex.: la pomme)",
  },
  espanhol: {
    codigoVoz: "es-ES", // usado pela voz do navegador (plano B)
    nome: "Espanhol",
    sigla: "Es",
    niveis: ["A1", "A2", "B1", "B2", "C1", "C2"],
    rotuloLeitura: "Pronúncia",
    regraLeitura: "transcrição fonética IPA entre barras (ex.: /ˈman.sa.na/)",
    regraPalavra: "a palavra com artigo definido quando for substantivo (ex.: la manzana)",
  },
};

export const LIMITE_CARTAS = 30;
