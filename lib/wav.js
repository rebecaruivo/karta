// Conversão do áudio do Gemini para um arquivo que o navegador toca.

// Alguns modelos de voz (a família 3.8) anexam ao fim do áudio um certificado
// de procedência C2PA ("Content Credentials"): uma assinatura do Google provando
// que o som foi gerado por IA. Como o áudio vem "cru" (PCM, sem envelope de
// arquivo), esse certificado fica colado nas amostras de som e, se for tocado,
// vira um chiado de ~160 ms no final.
// Formato encontrado: "C2PA" + tamanho + caixa JUMBF ("jumb" ... "c2pa").
// Aqui cortamos o áudio onde o certificado começa.
export function removerCertificadoC2PA(pcm) {
  let inicio = pcm.indexOf("C2PA");
  while (inicio !== -1) {
    const jumb = pcm.indexOf("jumb", inicio);
    if (jumb !== -1 && jumb - inicio <= 16) {
      const corte = inicio - (inicio % 2); // mantém o número de bytes par (16 bits por amostra)
      return { pcm: pcm.subarray(0, corte), removidos: pcm.length - corte };
    }
    inicio = pcm.indexOf("C2PA", inicio + 1);
  }
  return { pcm, removidos: 0 };
}

// O Gemini devolve áudio PCM "cru": só as amostras de som, sem cabeçalho.
// Navegadores não tocam PCM cru, então colocamos na frente o cabeçalho
// de 44 bytes do formato WAV, que diz: 24 kHz, 16 bits, mono.
export function pcmParaWav(pcm, taxa = 24000) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);       // tamanho do bloco de formato
  h.writeUInt16LE(1, 20);        // 1 = PCM
  h.writeUInt16LE(1, 22);        // 1 canal (mono)
  h.writeUInt32LE(taxa, 24);     // amostras por segundo
  h.writeUInt32LE(taxa * 2, 28); // bytes por segundo
  h.writeUInt16LE(2, 32);        // bytes por amostra
  h.writeUInt16LE(16, 34);       // bits por amostra
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
