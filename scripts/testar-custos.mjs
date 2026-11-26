// Testes do custo por transação: tabela de preços, conta por chamada, soma e formatação (sem rede).
import { precoDe, custoDaChamada, somarCustos, usoDaResposta, formatarUsd, formatarBrl } from "../lib/v2/custos.js";
import { montarCustos } from "../lib/v2/painel.js";

let falhas = 0;
const conferir = (ok, msg) => { console.log(`${ok ? "✓" : "✗"} ${msg}`); if (!ok) falhas++; };
const perto = (a, b) => Math.abs(a - b) < 1e-12;

console.log("— Tabela de preços");
conferir(precoDe("gemini-3.5-flash").entrada === 1.5 && precoDe("gemini-3.5-flash").saida === 9 && !precoDe("gemini-3.5-flash").estimado, "3.5 Flash: US$ 1,50 entrada e US$ 9,00 saída por milhão");
conferir(precoDe("gemini-3.5-flash-lite").saida === 2.5, "3.5 Flash-Lite não é confundido com o 3.5 Flash");
conferir(precoDe("models/gemini-3.1-flash-lite-001").entrada === 0.25, "aceita o prefixo models/ e sufixos de versão");
conferir(precoDe("gemini-2.5-flash-preview-tts").voz && precoDe("gemini-2.5-flash-preview-tts").saida === 10, "voz: a saída é áudio, com preço próprio");
const alias = precoDe("gemini-flash-lite-latest");
conferir(alias.estimado && alias.saida === 2.5, "alias desconhecido usa o preço da família, marcado como estimado (o mais caro dos Flash-Lite)");
conferir(precoDe("gemini-3.8-flash-tts").estimado && precoDe("gemini-3.8-flash-tts").saida === 20, "voz desconhecida: o TTS mais caro da tabela (conservador)");
conferir(precoDe("modelo-inventado") === null, "modelo fora de qualquer família: sem preço");

console.log("\n— Uma chamada");
// 1.000 de entrada, 2.000 de saída e 500 de pensamento no 3.5 Flash: (1000×1,5 + 2500×9) / 1e6
const c = custoDaChamada({ modelo: "gemini-3.5-flash", entrada: 1000, saida: 2000, pensamento: 500 });
conferir(perto(c.usd, 0.024) && c.tokens === 3500, "pensamento é cobrado como saída: US$ 0,024 por 3.500 tokens");
conferir(custoDaChamada({ modelo: "modelo-inventado", entrada: 10 }).usd === null, "modelo sem preço: custo nulo, nunca zero (zero mentiria)");
const uso = usoDaResposta({ modelVersion: "gemini-3.1-flash-lite-001", usageMetadata: { promptTokenCount: 800, candidatesTokenCount: 600 } }, "gemini-flash-lite-latest");
conferir(uso.modelo === "gemini-3.1-flash-lite-001" && uso.pensamento === 0, "o modelo cobrado é o que respondeu (modelVersion), não o alias pedido");
conferir(!custoDaChamada(uso).estimado, "com o modelVersion, o preço deixa de ser estimado");

console.log("\n— Soma e formatação");
const soma = somarCustos([c, { usd: 0.001, tokens: 100 }, null]);
conferir(perto(soma.usd, 0.025) && soma.tokens === 3600 && soma.chamadas === 2 && !soma.estimado, "soma ignora vazios e conta as chamadas");
conferir(somarCustos([{ usd: null, tokens: 5 }]).estimado, "uma parcela sem preço marca o total como estimado");
conferir(formatarUsd(0.00042) === "US$ 0,000420" && formatarUsd(0.024) === "US$ 0,0240" && formatarUsd(1.5) === "US$ 1,50", "frações de centavo aparecem (não viram US$ 0,00)");
conferir(formatarBrl(0.024, 5) === "R$ 0,12" && formatarBrl(0.0004, 5) === "R$ 0,0020" && formatarBrl(null) === "—", "reais com a cotação; sem dado, traço");

console.log("\n— Custo por transação no painel");
const m = montarCustos({
  baralho: { n: 4, media: 0.02, total: 0.08, mediaM1: 0.005, totalM2: 0.06, palavras: 40, doBanco: 10, estimado: false },
  acrescentar: { n: 1, media: 0.01, total: 0.01, totalM2: 0.01, palavras: 5, doBanco: 0 },
  audio: { n: 2, total: 0.08, audios: 40, estimado: false },
  analise: { n: 2, media: 0.003, total: 0.006 },
});
conferir(perto(m.porPalavraIA, 0.07 / 35), "palavra da IA = custo do Módulo 2 ÷ palavras que não vieram do banco");
conferir(perto(m.porAudio, 0.002), "gravação = custo dos áudios ÷ gravações");
conferir(perto(m.baralhoCompleto, 0.02 + 10 * 2 * 0.002), "baralho completo = criar + 2 gravações por palavra");
conferir(perto(m.economia, 10 * 0.002), "economia do banco = palavras do banco × custo de uma palavra da IA");
conferir(perto(m.total, 0.176), "gasto total soma todas as transações");
const vazio = montarCustos({ baralho: { n: 0, media: 0, total: 0, totalM2: 0, palavras: 0, doBanco: 0 }, acrescentar: { n: 0, media: 0, total: 0, totalM2: 0, palavras: 0, doBanco: 0 }, audio: { n: 0, total: 0, audios: 0 }, analise: { n: 0, media: 0, total: 0 } });
conferir(vazio.baralhoCompleto === null && vazio.linhas[0].usd === "—" && vazio.linhas[0].amostra === "sem medição ainda", "sem medições: traço, nunca um zero inventado");

console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : "\nTodos os testes passaram.");
process.exit(falhas ? 1 : 0);
