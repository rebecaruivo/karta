// Testes automáticos das partes da v2 que não dependem da IA.
// Uso: npm run testar:v2
import { existsSync, readFileSync } from "node:fs";
import { lerPalavras, validarTema } from "../lib/v2/portaEntrada.js";
import { limparLista, montarPedido as pedidoM1, conferirNoHSK } from "../lib/v2/modulo1.js";
import { montarPedido as pedidoM2, enriquecer } from "../lib/v2/modulo2.js";
import { montarCartas, CATALOGO_PONTES } from "../lib/v2/pontes.js";
import { montarFila, espacarPalavras } from "../lib/v2/sessao.js";
import { separarPorGloss, separarRepetidas, escritasDoBaralho } from "../lib/v2/edicao.js";
import { chavePalavra, consultarBanco, concluirComBanco, bancoPalavrasMemoria } from "../lib/v2/bancoPalavras.js";
import { bancoPalavrasPostgres, ESQUEMA } from "../lib/v2/bancoPalavrasPostgres.js";
import { criarRepositorio } from "../lib/v2/banco.js";
import { adaptadorMemoria, adaptadorIndexedDB, adaptadorServidor, adaptadorMisto } from "../lib/v2/adaptadores.js";
import { TABELAS, montarSQL, paraLinha, paraRegistro, executar, reiniciarEsquema } from "../lib/v2/dadosServidor.js";
import { podeGerarAudio, usaGravacao, usaVozDoNavegador } from "../lib/preferencias.js";
import { calcularLacuna, fraseComLacuna, validarMandarim, validarIdioma, montarPalavraEnriquecida, capitalizarPinyin, alertas } from "../lib/v2/facetas.js";
import { IDIOMAS_V2, IDIOMAS_V2_LISTA, idiomaV2, textoParaVoz, leituraDe, generoCurto, classeComGenero } from "../lib/v2/idiomas.js";
import { instrucaoDoSistema as instrucaoM2, VERSAO_PROMPT } from "../lib/v2/modulo2.js";
import { ehAdmin, emailsAdmin } from "../lib/auth/admin.js";
import { registrarEventos } from "../lib/v2/eventosServidor.js";

let falhas = 0;
const conferir = (ok, msg) => { console.log(`${ok ? "✓" : "✗"} ${msg}`); if (!ok) falhas++; };
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log("— Porta de entrada");
const r1 = lerPalavras("água, Arroz,arroz ;  casa\nbanco (dinheiro),, ", { target_language: "zh", level: "HSK 1" });
conferir(igual(r1.wordList.words.map((w) => w.gloss), ["água", "Arroz", "casa", "banco"]), "separa por vírgula, ponto e vírgula e linha; tira vazios e repetidas");
conferir(r1.wordList.words[3].sense_hint === "dinheiro", "lê a dica de sentido entre parênteses");
conferir(r1.avisos.some((a) => a.includes("repetida")), "avisa sobre a palavra repetida");
conferir(r1.wordList.origin === "user", "marca origin = user");
conferir(Boolean(lerPalavras(" , ;", { target_language: "zh", level: "HSK 1" }).erro), "lista vazia dá erro");
conferir(lerPalavras(Array.from({ length: 60 }, (_, i) => `p${i}`).join(","), {}).wordList.words.length === 50, "corta em 50 palavras");

console.log("\n— Lacuna (a função é a mesma para todos os idiomas; cada caso testa uma situação)");
conferir(igual(calcularLacuna("我喝水。", "水").indices, [2, 3]), "mandarim · substantivo: 我喝水。 com alvo 水 -> [2, 3) (início incluído, fim excluído)");
conferir(fraseComLacuna("我喝水。", [2, 3]) === "我喝＿＿。", "mandarim · monta a frase com lacuna: 我喝＿＿。");
conferir(igual(calcularLacuna("水を飲みます。", "飲みます").indices, [2, 6]), "japonês · verbo conjugado: acha 飲みます na frase, embora o lema seja 飲む (o mandarim não conjuga, por isso o caso é em japonês)");
conferir(Boolean(calcularLacuna("水水很好。", "水").erro), "mandarim · alvo repetido na frase (水水) é recusado");
conferir(Boolean(calcularLacuna("我喝茶。", "水").erro), "mandarim · alvo que não está na frase é recusado");
conferir(igual(calcularLacuna("Je mange une pomme.", "mange").indices, [3, 8]), "francês · verbo conjugado em alfabeto latino: acha mange (lema: manger)");

console.log("\n— Validação do perfil mandarim");
const boa = { lemma: "水", pinyin: "shuǐ", pos: "substantivo", meaning: "água", sentence: "我喝水。", target_in_sentence: "水", sentence_pinyin: "Wǒ hē shuǐ.", sentence_translation: "Eu bebo água." };
conferir(validarMandarim(boa).length === 0, "carta boa passa sem problemas");
conferir(validarMandarim({ ...boa, pinyin: "shui3" }).some((p) => p.includes("número de tom")), "pega pinyin com número de tom");
conferir(validarMandarim({ ...boa, lemma: "agua" }).some((p) => p.includes("hanzi")), "pega escrita que não é hanzi");

console.log("\n— Facetas derivadas e alertas (prompt v2)");
conferir(capitalizarPinyin("wǒ xiǎng hē shuǐ.") === "Wǒ xiǎng hē shuǐ.", "mandarim · pinyin da frase com maiúscula, inclusive em letra com tom (wǒ -> Wǒ)");
conferir(alertas({ ambiguous: true, other_senses: "assento: 长椅", level_fit: true, note: "" })[0] === "ambígua: também pode ser assento: 长椅", "palavra ambígua vira alerta com os outros sentidos");
conferir(alertas({ ambiguous: false, other_senses: "", level_fit: false, note: "" })[0] === "acima do nível pedido", "palavra acima do nível vira alerta");
conferir(alertas({ ambiguous: false, other_senses: "", level_fit: true, note: "" }).length === 0, "palavra sem ressalvas não gera alerta");

console.log("\n— Palavra enriquecida (formato do documento)");
const pe = montarPalavraEnriquecida({ id: "w1", gloss: "água", sense_hint: null }, boa, { deck_id: "d1", language: "zh", origin: "user" });
conferir(igual(pe.facets.map((f) => f.facet_type), ["WORD", "MEANING", "SENTENCE", "AUDIO", "AUDIO"]), "5 facetas: WORD, MEANING, SENTENCE e 2 AUDIO");
conferir(igual(pe.facets[2].metadata.cloze_indices, [2, 3]), "SENTENCE traz cloze_indices calculado pelo código");
conferir(pe.facets[3].parent_facet_id === pe.facets[0].id && pe.facets[4].parent_facet_id === pe.facets[2].id, "áudios apontam para a escrita e para a frase (parent_facet_id)");
conferir(pe.facets.filter((f) => f.facet_type === "AUDIO").every((f) => f.status === "pending"), "áudios nascem pending");
conferir(!("audio_slow_url" in pe.facets[3].metadata), "sem audio_slow_url: a versão lenta é tocada no navegador");


