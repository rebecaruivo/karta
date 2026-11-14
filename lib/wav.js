// O Gemini devolve áudio PCM "cru": só as amostras de som, sem cabeçalho.
// Navegadores não tocam PCM cru, então colocamos na frente o cabeçalho
// de 44 bytes do formato WAV, que diz: 24 kHz, 16 bits, mono.
export function pcmParaWav(pcm, taxa = 24000) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);      // tamanho do bloco de formato
  h.writeUInt16LE(1, 20);       // 1 = PCM
  h.writeUInt16LE(1, 22);       // 1 canal (mono)
  h.writeUInt32LE(taxa, 24);    // amostras por segundo
  h.writeUInt32LE(taxa * 2, 28); // bytes por segundo
  h.writeUInt16LE(2, 32);       // bytes por amostra
  h.writeUInt16LE(16, 34);      // bits por amostra
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
