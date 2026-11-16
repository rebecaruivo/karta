// Testes automáticos das partes da v2 que não dependem da IA.
// Uso: npm run testar:v2
import { lerPalavras, validarTema } from "../lib/v2/portaEntrada.js";
import { limparLista, montarPedido as pedidoM1, conferirNoHSK } from "../lib/v2/modulo1.js";
import { montarPedido as pedidoM2, enriquecer } from "../lib/v2/modulo2.js";
import { montarCartas, CATALOGO_PONTES } from "../lib/v2/pontes.js";
import { montarFila, espacarPalavras } from "../lib/v2/sessao.js";
import { separarPorGloss, separarRepetidas, escritasDoBaralho } from "../lib/v2/edicao.js";
import { criarRepositorio } from "../lib/v2/banco.js";
import { adaptadorMemoria, adaptadorIndexedDB } from "../lib/v2/adaptadores.js";
import { podeGerarAudio, usaGravacao, usaVozDoNavegador } from "../lib/preferencias.js";
import { calcularLacuna, fraseComLacuna, validarMandarim, montarPalavraEnriquecida, capitalizarPinyin, alertas } from "../lib/v2/facetas.js";

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
  await repo.excluirBaralho(deckSemAudio.id);

  await repo.excluirBaralho(deck.id);
  conferir((await repo.listarBaralhos()).length === 0 && (await db.todos("facets")).length === 0 && (await db.todos("user_cards")).length === 0, "excluir baralho não deixa nada para trás");
}

await testarRepositorio("memória", adaptadorMemoria());
try {
  const { indexedDB } = await import("fake-indexeddb");
  await testarRepositorio("IndexedDB simulado", adaptadorIndexedDB(`teste-${Date.now()}`, indexedDB));
} catch (e) {
  if (e?.code === "ERR_MODULE_NOT_FOUND") console.log("\n(IndexedDB simulado não instalado: rode npm install para testar também o adaptador do navegador)");
  else throw e;
}

console.log(falhas ? `\n${falhas} teste(s) falharam.` : "\nTodos os testes passaram.");
process.exit(falhas ? 1 : 0);
