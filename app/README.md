# Editor de fichas (etapa 1 do DiscordVtt)

Editor de fichas de RPG no estilo pageboard. O mestre (ou quem cuida do sistema) monta o **modelo** arrastando campos para a folha, e os jogadores **preenchem** a ficha no mesmo componente.

Stack: Vite, React 19 e TypeScript, sem bibliotecas além das fontes. Tudo roda no navegador e salva no `localStorage` por enquanto.

## Rodar

```bash
npm install
npm run dev      # abre em http://localhost:5173
npm run build    # gera a pasta dist/
```

## O que já funciona

- Dois modos: **Editar modelo** e **Preencher ficha**
- Arrastar campos da paleta para a folha, ou clicar para pôr no meio da tela
- Mover, redimensionar pelas 8 alças, encaixe na grade e guias que grudam nas bordas e centros dos outros campos (segure Alt para mover livre)
- Seleção múltipla com Shift + clique ou arrastando na área vazia, alinhar, distribuir e igualar tamanhos
- Desfazer e refazer, copiar, colar, duplicar, setas do teclado
- Várias páginas por ficha, com tamanho de folha configurável (A4, Carta, tela, celular ou personalizado)
- Fonte, cor do papel, da tinta e de destaque por modelo
- Exportar e importar modelo e personagem em JSON
- Modo escuro (Sistema, Claro ou Escuro). A folha também escurece trocando papel e tinta do modelo, com opção de manter a folha clara

Tipos de campo: texto, texto longo (com linhas de caderno opcionais), número, atual/máximo (no estilo 19/20, com barra e botões − e +, ou no estilo barra de vida dividida em partes), relógio do Apocalypse World (ou com partes iguais), caixa de marcar, marcadores (espaços de magia, testes contra a morte), lista de opções, tabela com colunas configuráveis, imagem, texto fixo e moldura.

## Organização

```
src/ficha/
  tipos.ts            formato dos dados (Modelo, Elemento, Personagem)
  campos.ts           registro dos tipos de campo e seus padrões
  CampoVisual.tsx     desenha cada tipo de campo (edição e preenchimento)
  Folha.tsx           a página: seleção, arrastar, redimensionar, laço
  geometria.ts        encaixe na grade e guias de alinhamento
  operacoes.ts        operações puras sobre o modelo (mover, alinhar, páginas...)
  historico.ts        desfazer e refazer
  Paleta.tsx          painel da esquerda (campos e lista da página)
  Inspetor.tsx        painel da direita (propriedades)
  EditorDeFichas.tsx  tela principal que junta tudo
  armazenamento.ts    localStorage e validação de JSON importado
  aparencia.ts        tema claro e escuro e cores da folha no modo escuro
  exemplo.ts          modelo de exemplo d20
  ficha.css           estilos da interface e da folha
```

## Formato dos dados

O modelo e os valores ficam separados. Cada campo tem uma **chave** (`forca`, `pv`) que liga o campo ao valor do personagem. É essa chave que as fórmulas vão usar na etapa 3 (`@forca`).

```jsonc
// modelo
{ "formato": "ficha-modelo", "largura": 800, "altura": 1120, "grade": 8,
  "paginas": [{ "nome": "Principal", "elementos": [
    { "tipo": "numero", "chave": "forca", "rotulo": "Força",
      "x": 32, "y": 168, "w": 152, "h": 96,
      "estilo": { "tamanhoFonte": 40, "rotulo": "acima", "borda": "caixa" },
      "config": { "min": null, "max": null, "passo": 1 } } ] }] }

// personagem
{ "formato": "ficha-personagem", "modeloId": "exemplo-d20",
  "valores": { "forca": 16, "pv": { "atual": 19, "max": 28 } } }
```

Dois campos com a mesma chave mostram o mesmo valor. Isso serve para repetir os PV em duas páginas, por exemplo. O editor avisa quando a mesma chave aparece em campos de tipos diferentes.

## Como criar um tipo de campo novo

1. Acrescente o nome em `TipoCampo`, em `tipos.ts`
2. Registre tamanho, estilo e configuração padrão em `DEFINICOES`, em `campos.ts`, e o valor inicial em `valorPadrao`
3. Desenhe o campo no `switch` de `CampoVisual.tsx`
4. Se ele tiver opções próprias, acrescente um `case` em `OpcoesDoTipo`, no `Inspetor.tsx`
5. Dê um ícone a ele em `Icones.tsx`

## Próximas etapas

- **Etapa 2:** trocar o `useReducer` + `localStorage` por Yjs, com o PocketBase guardando os documentos. As operações em `operacoes.ts` já são puras, então a troca fica concentrada no `EditorDeFichas.tsx`.
- **Etapa 3:** motor de fórmulas, campo calculado e botão de rolagem
- **Etapa 4:** painel do mestre