console.log("\n— Módulo 1: geração de palavras a partir de um tema");
conferir(Boolean(validarTema("  ").erro) && Boolean(validarTema("x".repeat(81)).erro) && validarTema(" frutas ").tema === "frutas", "porta de entrada valida o tema: vazio e longo demais são recusados");
const lista = limparLista([{ lemma: "苹果", gloss: "maçã" }, { lemma: "苹果", gloss: "maçã" }, { lemma: "香蕉", gloss: "banana" }, { lemma: "apple", gloss: "maçã" }, { lemma: "西瓜", gloss: "melancia" }, { lemma: "葡萄", gloss: "uva" }], { count: 2, existing_words: ["香蕉"] });
conferir(lista.palavras.map((p) => p.lemma).join() === "苹果,西瓜", "remove repetidas, já existentes no baralho e inválidas; respeita a quantidade");
conferir(lista.descartadas.some((d) => d.motivo === "já existe no baralho") && lista.descartadas.some((d) => d.motivo === "repetida") && lista.descartadas.some((d) => d.motivo === "inválida"), "registra o motivo de cada descarte");
conferir(pedidoM1({ theme: "frutas", level: "HSK 1", count: 5, existing_words: ["香蕉"] }).includes("não repita): 香蕉"), "\"gerar mais\": as palavras que o baralho já tem vão no pedido");
conferir(pedidoM2([{ id: "w1", gloss: "água", lemma: "水" }], "HSK 1").includes("(em mandarim: 水)"), "Módulo 2 recebe a palavra em mandarim escolhida pelo Módulo 1");
const trocou = montarPalavraEnriquecida({ id: "w1", gloss: "água", lemma: "水" }, { ...boa, lemma: "开水" }, { deck_id: "d1", language: "zh", origin: "ai" });
conferir(trocou.problemas.some((p) => p.includes("trocou a palavra escolhida")), "se o Módulo 2 trocar a palavra escolhida, a checagem acusa");
const ia = { models: { generateContent: async () => ({ text: JSON.stringify({ words: [{ id: "w1", ...boa }, { id: "w2", ...boa, lemma: "茶", target_in_sentence: "茶", sentence: "我喝茶。" }] }), usageMetadata: {} }) } };
const mista = await enriquecer(ia, "simulado", { origin: "theme", target_language: "zh", level: "HSK 1", words: [{ id: "w1", gloss: "água", lemma: "水", origin: "ai" }, { id: "w2", gloss: "chá", origin: "user" }] });
conferir(mista.resultados[0].concept.origin === "ai" && mista.resultados[1].concept.origin === "user", "baralho com origem mista: palavra da IA fica \"ai\", palavra acrescentada fica \"user\"");

const hsk = { 西瓜: 2, 苹果: 3, 葡萄: 5 };
const conferidas = conferirNoHSK([{ lemma: "析璉", gloss: "melancia" }, { lemma: "苹果", gloss: "maçã" }, { lemma: "葡萄", gloss: "uva" }], hsk, "HSK 3");
conferir(conferidas[0].lemma === null && conferidas[0].lemma_descartado === "析璉", "caractere errado (fora da lista do HSK) perde o lemma e será retraduzido");
conferir(!conferidas[1].acima_do_nivel && conferidas[2].acima_do_nivel && conferidas[2].hsk === 5, "palavra acima do nível pedido é marcada, não removida");
conferir(conferirNoHSK([{ lemma: "析璉", gloss: "x" }], null, "HSK 1")[0].lemma === "析璉", "sem a lista baixada, a checagem fica desligada");
conferir(pedidoM1({ theme: "frutas", level: "HSK 1", count: 5 }) && (await import("../lib/v2/modulo1.js")).INSTRUCAO_SISTEMA.includes("devolva MENOS"), "prompt manda devolver menos em vez de sair do tema");
const m1 = await import("../lib/v2/modulo1.js");
conferir(!m1.INSTRUCAO_SISTEMA.includes('"comida" é amplo') && m1.INSTRUCAO_SISTEMA.includes("comida, família"), "prompt v3: o exemplo não ensina mais a recusar \"comida\"; temas amplos do dia a dia são aceitos");
const iaRecusa = { models: { generateContent: async () => ({ text: JSON.stringify({ theme_ok: false, suggested_themes: [" frutas: 苹果, 香蕉", "", "苹果", "pratos do dia a dia", "x".repeat(60), "bebidas", "doces"], words: [] }) }) } };
const recusa = await m1.gerarPalavras(iaRecusa, "simulado", { theme: "coisas", level: "HSK 1", count: 5 });
conferir(recusa.refinar.join("|") === "frutas|pratos do dia a dia|bebidas", "tema recusado devolve até 3 sugestões limpas (sem exemplos depois de \":\", sem chinês, sem vazias nem longas demais)");

console.log("\n— Banco de palavras (palavras já geradas não gastam a cota)");
conferir(chavePalavra({ versao: 4, language: "zh", level: "HSK 1", gloss: " Água ", sense_hint: null }) === chavePalavra({ versao: 4, language: "zh", level: "hsk 1", gloss: "água", sense_hint: "" }), "a chave ignora maiúsculas e espaços (\"Água\" = \"água\")");
conferir(chavePalavra({ versao: 4, language: "zh", level: "HSK 1", gloss: "água" }) !== chavePalavra({ versao: 5, language: "zh", level: "HSK 1", gloss: "água" }), "prompt novo = chave nova (as palavras antigas deixam de valer sozinhas)");
conferir(chavePalavra({ versao: 4, language: "zh", level: "HSK 1", gloss: "banco", sense_hint: "dinheiro" }) !== chavePalavra({ versao: 4, language: "zh", level: "HSK 1", gloss: "banco", sense_hint: "assento" }), "sentidos diferentes não se misturam (banco · dinheiro ≠ banco · assento)");

