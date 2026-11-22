# Decisões

Registro curto das decisões que mudam o rumo do projeto. A mais nova fica em cima. Cada entrada diz o que foi decidido e por quê.

## 2026-11-21

- **Tudo automático na entrega.** Um pull request entra sozinho na `main` quando a verificação passa, sem revisão humana. As áreas são bem separadas, e a responsabilidade pela divisão é das pessoas. Quando uma tarefa mexe na área do outro, o Claude analisa os riscos, avisa antes e registra na descrição do pull request. Não há bloqueio automático por área.
- **Squash na entrega.** Cada tarefa vira um único commit na `main`, para o histórico ficar legível. Branches juntadas são apagadas sozinhas.
- **Repositório público e site de teste no GitHub Pages.** Libera proteção da `main` e site de teste sem custo. O código não tem segredos.
- **Sem aviso automático no Discord.** O histórico de pull requests basta por enquanto.
- **Telas descobertas automaticamente.** Cada área registra as próprias telas em `tela.ts`, e o núcleo encontra sozinho. Assim ninguém precisa editar arquivo compartilhado para criar uma tela.
- **Tema no núcleo.** Variáveis de cor, temas claro e escuro e botões comuns saíram da ficha para `app/src/nucleo/`, porque o mapa também usa.
- **Documentação em `docs/`.** Um lugar só, separado por área, com roteiro, decisões e contratos.
- **Divisão de áreas.** GrifoCaolho cuida do mapa e da mesa. Pedro cuida do PocketBase, da conexão e da hospedagem. As fichas ficam congeladas até os dois voltarem a elas juntos.
- **Conversa no Discord.** Voz, chat e transmissão de tela ficam fora do projeto. Sem LiveKit e sem Docker: o PocketBase sozinho, um único executável, dá conta de login, dados e tempo real.
