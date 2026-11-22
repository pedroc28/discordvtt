/// <reference path="../pb_data/types.d.ts" />

// Funções auxiliares de backup.pb.js. O nome sem ".pb" impede o PocketBase de carregar este
// arquivo como hook: ele só entra pelo require.

// Quantas cópias manter na pasta de fora. As mais antigas são apagadas.
const COPIAS_GUARDADAS = 48

module.exports = {
  copiarBackup(app, nome) {
    // O Bloco de Notas pode salvar o copia-backup.txt com uma marca invisível no começo (BOM).
    const destino = String($os.getenv('DISCORDVTT_COPIA_BACKUP') || '')
      .replace(/^﻿/, '')
      .trim()
    if (!destino) return

    // Uma falha na cópia não pode desfazer o backup que já foi feito: só fica registrada no log.
    try {
      $os.mkdirAll(destino, 0o755)
      const origem = `${app.dataDir()}/backups/${nome}`
      $os.writeFile(`${destino}/${nome}`, $os.readFile(origem), 0o644)

      // Backups automáticos e manuais têm nomes em padrões diferentes, então a ordem é pela data do arquivo.
      const copias = $os
        .readDir(destino)
        .map((item) => item.name())
        .filter((n) => n.endsWith('.zip'))
        .map((n) => ({ nome: n, quando: $os.stat(`${destino}/${n}`).modTime().unix() }))
        .sort((a, b) => a.quando - b.quando)
      for (const antiga of copias.slice(0, Math.max(0, copias.length - COPIAS_GUARDADAS))) {
        $os.remove(`${destino}/${antiga.nome}`)
      }
      app.logger().info('Backup copiado para fora do PocketBase', 'backup', nome, 'pasta', destino)
    } catch (erro) {
      app.logger().error('Não consegui copiar o backup para a pasta de fora', 'backup', nome, 'pasta', destino, 'erro', String(erro))
    }
  },
}