// Gemini simulado: conta quantas palavras realmente foram pedidas
const respostas = { água: boa, chá: { ...boa, lemma: "茶", target_in_sentence: "茶", sentence: "我喝茶。", meaning: "chá" }, xyz: { ...boa, lemma: "龘", target_in_sentence: "龘", sentence: "龘龘。" } };
let pedidas = 0;
const iaContando = { models: { generateContent: async ({ contents }) => {
  const ids = [...contents.matchAll(/id (w\d+): "([^"]+)"/g)];
  pedidas += ids.length;
  return { text: JSON.stringify({ words: ids.map(([, id, g]) => ({ id, ...respostas[g] })) }), usageMetadata: {} };
} } };
const bancoT = bancoPalavrasMemoria();
const hsk2 = { 水: 1, 茶: 1 };
async function criar(words, { regerar = false } = {}) {
  const wl = { origin: "words", target_language: "zh", level: "HSK 1", words };
  const c = await consultarBanco(wl, { banco: bancoT, versao: 4, ignorar: regerar });
  const ia = c.faltam.length ? (await enriquecer(iaContando, "simulado", { ...wl, words: c.faltam })).resultados : [];
  return { c, resultados: await concluirComBanco(wl, { ...c, resultadosIA: ia, banco: bancoT, versao: 4, dicionario: hsk2, substituir: regerar }) };
}
const p1 = await criar([{ id: "w1", gloss: "água" }, { id: "w2", gloss: "chá" }, { id: "w3", gloss: "xyz" }]);
conferir(pedidas === 3 && bancoT.dados.size === 2, "1ª pessoa: as 3 palavras vão para a IA; só as 2 que estão na lista do HSK entram no banco");
conferir(p1.resultados.every((r) => !("_bruto" in r) && !("_entradaId" in r)), "campos internos do banco de palavras não vão para o navegador");
const linha = [...bancoT.dados.values()][0];
conferir(linha.lemma === "水" && linha.meaning && !("id" in linha), "guarda a resposta campo a campo, sem o id do pedido");
pedidas = 0;
const p2 = await criar([{ id: "w1", gloss: "chá" }, { id: "w2", gloss: "sol" }, { id: "w3", gloss: "Água" }]);
conferir(pedidas === 1 && p2.c.doBanco.size === 2, "2ª pessoa: \"chá\" e \"Água\" vêm do banco; só \"sol\" vai para a IA");
conferir(p2.resultados.map((r) => r.concept.gloss).join() === "chá,sol,Água", "a ordem original das palavras é mantida");
const idsP1 = p1.resultados[0].facets.map((f) => f.id), idsP2 = p2.resultados[2].facets.map((f) => f.id);
conferir(p2.resultados[2].facets[0].value === "水" && !idsP1.some((id) => idsP2.includes(id)), "palavra do banco ganha IDs novos (dois baralhos nunca compartilham facetas)");
pedidas = 0;
await criar([{ id: "w1", gloss: "água", lemma: "开水" }]);
conferir(pedidas === 1, "se o Módulo 1 escolheu outro mandarim, a versão do banco não é usada");
const antes = bancoT.dados.get(chavePalavra({ versao: 4, language: "zh", level: "HSK 1", gloss: "chá" }));
respostas.chá = { ...respostas.chá, sentence: "她喝茶。", sentence_translation: "Ela bebe chá." };
pedidas = 0;
await criar([{ id: "w1", gloss: "chá" }], { regerar: true });
const depoisR = bancoT.dados.get(chavePalavra({ versao: 4, language: "zh", level: "HSK 1", gloss: "chá" }));
conferir(pedidas === 1 && antes.sentence === "我喝茶。" && depoisR.sentence === "她喝茶。", "\"Gerar de novo\" ignora o banco e substitui a versão guardada");
const erroBanco = { buscar: async () => new Map(), guardar: async () => { throw new Error("banco fora do ar"); } };
const wlE = { origin: "words", target_language: "zh", level: "HSK 1", words: [{ id: "w1", gloss: "água" }] };
const cE = await consultarBanco(wlE, { banco: erroBanco, versao: 4 });
const rE = await concluirComBanco(wlE, { ...cE, resultadosIA: (await enriquecer(iaContando, "simulado", wlE)).resultados, banco: erroBanco, dicionario: hsk2 });
conferir(rE.length === 1 && rE[0].facets.length > 0, "se o banco falhar ao guardar, a palavra chega mesmo assim (o banco nunca derruba a criação)");

// Adaptador do Postgres com um banco simulado: confere o SQL sem precisar do Neon
const tabela = new Map(); const comandos = [];
const colunas = (q) => q.match(/INSERT INTO palavras_geradas \(([^)]+)\)/)?.[1].split(",").map((c) => c.trim());
const sqlFalso = Object.assign(async (partes, ...vals) => {   // forma de template (buscar)
  const q = partes.join("?"); comandos.push(q);
  if (q.startsWith("UPDATE palavras_geradas SET usos")) return vals[0].filter((c) => tabela.has(c)).map((c) => { const l = tabela.get(c); l.usos++; return l; });
  return [];
}, { query: async (q, vals = []) => {                          // forma com $1, $2... (criar tabela, guardar)
  comandos.push(q);
  const cols = colunas(q);
  if (cols) { const linha = Object.fromEntries(cols.map((c, i) => [c, vals[i]])); if (!tabela.has(linha.chave) || q.includes("DO UPDATE")) tabela.set(linha.chave, { ...linha, usos: tabela.get(linha.chave)?.usos ?? 0 }); }
  return [];
} });
const pg = await bancoPalavrasPostgres(null, { sqlTeste: sqlFalso });
conferir(ESQUEMA.every((cmd) => comandos.includes(cmd)), "cria a tabela palavras_geradas e o índice na primeira vez");
const respostaChá = { ...boa, lemma: "茶", meaning: "chá", sentence: "我喝茶。", target_in_sentence: "茶", ambiguous: false, other_senses: "", level_fit: true, note: "" };
await pg.guardar([{ chave: "k1", resposta: respostaChá, partes: { versao: 4, idioma: "zh", nivel: "HSK 1", entrada: "chá", sentido: null, hsk: 1 } }]);
const gravada = tabela.get("k1");
conferir(colunas(comandos.at(-1)).length === 20 && gravada.lemma === "茶" && gravada.significado === "chá" && gravada.frase === "我喝茶。" && gravada.hsk === 1 && gravada.versao_prompt === 4 && gravada.entrada === "chá" && gravada.genero === null, "cada valor vai para a coluna certa (20 colunas)");
conferir(ESQUEMA.some((c) => c.includes("RENAME COLUMN pinyin TO leitura")) && ESQUEMA.some((c) => c.includes("ADD COLUMN IF NOT EXISTS genero")), "migração: bancos antigos renomeiam pinyin → leitura e ganham a coluna genero, sem perder dados");
const voltou = (await pg.buscar(["k1", "nao-existe"])).get("k1");
conferir(voltou.lemma === "茶" && voltou.sentence === "我喝茶。" && voltou.target_in_sentence === "茶" && voltou.pos === boa.pos, "a linha do banco volta no mesmo formato da resposta da IA");
conferir(tabela.get("k1").usos === 1, "cada reaproveitamento soma 1 em \"usos\"");
await pg.guardar([{ chave: "k1", resposta: { ...respostaChá, sentence: "她喝茶。" }, partes: { versao: 4, idioma: "zh", nivel: "HSK 1", entrada: "chá", sentido: null, hsk: 1 } }]);
conferir(tabela.get("k1").frase === "我喝茶。", "guardar de novo a mesma palavra não sobrescreve (vale a primeira versão)");
await pg.guardar([{ chave: "k1", resposta: { ...respostaChá, sentence: "她喝茶。" }, partes: { versao: 4, idioma: "zh", nivel: "HSK 1", entrada: "chá", sentido: null, hsk: 1 } }], { substituir: true });
conferir(tabela.get("k1").frase === "她喝茶。" && tabela.get("k1").usos === 1, "\"Gerar de novo\" substitui a versão e mantém a contagem de usos");

