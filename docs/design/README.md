# Design do Karta

Antes de escrever código, desenhei as quatro telas principais com uma ferramenta de design com IA. As imagens abaixo são esses mockups. Elas serviram de especificação visual: cores, fontes, raios e espaçamentos foram levados para `app/globals.css`.

| Tela | Mockup | No app |
|---|---|---|
| Biblioteca | `1-biblioteca.png` | `app/page.jsx` |
| Gerando | `2-gerando.png` | `app/novo/page.jsx` |
| Baralho | `3-baralho.png` | `app/baralho/[id]/page.jsx` |
| Estudo | `4-estudo.png` | `app/baralho/[id]/estudar/page.jsx` |

## O que mudou do mockup para o app
- Nos mockups, os dados eram fixos. No app, as cartas vêm do Gemini e o progresso vem da repetição espaçada.
- A tela "Gerando" do mockup mostra texto, imagem e áudio por carta. A v1 gera só o texto. O áudio é a próxima fase, e a imagem ficou para depois.
- Na v1 não existe o botão "Editar" do baralho.

O código que desenhava os mockups no navegador não faz parte deste repositório: era o motor da ferramenta de design, não código meu.
