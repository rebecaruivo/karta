# Protótipo do Módulo 2 · mandarim · 15/11/2026, 16:12:08

| Métrica | Valor |
|---|---|
| Modelo | gemini-flash-lite-latest |
| Versão do prompt | 2 |
| Palavras | 10 (em 1 chamada) |
| Tempo total | 3.4 s |
| Tokens de entrada / saída / raciocínio | 610 / 1415 / 0 |
| Sem problema na checagem automática | 10 de 10 |
| Lacunas válidas | 10 de 10 |
| Marcadas como ambíguas | 2 |
| Acima do nível | 0 |

## Revisão

A checagem automática pega erros de formato. A coluna **Revisão humana** é para você: marque ✓ ou descreva o erro (sentido errado, frase difícil demais para o nível, tradução estranha). A taxa de correção manual é a métrica de qualidade proposta na seção 11.

| Português | Escrita | Pinyin | Classe | Significado | Frase | Lacuna | Checagem automática | Alertas da IA | Revisão humana |
|---|---|---|---|---|---|---|---|---|---|
| água | 水 | shuǐ | substantivo | água | 我想喝水。<br>Wǒ xiǎng hē shuǐ.<br>Eu quero beber água. | 我想喝＿＿。 | ok | — | |
| arroz | 米饭 | mǐfàn | substantivo | arroz | 我吃米饭。<br>Wǒ chī mǐfàn.<br>Eu como arroz. | 我吃＿＿。 | ok | — | |
| comer | 吃 | chī | verbo | comer | 我想吃苹果。<br>Wǒ xiǎng chī píngguǒ.<br>Eu quero comer maçã. | 我想＿＿苹果。 | ok | — | |
| bonito | 漂亮 | piàoliang | adjetivo | bonito | 她很漂亮。<br>Tā hěn piàoliang.<br>Ela é muito bonita. | 她很＿＿。 | ok | — | |
| ônibus | 公共汽车 | gōnggòng qìchē | substantivo | ônibus | 我坐公共汽车。<br>Wǒ zuò gōnggòng qìchē.<br>Eu pego ônibus. | 我坐＿＿。 | ok | — | |
| obrigado | 谢谢 | xièxie | expressão | obrigado | 谢谢你。<br>Xièxie nǐ.<br>Obrigado. | ＿＿你。 | ok | — | |
| banco | 银行 | yínháng | substantivo | banco | 我去银行。<br>Wǒ qù yínháng.<br>Eu vou ao banco. | 我去＿＿。 | ok | ambígua: também pode ser assento: 长椅 | |
| manga (fruta) | 芒果 | mángguǒ | substantivo | manga | 我吃芒果。<br>Wǒ chī mángguǒ.<br>Eu como manga. | 我吃＿＿。 | ok | — | |
| pegar | 拿 | ná | verbo | pegar | 我拿书。<br>Wǒ ná shū.<br>Eu pego o livro. | 我＿＿书。 | ok | ambígua: também pode ser tomar transporte: 坐 | |
| saudade | 想念 | xiǎngniàn | verbo | ter saudade | 我想念你。<br>Wǒ xiǎngniàn nǐ.<br>Sinto saudades de você. | 我＿＿你。 | ok | — | |