console.log("\n— Gênero (francês e espanhol) e versão do prompt");
conferir(VERSAO_PROMPT === 5, "prompt do Módulo 2 na versão 5 (leitura IPA, sem artigo, com gênero)");
conferir(chavePalavra({ versao: VERSAO_PROMPT, language: "fr", level: "A1", gloss: "maçã" }).startsWith("m2:v5:fr:"), "a versão nova entra na chave do banco: palavras antigas não são servidas no formato novo");
conferir(instrucaoM2(idiomaV2("fr")).includes('"genero"') && !instrucaoM2(idiomaV2("zh")).includes('"genero"'), "o prompt pede o gênero só nos idiomas que têm gênero");
const pomme = montarPalavraEnriquecida({ id: "w1", gloss: "maçã" }, { lemma: "pomme", leitura: "/pɔm/", pos: "substantivo", genero: "F", meaning: "maçã", sentence: "Je mange une pomme.", target_in_sentence: "pomme", frase_leitura: "/ʒə mɑ̃ʒ yn pɔm/", sentence_translation: "Eu como uma maçã." }, { deck_id: "d", language: "fr", origin: "user" });
const wordPomme = pomme.facets.find((f) => f.facet_type === "WORD");
conferir(wordPomme.metadata.genero === "f" && generoCurto(wordPomme.metadata) === "f." && classeComGenero(wordPomme.metadata) === "substantivo feminino", "francês: gênero normalizado (\"F\" → f) e mostrado como \"f.\" e \"substantivo feminino\"");
const hablar = montarPalavraEnriquecida({ id: "w1", gloss: "falar" }, { lemma: "hablar", leitura: "/aˈβlaɾ/", pos: "verbo", genero: "talvez", meaning: "falar", sentence: "Quiero hablar contigo.", target_in_sentence: "hablar", frase_leitura: "x", sentence_translation: "Quero falar com você." }, { deck_id: "d", language: "es", origin: "user" });
conferir(!("genero" in hablar.facets[0].metadata) && classeComGenero(hablar.facets[0].metadata) === "verbo", "valor de gênero inválido é descartado (só m/f)");
const shui = montarPalavraEnriquecida({ id: "w1", gloss: "água" }, { ...boa, genero: "m" }, { deck_id: "d", language: "zh", origin: "user" });
conferir(!("genero" in shui.facets[0].metadata), "mandarim não guarda gênero, mesmo se a IA mandar");

console.log("\n— Painel e eventos: segurança");
const admins = emailsAdmin(" Rebeca@Exemplo.com , outra@x.com ");
conferir(ehAdmin({ email: "rebeca@exemplo.com", emailVerified: true }, admins), "administradora com e-mail verificado entra no painel");
conferir(!ehAdmin({ email: "rebeca@exemplo.com", emailVerified: false }, admins) && !ehAdmin({ email: "rebeca@exemplo.com" }, admins), "mesmo e-mail SEM verificação não entra (alguém pode ter criado a conta com o e-mail dela)");
conferir(!ehAdmin({ email: "intrusa@x.com", emailVerified: true }, admins) && !ehAdmin(null, admins), "e-mail fora da lista, ou sem login, não entra");
const gravados = [];
const sqlEventos = { query: async (q, v = []) => { if (q.startsWith("INSERT INTO eventos")) gravados.push(v); if (q.startsWith("SELECT count")) return [{ n: 0 }]; return []; } };
const uuid = () => crypto.randomUUID();
await registrarEventos(sqlEventos, { deviceId: uuid(), eventos: [
  { event_id: uuid(), tipo: "carta_respondida", rating: "nao", payload: { origem: "teste" } },
  { event_id: uuid(), tipo: "carta_respondida", rating: "acho", payload: { lixo: "x".repeat(5000) } },
  { event_id: uuid(), tipo: "tipo_inventado" },
] });
conferir(gravados.length === 2 && gravados[0][12] === '{"origem":"teste"}' && gravados[1][12] === null, "payload pequeno é gravado; payload enorme é descartado; tipo desconhecido é ignorado");

console.log("\n— Módulo 3: montagem de pontes");
const base = (gloss, ajuste = {}) => montarPalavraEnriquecida({ id: gloss, gloss, sense_hint: null }, { ...boa, ...ajuste }, { deck_id: "d1", language: "zh", origin: "user" });
const agua = base("água");
const { cartas: c1, naoCriadas: n1 } = montarCartas([agua]);
conferir(c1.length === 7 && n1.length === 0, "palavra completa gera 7 cartas (uma por ponte do catálogo)");
conferir(c1.every((c) => c.state === "NEW" && c.stability === null && !("user_id" in c)), "cartas nascem NEW, sem estado de memória e sem user_id");
const pontesDeAudio = CATALOGO_PONTES.filter((p) => [...p.front_facet_types, ...p.back_facet_types].includes("AUDIO")).map((p) => p.id);
conferir(pontesDeAudio.length === 4 && pontesDeAudio.every((id) => c1.some((c) => c.bridge_template_id === id)), "áudio pendente não impede as 4 pontes de áudio (a carta usa a voz do navegador)");
const semLacuna = base("chá", { target_in_sentence: "咖啡" });
const { cartas: c2, naoCriadas: n2 } = montarCartas([semLacuna]);
conferir(c2.length === 6 && n2[0]?.ponte === "CLOZE_SENTENCE_TO_WORD" && n2[0].motivo === "frase sem lacuna válida", "sem lacuna válida: 6 cartas, e o motivo da que faltou fica registrado");
const semTraducao = base("sol", { sentence_translation: "" });
conferir(montarCartas([semTraducao]).naoCriadas.some((n) => n.ponte === "MEANING_TO_SENTENCE" && n.motivo === "frase sem tradução"), "sem tradução da frase: a ponte Significado → Frase não é criada");
const falhou = base("céu"); falhou.facets[0].status = "failed";
conferir(montarCartas([falhou]).cartas.every((c) => !["AUDIO_TO_WORD", "WORD_TO_AUDIO", "WORD_TO_MEANING", "AUDIO_TO_MEANING", "CLOZE_SENTENCE_TO_WORD"].includes(c.bridge_template_id)), "escrita com falha: nenhuma ponte que mostra a escrita é criada");
const soAtivas = CATALOGO_PONTES.map((p) => ({ ...p, active: p.id === "WORD_TO_MEANING" }));
conferir(montarCartas([agua], { catalogo: soAtivas }).cartas.length === 1, "ponte desativada não gera carta");
conferir(montarCartas([agua], { existentes: c1 }).cartas.length === 0, "rodar de novo não duplica (conceito + ponte é único)");

