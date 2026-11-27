/// <reference path="../pb_data/types.d.ts" />

// Backups: quando saem e para onde vão (ver pb_hooks/backup.js e docs/servidor/README.md, "Backup").
// As pastas de fora vêm das variáveis DISCORDVTT_COPIA_BACKUP (nuvem) e DISCORDVTT_COPIA_HD (HD externo),
// que o iniciar.bat lê dos arquivos copia-backup.txt e copia-hd.txt, fora do Git. Sem elas, os backups
// ficam só em pb_data/backups.

// Todo backup, automático ou feito pelo painel, vai para a pasta da nuvem.
onBackupCreate((e) => {
  e.next()
  require(`${__hooks}/backup.js`).copiarParaNuvem(e.app, e.name)
})

// Backup automático a cada hora em que o servidor estiver ligado, só se algo mudou desde o último.
// Faz o papel do agendamento do próprio PocketBase, que fica desligado (migração 1795321008_backup.js).
cronAdd('backup', '0 * * * *', () => {
  require(`${__hooks}/backup.js`).backupAutomatico($app)
})

// A cada 5 minutos, leva para o HD externo o que ainda não está nele, se ele estiver conectado.
cronAdd('copiar_hd', '*/5 * * * *', () => {
  require(`${__hooks}/backup.js`).copiarParaHd($app)
})
