/// <reference path="../pb_data/types.d.ts" />

// Configurações para o servidor ficar na internet pelo Tailscale Funnel.
// O PocketBase só escuta em 127.0.0.1 (ver iniciar.bat), então tudo o que chega de fora
// passa pelo Tailscale, que avisa o IP de quem acessou no cabeçalho X-Forwarded-For.

migrate((app) => {
  const config = app.settings()

  // Sem isto, todos os amigos chegariam com o IP 127.0.0.1 do Tailscale, e o limite de
  // tentativas trataria o grupo inteiro como uma pessoa só. O IP certo é o da direita,
  // que o Tailscale acrescenta. Os da esquerda podem ter sido inventados por quem acessa.
  config.trustedProxy.headers = ['X-Forwarded-For']
  config.trustedProxy.useLeftmostIP = false

  // Painel e conta de administrador só funcionam no próprio PC do servidor. Mesmo que alguém
  // descubra a senha ou roube a sessão do administrador, não consegue usar pela internet.
  // Para desfazer, se for preciso: pocketbase.exe superuser ips (sem nada depois limpa a lista).
  config.superuserIPs = ['127.0.0.1', '::1']

  // Backup automático a cada hora em que o servidor estiver ligado, guardando os 24 mais novos
  // em pb_data/backups. O hook pb_hooks/backup.pb.js copia cada um para fora do PC, se configurado.
  config.backups.cron = '0 * * * *'
  config.backups.cronMaxKeep = 24

  app.save(config)
}, (app) => {
  const config = app.settings()
  config.trustedProxy.headers = []
  config.trustedProxy.useLeftmostIP = false
  config.superuserIPs = []
  config.backups.cron = ''
  config.backups.cronMaxKeep = 3
  app.save(config)
})