console.log("\n— Áudio opcional no baralho (opção a)");
const semAudio = montarCartas([agua], { facetasOpcionais: [] });
conferir(semAudio.cartas.map((c) => c.bridge_template_id).sort().join() === "CLOZE_SENTENCE_TO_WORD,MEANING_TO_SENTENCE,WORD_TO_MEANING", "sem exercícios de áudio: 3 cartas (palavra → significado, significado → frase, lacuna)");
conferir(semAudio.naoCriadas.length === 0, "as pontes de áudio não contam como \"não criadas\": estão desligadas de propósito");
conferir(montarCartas([agua], { facetasOpcionais: ["AUDIO"] }).cartas.length === 7, "com áudio: 7 cartas");
const semFacetaAudio = { ...agua, facets: agua.facets.filter((f) => f.facet_type !== "AUDIO") };
conferir(montarCartas([semFacetaAudio], { facetasOpcionais: [] }).cartas.length === 3, "o botão \"Ouvir frase\" é auxiliar: a carta de lacuna existe mesmo sem faceta de áudio");

console.log("\n— Modo de áudio (Configurações)");
conferir(podeGerarAudio("cota_e_navegador") && usaGravacao("cota_e_navegador") && usaVozDoNavegador("cota_e_navegador"), "cota e navegador: gera, toca a gravação e usa a voz do navegador como reserva");
conferir(podeGerarAudio("cota") && usaGravacao("cota") && !usaVozDoNavegador("cota"), "só a cota: gera e toca a gravação, sem voz do navegador");
conferir(!podeGerarAudio("navegador") && !usaGravacao("navegador") && usaVozDoNavegador("navegador"), "só o navegador: nunca gera (nunca gasta cota), sempre a voz do aparelho");

console.log("\n— Fila de estudo (tudo disponível, embaralhado, sem limite diário)");
const agora = new Date("2026-11-15T15:00:00");
const tres = ["água", "chá", "sol"].map((g) => base(g + "!"));
const todas = montarCartas(tres, { agora }).cartas;
conferir(montarFila(todas, { agora }).length === 21, "3 palavras × 7 cartas: as 21 entram na fila desde a criação (sem limite diário)");
let semente = 1; const previsivel = () => ((semente = (semente * 16807) % 2147483647) / 2147483647);
const ordem1 = montarFila(todas, { agora, aleatorio: previsivel }).map((c) => c.id).join();
const ordem2 = montarFila(todas, { agora, aleatorio: previsivel }).map((c) => c.id).join();
conferir(ordem1 !== todas.map((c) => c.id).join() && ordem1 !== ordem2, "a fila vem embaralhada (e muda a cada sessão)");
conferir(new Set(montarFila(todas, { agora }).map((c) => c.id)).size === 21, "embaralhar não perde nem repete cartas");
const comSuspensa = todas.map((c, i) => (i === 0 ? { ...c, suspended: true } : c));
conferir(!montarFila(comSuspensa, { agora }).some((c) => c.id === todas[0].id), "carta suspensa não entra");
const futura = todas.map((c, i) => (i === 1 ? { ...c, state: "REVIEW", due_at: "2026-11-20T10:00:00" } : c));
conferir(!montarFila(futura, { agora }).some((c) => c.id === todas[1].id), "carta com revisão marcada para o futuro não entra");

const vizinhas = (f) => f.some((c, i) => i > 0 && c.concept_id === f[i - 1].concept_id);
let semVizinhas = true;
let perdeu = false;
for (let n = 0; n < 500; n++) { const f = montarFila(todas, { agora }); if (vizinhas(f)) semVizinhas = false; if (new Set(f.map((c) => c.id)).size !== 21) perdeu = true; }
conferir(semVizinhas && !perdeu, "duas cartas da mesma palavra nunca aparecem em sequência, sem perder cartas (500 filas sorteadas)");
const sobrou = espacarPalavras([{ id: 1, concept_id: "a" }, { id: 2, concept_id: "a" }]);
conferir(sobrou.length === 2, "se só sobrou uma palavra, a sequência é aceita (nenhuma carta se perde)");

const cabeca = { id: "x", concept_id: "a" };
const resto = espacarPalavras([cabeca, { id: 1, concept_id: "a" }, { id: 2, concept_id: "b" }, { id: 3, concept_id: "c" }]);
conferir(resto[0] === cabeca && !vizinhas(resto), "no estudo, a carta respondida fica parada e a próxima nunca é da mesma palavra");

console.log("\n— Editar baralho já criado");
const doBaralho = [base("água"), base("chá", { lemma: "茶" })];
const porGloss = separarPorGloss([{ gloss: "Água" }, { gloss: "sol" }, { gloss: "sol " }], doBaralho);
conferir(porGloss.seguir.map((p) => p.gloss).join() === "sol" && porGloss.repetidas.length === 2, "palavra digitada que o baralho já tem (ou repetida na lista) não vai para a IA");
const rep = separarRepetidas([base("xícara", { lemma: "茶" }), base("sol", { lemma: "太阳" }), base("astro", { lemma: "太阳" })], doBaralho);
conferir(rep.novas.length === 1 && rep.repetidas.length === 2, "depois do Módulo 2, mandarim que o baralho já tem (ou repetido no lote) não entra de novo");
conferir(escritasDoBaralho(doBaralho).join() === "水,茶", "\"pedir mais à IA\" recebe as escritas do baralho para não repetir");

