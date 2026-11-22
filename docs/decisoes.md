# Decisões

Registro curto das decisões que mudam o rumo do projeto. A mais nova fica em cima. Cada entrada diz o que foi decidido e por quê.

## 2026-11-22

- **Painel de administrador só no PC do servidor.** Com o servidor na internet, a conta de administrador é o alvo mais valioso. A configuração "Superuser IPs" aceita o administrador só de `127.0.0.1`. O preço: administrar só no próprio PC, e não pelo celular.
- **Backup a cada hora, com cópia numa pasta sincronizada com a nuvem.** O servidor mora num notebook, que pode estragar ou sumir. A cópia usa a nuvem que a pessoa já tem, sem serviço novo.
- **Link de convite com o servidor preenchido (`?servidor=`).** Os amigos só abrem um link, sem digitar o endereço do Funnel.
- **Login numa aba, sem bloquear o app.** A aba Campanha cuida do login e da escolha da campanha. Sem entrar, as fichas e o mapa continuam funcionando só no navegador, como antes.
- **Endereço do servidor escolhido na tela de login.** O `VITE_POCKETBASE_URL` vira só o padrão. Assim o mesmo site de teste funciona com o PocketBase no próprio PC ou com o endereço do Tailscale Funnel de quem hospeda.
- **SDK oficial do PocketBase como dependência (`pocketbase` no npm).** Ele cuida do login, da renovação da sessão e do tempo real. Escrever isso à mão daria mais código e mais chance de erro.
- **Servidor no PC de quem hospeda, com Tailscale Funnel.** É de graça, dá um endereço HTTPS fixo, funciona atrás de CGNAT e não precisa de domínio. Os amigos só abrem o site. O Cloudflare saiu do plano: o túnel grátis não tem Server-Sent Events, que o tempo real do PocketBase usa, e o túnel com nome exige um domínio pago. Nuvem grátis (Oracle) e hospedagem paga (PocketBase Cloud, PocketHost) ficam para depois, se o PC ligado virar problema. Mudar é copiar a pasta `pb_data`.
- **Sem P2P.** Os dados só passariam entre quem está online ao mesmo tempo, o segredo do mestre e as permissões ficariam sem garantia, e a sincronia do mapa teria de ser refeita.
- **Contas com cadastro fechado e login por e-mail e senha.** O administrador cria cada conta pelo painel, e uma conta vale para todas as campanhas. Com o servidor na internet, ninguém de fora consegue se cadastrar. E-mail é o padrão do PocketBase e permite ligar o "esqueci a senha" no futuro.
- **Vários mestres por campanha, e nunca nenhum.** O servidor recusa tirar ou rebaixar o último mestre.
- **PocketBase 0.40.6 fixo.** A versão fica em `pocketbase/VERSAO` e só muda numa tarefa própria, porque o PocketBase ainda muda a API entre versões.
- **Rios e estradas moram no hexágono dono da aresta.** Mesma razão dos marcadores: lotes, chunks e desfazer funcionam sem código novo. O preço: só se liga onde os dois hexágonos da aresta existem. O contrato `Hexagono` ganhou os campos `rios` e `estradas` (Pedro: a coleção de hexágonos do servidor precisa guardá-los).
- **Token do grupo fora dos lotes.** É um estado só, muito mutável, e vale o mais recente. Entra no `RepositorioMapa` como três métodos opcionais (`carregarToken`, `gravarToken`, `assinarToken`), então a implementação do servidor continua compilando sem eles. Quando existir o PocketBase, vale uma coleção própria com um registro por mapa.
- **Régua só local.** Cada jogador mede o que quiser, sem sincronizar.

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
