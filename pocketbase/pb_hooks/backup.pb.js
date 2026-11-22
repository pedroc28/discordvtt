/// <reference path="../pb_data/types.d.ts" />

// Copia cada backup para uma pasta fora do PocketBase, de preferência sincronizada com a nuvem
// (Google Drive, OneDrive). Assim um disco que estraga ou um PC perdido não leva os dados junto.
// A pasta vem da variável DISCORDVTT_COPIA_BACKUP, que o iniciar.bat lê do arquivo
// copia-backup.txt (fora do Git). Sem a variável, os backups ficam só em pb_data/backups.

onBackupCreate((e) => {
  e.next()
  require(`${__hooks}/backup.js`).copiarBackup(e.app, e.name)
})