// Os mesmos testes rodam em cada adaptador de armazenamento
async function testarRepositorio(nome, db) {
  console.log(`\n— Armazenamento (${nome})`);
  const repo = criarRepositorio(db);
  await repo.iniciar(); await repo.iniciar();
  conferir((await repo.pontes()).length === 7, "catálogo de 7 pontes gravado uma vez só, mesmo iniciando duas vezes");

  const deck = await repo.criarBaralho({ name: "Comida", creation_mode: "words", target_language: "zh", level: "HSK 2" });
  const palavras = ["água", "chá"].map((g) => base(g));
  const r = await repo.adicionarPalavras(deck.id, palavras);
  conferir(r.palavras === 2 && r.cartas === 14, "guarda 2 palavras e cria 14 cartas (7 por palavra)");
  const [lista] = await repo.listarBaralhos();
  conferir(lista.palavras === 2 && lista.cartas === 14, "a biblioteca conta palavras e cartas separadas (\"2 palavras · 14 cartas\")");

  const r2 = await repo.adicionarPalavras(deck.id, [base("sol")]);
  const b = await repo.carregarBaralho(deck.id);
  conferir(r2.cartas === 7 && b.cartas.length === 21 && b.palavras.map((p) => p.concept.position).join() === "0,1,2", "adicionar palavras não reprocessa as antigas e mantém a ordem");
  conferir(b.cartas.every((c) => c.deck_id === deck.id), "cada carta sabe a qual baralho pertence");

  const aguaSalva = b.palavras[0];
  const escrita = aguaSalva.facets.find((f) => f.facet_type === "WORD");
  const afetadas = await repo.cartasAfetadas(escrita.id);
  conferir(afetadas.length === 5, "editar a escrita afeta 5 das 7 cartas da palavra (as que mostram a escrita)");
  const estudada = { ...b.cartas.find((c) => c.concept_id === aguaSalva.concept.id && c.bridge_template_id === "WORD_TO_MEANING"), state: "REVIEW", reps: 3, stability: 4.2 };
  await repo.atualizarCarta(estudada);
  const { reiniciadas } = await repo.editarFaceta(escrita.id, { value: "开水" });
  const depois = await repo.carregarBaralho(deck.id);
  const cartaDepois = depois.cartas.find((c) => c.id === estudada.id);
  const fac = depois.palavras[0].facets;
  conferir(reiniciadas === 5 && cartaDepois.state === "NEW" && cartaDepois.reps === 0 && cartaDepois.stability === null, "editar a escrita reinicia as cartas que a usam (volta a NEW e zera a memória)");
  conferir(fac.find((f) => f.id === escrita.id).edited_by_user === true, "a faceta editada fica marcada (não será sobrescrita pela IA)");
  conferir(fac.find((f) => f.facet_type === "AUDIO" && f.parent_facet_id === escrita.id).status === "pending", "mudar a escrita deixa o áudio dela pendente de novo");

  await repo.atualizarCarta({ ...cartaDepois, state: "REVIEW", reps: 2 });
  const significado = fac.find((f) => f.facet_type === "MEANING");
  const pequena = await repo.editarFaceta(significado.id, { value: "água." }, { reiniciar: false });
  conferir(pequena.reiniciadas === 0 && (await repo.carregarBaralho(deck.id)).cartas.find((c) => c.id === estudada.id).reps === 2, "correção pequena (reiniciar: false) não apaga o histórico de estudo");

  const audio = fac.find((f) => f.facet_type === "AUDIO");
  await repo.salvarAudio(audio.id, "bytes-do-wav");
  conferir((await repo.obterAudio(audio.id)) === "bytes-do-wav" && !(await repo.audiosPendentes(deck.id)).some((a) => a.id === audio.id), "áudio salvo vira ready e sai da contagem de pendentes");

  const posAntes = (await repo.carregarBaralho(deck.id)).palavras.map((p) => p.concept.gloss).join();
  const chaSalvo = (await repo.carregarBaralho(deck.id)).palavras[1];
  await repo.substituirPalavra(chaSalvo.concept.id, base("chá", { lemma: "茶" }));
  const trocado = await repo.carregarBaralho(deck.id);
  conferir(trocado.palavras.map((p) => p.concept.gloss).join() === posAntes && trocado.palavras[1].facets.find((f) => f.facet_type === "WORD").value === "茶", "gerar de novo: a nova versão fica no mesmo lugar da lista");
  conferir(trocado.cartas.length === 21 && !trocado.cartas.some((c) => c.concept_id === chaSalvo.concept.id), "gerar de novo: as cartas antigas saem e as novas entram (7 por palavra)");

  await repo.suspenderCarta(estudada.id);
  conferir((await repo.carregarBaralho(deck.id)).cartas.find((c) => c.id === estudada.id).suspended === true, "suspender carta (em vez de excluir)");

  await repo.excluirPalavra(aguaSalva.concept.id);
  const semAgua = await repo.carregarBaralho(deck.id);
  conferir(semAgua.palavras.length === 2 && semAgua.cartas.length === 14 && (await repo.obterAudio(audio.id)) === null, "excluir palavra remove facetas, cartas e áudio dela");

  const deckSemAudio = await repo.criarBaralho({ name: "Sem áudio", creation_mode: "words", target_language: "zh", level: "HSK 1", facetas_opcionais: [] });
  const rs = await repo.adicionarPalavras(deckSemAudio.id, [base("lua")]);
  conferir(rs.cartas === 3 && (await repo.audiosPendentes(deckSemAudio.id)).length === 0, "baralho sem áudio: 3 cartas por palavra e nenhuma gravação a gerar");
  // Ligar/desligar áudio depois de criado
  const pessoal = (await repo.carregarBaralho(deckSemAudio.id)).cartas[0];
  await repo.suspenderCarta(pessoal.id); // suspensão da própria pessoa: não pode ser desfeita pelo áudio
  const lig = await repo.definirAudio(deckSemAudio.id, true);
  const comAudioAgora = await repo.carregarBaralho(deckSemAudio.id);
  conferir(lig.criadas === 4 && comAudioAgora.cartas.length === 7 && comAudioAgora.deck.facetas_opcionais.includes("AUDIO"), "ligar o áudio cria as 4 cartas de áudio que faltavam");
  const cartaAudio = comAudioAgora.cartas.find((c) => c.bridge_template_id === "AUDIO_TO_WORD");
  await repo.atualizarCarta({ ...cartaAudio, state: "REVIEW", reps: 4 });
  const des = await repo.definirAudio(deckSemAudio.id, false);
  const desligado = await repo.carregarBaralho(deckSemAudio.id);
  conferir(des.suspensas === 4 && desligado.cartas.filter((c) => !c.suspended).length === 2 && (await repo.audiosPendentes(deckSemAudio.id)).length === 0, "desligar suspende as 4 cartas de áudio (não apaga) e não pede gravações");
  conferir((await repo.listarBaralhos()).find((d) => d.id === deckSemAudio.id).cartas === 2, "a contagem do baralho mostra só as cartas ativas");
  const rel = await repo.definirAudio(deckSemAudio.id, true);
  const religado = await repo.carregarBaralho(deckSemAudio.id);
  const volta = religado.cartas.find((c) => c.id === cartaAudio.id);
  conferir(rel.reativadas === 4 && rel.criadas === 0 && volta.reps === 4 && !volta.suspended && !("suspensa_por" in volta), "ligar de novo reativa as mesmas cartas, com o histórico de estudo");
  conferir(religado.cartas.find((c) => c.id === pessoal.id).suspended === true, "carta suspensa pela pessoa continua suspensa");
  await repo.excluirBaralho(deckSemAudio.id);

  await repo.excluirBaralho(deck.id);
  conferir((await repo.listarBaralhos()).length === 0 && (await db.todos("facets")).length === 0 && (await db.todos("user_cards")).length === 0, "excluir baralho não deixa nada para trás");
}

