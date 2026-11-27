/// <reference path="../pb_data/types.d.ts" />

// O backup automático passa para o hook pb_hooks/backup.pb.js, que só faz backup quando algo mudou
// e cuida das cópias no PC, na nuvem e no HD. O agendamento do próprio PocketBase fica desligado,
// senão sairiam dois backups por hora.

migrate((app) => {
  const config = app.settings()
  config.backups.cron = ''
  app.save(config)
}, (app) => {
  const config = app.settings()
  config.backups.cron = '0 * * * *'
  config.backups.cronMaxKeep = 24
  app.save(config)
})