await testarRepositorio("memória", adaptadorMemoria());

// ── Baralhos no banco (fase 2): Postgres simulado que entende o SQL gerado por dadosServidor.js
function postgresSimulado() {
  const tabelas = Object.fromEntries(Object.keys(TABELAS).map((t) => [t, new Map()]));
  const comandos = [];
  const tipo = (t, c) => TABELAS[t].colunas[c];
  return { tabelas, comandos, query: async (texto, valores = []) => {
    comandos.push(texto);
    if (texto.startsWith("CREATE")) return [];
    let m;
    if ((m = texto.match(/^SELECT \* FROM (\w+) WHERE user_id = \$1(?: AND (\w+) = \$2)?$/))) {
      const [, t, col] = m;
      return [...tabelas[t].values()].filter((r) => r.user_id === valores[0] && (!col || r[col] === valores[1])).map((r) => structuredClone(r));
    }
    if ((m = texto.match(/^INSERT INTO (\w+) \(([^)]+)\) VALUES \(([^)]+)\)/))) {
      const [, t, cols, marcas] = m;
      const nomes = cols.split(", "), ms = marcas.split(", ");
      const linha = Object.fromEntries(nomes.map((n, i) => {
        let v = valores[i];
        if (v !== null && ms[i].endsWith("::jsonb")) v = JSON.parse(v);
        if (v !== null && tipo(t, n) === "data") v = new Date(v); // o Postgres devolve datas como Date
        return [n, v];
      }));
      const atual = tabelas[t].get(linha.id);
      if (atual && atual.user_id !== linha.user_id) return []; // WHERE user_id = EXCLUDED.user_id
      tabelas[t].set(linha.id, linha);
      return [];
    }
    if ((m = texto.match(/^DELETE FROM (\w+) WHERE user_id = \$1 AND id = ANY\(\$2\)$/))) {
      for (const [id, r] of tabelas[m[1]]) if (r.user_id === valores[0] && valores[1].includes(id)) tabelas[m[1]].delete(id);
      return [];
    }
    throw new Error("SQL não reconhecido pelo simulado: " + texto.slice(0, 60));
  } };
}
reiniciarEsquema();
const pgSim = postgresSimulado();
const comoUsuario = (userId) => adaptadorServidor((pedido) => executar(pgSim, userId, structuredClone(pedido)));
const mistoDe = (userId) => adaptadorMisto({ servidor: comoUsuario(userId), local: adaptadorMemoria(), memoria: adaptadorMemoria() });
await testarRepositorio("servidor (Postgres simulado)", mistoDe("ana"));

console.log("\n— Baralhos no banco: segurança e formato");
conferir(pgSim.comandos.filter((c) => /^(SELECT|DELETE)/.test(c)).every((c) => c.includes("user_id = $1")), "toda leitura e remoção filtra pelo usuário da sessão");
conferir(montarSQL("salvar", { t: "decks", userId: "ana", registro: { id: "d1", name: "x" } }).texto.includes("WHERE decks.user_id = EXCLUDED.user_id"), "a gravação só atualiza linha do mesmo usuário");
let barrou = 0;
try { montarSQL("todos", { t: "neon_auth.user; --", userId: "ana" }); } catch { barrou++; }
try { montarSQL("porIndice", { t: "facets", userId: "ana", indice: "value; drop", valor: 1 }); } catch { barrou++; }
conferir(barrou === 2, "tabela ou coluna fora da lista é recusada (sem injeção de SQL)");
const repoAna = criarRepositorio(mistoDe("ana")); await repoAna.iniciar();
const deckAna = await repoAna.criarBaralho({ name: "Da Ana", creation_mode: "words", target_language: "zh", level: "HSK 1" });
await repoAna.adicionarPalavras(deckAna.id, [base("água")]);
const repoBia = criarRepositorio(mistoDe("bia")); await repoBia.iniciar();
conferir((await repoBia.listarBaralhos()).length === 0 && (await repoBia.carregarBaralho(deckAna.id)) === null, "outra conta não enxerga os baralhos da Ana");
await comoUsuario("bia").salvar("decks", [{ ...deckAna, name: "invadido" }]);
await comoUsuario("bia").remover("decks", [deckAna.id]);
conferir((await repoAna.carregarBaralho(deckAna.id)).deck.name === "Da Ana", "outra conta não consegue sobrescrever nem apagar, mesmo sabendo o id");
const carta = (await repoAna.carregarBaralho(deckAna.id)).cartas[0];
conferir(typeof carta.due_at === "string" && !Number.isNaN(Date.parse(carta.due_at)), "datas voltam como texto ISO, como o app espera (o Postgres devolve Date)");
const ida = paraLinha("facets", { id: "f1", concept_id: "c1", facet_type: "WORD", value: "水", metadata: { pinyin: "shuǐ" }, campo_novo: 42 }, "ana");
const volta = paraRegistro("facets", Object.fromEntries(ida.nomes.map((n, i) => [n, ida.valores[i]])));
conferir(volta.metadata.pinyin === "shuǐ" && volta.campo_novo === 42 && !("user_id" in volta), "campo sem coluna própria vai para \"extra\" e volta igual; user_id não vai para o app");
try {
  const { indexedDB } = await import("fake-indexeddb");
  await testarRepositorio("IndexedDB simulado", adaptadorIndexedDB(`teste-${Date.now()}`, indexedDB));
} catch (e) {
  if (e?.code === "ERR_MODULE_NOT_FOUND") console.log("\n(IndexedDB simulado não instalado: rode npm install para testar também o adaptador do navegador)");
  else throw e;
}

console.log("\n— Perfis de idioma da v2");
conferir(IDIOMAS_V2_LISTA.length === 5 && IDIOMAS_V2_LISTA.map((i) => i.codigo).join() === "zh,ja,en,fr,es", "cinco perfis: mandarim, japonês, inglês, francês e espanhol");
conferir(idiomaV2("mandarim").codigo === "zh" && idiomaV2("fr").codigo === "fr", "aceita o código ISO e a chave da configuração antiga");
conferir(idiomaV2("zh").niveis[0] === "HSK 1" && idiomaV2("ja").niveis[0] === "N5" && idiomaV2("fr").niveis[0] === "A1", "níveis por idioma: HSK, JLPT e CEFR");
conferir(IDIOMAS_V2_LISTA.every((i) => i.temLeitura), "todos os idiomas têm apoio de leitura (pinyin/hiragana ou IPA)");
conferir(idiomaV2("zh").codigoTts === "zh_CN" && idiomaV2("ja").codigoTts === "ja_JP" && idiomaV2("fr").codigoTts === "fr_FR", "código de voz do Anki por idioma");

console.log("\n— Escrita e leitura por idioma");
conferir(igual(lerPalavras("la pomme, look for, la manzana", { target_language: "fr", level: "A1" }).wordList.words.map((w) => w.gloss), ["la pomme", "look for", "la manzana"]), "porta de entrada aceita palavras com espaço (artigo e phrasal verb)");
const validacaoLatina = (extra = {}) => validarIdioma({ lemma: "pomme", leitura: "/pɔm/", frase_leitura: "/ʒə mɑ̃ʒ la pɔm/", pos: "substantivo", meaning: "maçã", sentence: "Je mange la pomme.", target_in_sentence: "pomme", sentence_translation: "Eu como a maçã.", ambiguous: false, other_senses: "", level_fit: true, note: "", ...extra }, idiomaV2("fr"));
conferir(validacaoLatina().length === 0, "francês · palavra sem artigo e IPA passam sem problemas");
conferir(validacaoLatina({ leitura: "" }).some((p) => p.includes("sem leitura")), "francês · palavra sem IPA é recusada");
conferir(validacaoLatina({ sentence: "Je mange la pomme avec mon ami dans la cuisine de ma mère aujourd'hui." }).some((p) => p.includes("12 palavras")), "francês · frase com mais de 12 palavras é recusada");
const japonesa = { lemma: "たべる", leitura: "たべる (taberu)", pos: "verbo", meaning: "comer", sentence: "パンを食べます。", target_in_sentence: "食べます", frase_leitura: "パンをたべます。", sentence_translation: "Eu como pão.", ambiguous: false, other_senses: "", level_fit: true, note: "" };
conferir(validarIdioma(japonesa, idiomaV2("ja")).length === 0, "japonês · leitura em hiragana + romaji passa");
conferir(validarIdioma({ ...japonesa, leitura: "" }, idiomaV2("ja")).some((p) => p.includes("sem leitura")), "japonês · sem leitura é recusado");
const enriquecidaFrancesa = montarPalavraEnriquecida({ id: "w1", gloss: "maçã" }, { lemma: "pomme", leitura: "/pɔm/", frase_leitura: "/ʒə mɑ̃ʒ la pɔm/", pos: "substantivo", meaning: "maçã", sentence: "Je mange la pomme.", target_in_sentence: "pomme", sentence_translation: "Eu como a maçã.", ambiguous: false, other_senses: "", level_fit: true, note: "" }, { deck_id: "d1", language: "fr", origin: "user" });
conferir(enriquecidaFrancesa.facets[0].metadata.leitura === "/pɔm/" && enriquecidaFrancesa.facets[2].metadata.leitura === "/ʒə mɑ̃ʒ la pɔm/", "francês · IPA fica no metadata da palavra e da frase");
const enriquecidaJaponesa = montarPalavraEnriquecida({ id: "w1", gloss: "comer" }, japonesa, { deck_id: "d1", language: "ja", origin: "user" });
conferir(enriquecidaJaponesa.facets[0].metadata.leitura === "たべる (taberu)" && enriquecidaJaponesa.facets[2].metadata.leitura === "パンをたべます。", "japonês · leitura fica no metadata da palavra e da frase");
conferir(leituraDe({ pinyin: "shuǐ" }) === "shuǐ" && leituraDe({ leitura: "みず" }) === "みず", "leituraDe lê o formato antigo (pinyin) e o novo (leitura)");
conferir(textoParaVoz("水", { leitura: "みず (mizu)" }, idiomaV2("ja")) === "みず" && textoParaVoz("みず", {}, idiomaV2("ja")) === "みず" && textoParaVoz("la pomme", {}, idiomaV2("fr")) === "la pomme", "japonês com kanji vai para a voz como hiragana; os outros idiomas mantêm o texto");

console.log("\n— Prompts por idioma");
const promptFrances = instrucaoM2(idiomaV2("fr"));
const promptJapones = instrucaoM2(idiomaV2("ja"));
conferir(promptFrances.includes('"leitura"') && promptFrances.includes("IPA") && promptFrances.includes("12 palavras") && promptFrances.includes("sem artigo"), "prompt do francês pede IPA, limita a 12 palavras e tira o artigo");
conferir(promptJapones.includes('"leitura"') && promptJapones.includes("hiragana") && promptJapones.includes("20 caracteres"), "prompt do japonês pede hiragana + romaji e limita a 20 caracteres");
conferir(pedidoM2([{ id: "w1", gloss: "maçã", lemma: "pomme" }], "A1", "fr").includes("(em francês: pomme)"), "Módulo 2 recebe a palavra já escolhida no idioma certo");
const hskNaoMandarim = conferirNoHSK([{ lemma: "pomme", gloss: "maçã" }], { pomme: 1 }, "A1", "fr");
conferir(hskNaoMandarim[0].lemma === "pomme" && !("hsk" in hskNaoMandarim[0]), "a checagem do HSK não se aplica aos outros idiomas");

console.log("\n— Baralho de exemplo da v2");
const demo = JSON.parse(readFileSync(new URL("../public/demo-v2/baralho.json", import.meta.url), "utf8"));
const idsDemo = new Set(demo.palavras.flatMap((p) => p.facets.map((f) => f.id)));
conferir(demo.deck.target_language === "zh" && demo.deck.level === "HSK 2" && demo.palavras.length === 6, "demo em mandarim HSK 2 com 6 palavras");
conferir(demo.palavras.every((p) => p.facets.length === 5 && p.facets[0].facet_type === "WORD" && p.facets[2].metadata.cloze_indices), "cada palavra do demo tem as 5 facetas e a lacuna calculada");
conferir(demo.palavras.every((p) => Object.keys(p.audios).every((id) => idsDemo.has(id))), "os áudios apontam para facetas existentes");
conferir(demo.palavras.flatMap((p) => Object.values(p.audios)).every((a) => existsSync(new URL(`../public/demo-v2/${a}`, import.meta.url))), "todos os arquivos de áudio do demo existem");

console.log(falhas ? `\n${falhas} teste(s) falharam.` : "\nTodos os testes passaram.");
process.exit(falhas ? 1 : 0);
