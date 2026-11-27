/// <reference path="../pb_data/types.d.ts" />

// Funções auxiliares de backup.pb.js. O nome sem ".pb" impede o PocketBase de carregar este
// arquivo como hook: ele só entra pelo require.
//
// Onde os backups ficam:
// - pb_data/backups, neste PC: os 72 automáticos mais novos, mais os manuais (esses nunca saem sozinhos).
// - Pasta da nuvem (copia-backup.txt): a cópia mais nova de cada dia, nos 7 dias mais recentes com backup.
//   É a cópia fora de casa, para um incêndio ou um roubo não levarem tudo.
// - Pasta do HD externo (copia-hd.txt): o histórico. Tudo dos 7 dias mais recentes com backup e, antes
//   disso, a cópia mais nova de cada dia, por 6 meses. O HD pode ficar desconectado: o PC guarda os
//   backups e a cópia sai sozinha quando ele volta.
//
// O backup automático só sai quando algo mudou desde o último, para o servidor ligado sem ninguém
// jogando não encher os discos de cópias iguais.

const AUTOMATICOS_NO_PC = 72
const DIAS_NA_NUVEM = 7
const DIAS_COMPLETOS_NO_HD = 7
const DIAS_NO_HD = 180
const PREFIXO_AUTOMATICO = '@auto_pb_backup_'
// Guarda a marca dos dados no último backup automático. Fica no pb_data para valer depois de desligar
// o servidor e para ir junto se o servidor mudar de PC.
const ARQUIVO_MARCA = 'discordvtt-ultimo-backup.txt'
const COPIANDO_HD = 'discordvtt:copiandoHd'
const HORA_MS = 60 * 60 * 1000
const DIA_MS = 24 * HORA_MS

/** Caminho de uma pasta configurada. O Bloco de Notas pode salvar o .txt com uma marca invisível no começo (BOM). */
function pastaDe(variavel) {
  return String($os.getenv(variavel) || '')
    .replace(/^﻿/, '')
    .trim()
}

function existe(caminho) {
  try {
    $os.stat(caminho)
    return true
  } catch (_) {
    return false
  }
}

/** Quando o backup foi feito: pelo carimbo no nome, que os nomes do PocketBase trazem em UTC, ou pela data do arquivo. */
function quando(nome, mtimeMs) {
  const carimbo = /_(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:_(\d+))?\.zip$/.exec(nome)
  if (!carimbo) return mtimeMs
  const [, a, m, d, h, min, s, n] = carimbo.map(Number)
  // Dois backups no mesmo segundo ganham "_2", "_3": o número desempata a ordem.
  return Date.UTC(a, m - 1, d, h, min, s) + (n > 1 ? n - 1 : 0)
}

/** O dia, na hora local do PC, para agrupar os backups de uma mesma sessão. */
function diaDe(ms) {
  const data = new Date(ms)
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`
}

/** Os zips de uma pasta, com o momento de cada um. Só os .zip: o resto da pasta nunca é tocado. */
function zipsDaPasta(pasta) {
  return $os
    .readDir(pasta)
    .filter((item) => !item.isDir() && item.name().endsWith('.zip'))
    .map((item) => {
      const info = $os.stat(`${pasta}/${item.name()}`)
      return { nome: item.name(), bytes: info.size(), quando: quando(item.name(), info.modTime().unixMilli()) }
    })
}

/**
 * Quais backups de uma pasta ficam. Os dias contam do mais recente para trás, e só os dias que têm backup:
 * uma pausa longa no jogo não apaga o histórico recente.
 * - Nos `diasComTudo` dias mais recentes, fica tudo.
 * - Nos outros, fica só o mais novo de cada dia, até `diasComUm` dias no total e até `maximoDias` de idade.
 */
function escolherGuardados(lista, { diasComTudo = 0, diasComUm = Infinity, maximoDias = Infinity, agora = Date.now() }) {
  const porDia = new Map()
  for (const item of lista) {
    const dia = diaDe(item.quando)
    if (!porDia.has(dia)) porDia.set(dia, [])
    porDia.get(dia).push(item)
  }
  const dias = [...porDia.keys()].sort().reverse()
  const guardados = new Set()
  dias.forEach((dia, posicao) => {
    const doDia = porDia.get(dia).sort((a, b) => b.quando - a.quando)
    if (posicao < diasComTudo) {
      for (const item of doDia) guardados.add(item.nome)
      return
    }
    if (posicao >= diasComUm) return
    if (agora - doDia[0].quando > maximoDias * DIA_MS) return
    guardados.add(doDia[0].nome)
  })
  return guardados
}

/**
 * Uma marca de tudo o que está guardado: quantos registros cada coleção tem e quando o mais novo mudou.
 * Criar, mudar ou apagar qualquer registro muda a marca. Os registros de acesso (logs) ficam de fora.
 */
function marcaDosDados(app) {
  const partes = []
  for (const colecao of app.findAllCollections('base', 'auth')) {
    const campo = colecao.fields.getByName('updated') ? 'updated' : colecao.fields.getByName('created') ? 'created' : ''
    const linha = new DynamicModel({ n: 0, ultimo: '' })
    const ultimo = campo ? `COALESCE(MAX([[${campo}]]), '')` : `''`
    app
      .db()
      .newQuery(`SELECT COUNT(*) AS [[n]], ${ultimo} AS [[ultimo]] FROM {{${colecao.name}}}`)
      .one(linha)
    partes.push(`${colecao.name}:${linha.n}:${linha.ultimo}`)
  }
  return partes.sort().join('\n')
}

function numeroDaVariavel(variavel, padrao) {
  const bruto = String($os.getenv(variavel) || '').trim()
  const numero = Number(bruto)
  return bruto === '' || !Number.isInteger(numero) || numero < 1 ? padrao : numero
}

module.exports = {
  quando,
  diaDe,
  escolherGuardados,

  /** O backup de cada hora: só sai se algo mudou desde o último, e apaga os automáticos mais velhos. */
  backupAutomatico(app) {
    const caminhoMarca = `${app.dataDir()}/${ARQUIVO_MARCA}`
    try {
      // A marca é tirada antes do backup: o que mudar durante ele muda a marca de novo, e entra no próximo.
      const marca = marcaDosDados(app)
      const anterior = existe(caminhoMarca) ? toString($os.readFile(caminhoMarca)) : ''
      if (marca === anterior) {
        app.logger().debug('Backup automático pulado: nada mudou desde o último')
        return
      }
      const nomeDoApp = String(app.settings().meta.appName || 'pocketbase')
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[^A-Za-z0-9]+/g, '_')
        .toLowerCase()
      const carimbo = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
      let nome = `${PREFIXO_AUTOMATICO}${nomeDoApp}_${carimbo}.zip`
      for (let n = 2; existe(`${app.dataDir()}/backups/${nome}`); n++) nome = `${PREFIXO_AUTOMATICO}${nomeDoApp}_${carimbo}_${n}.zip`
      app.createBackup(new Context(), nome)
      $os.writeFile(caminhoMarca, marca, 0o644)
      module.exports.apagarAutomaticosAntigos(app)
    } catch (erro) {
      app.logger().error('Não consegui fazer o backup automático', 'erro', String(erro))
    }
  },

  /** Deixa no PC só os backups automáticos mais novos. Os manuais, feitos pelo painel, ficam. */
  apagarAutomaticosAntigos(app) {
    const guardar = numeroDaVariavel('DISCORDVTT_BACKUPS_NO_PC', AUTOMATICOS_NO_PC)
    const fsys = app.newBackupsFilesystem()
    try {
      const automaticos = fsys
        .list('')
        .filter((item) => item && item.key.startsWith(PREFIXO_AUTOMATICO) && item.key.endsWith('.zip'))
        .sort((a, b) => quando(b.key, b.modTime.unixMilli()) - quando(a.key, a.modTime.unixMilli()))
      for (const antigo of automaticos.slice(guardar)) fsys.delete(antigo.key)
    } finally {
      fsys.close()
    }
  },

  /** Copia um backup recém-feito para a pasta da nuvem e deixa lá a cópia mais nova de cada dia. */
  copiarParaNuvem(app, nome) {
    const destino = pastaDe('DISCORDVTT_COPIA_BACKUP')
    if (!destino) return
    // Uma falha na cópia não pode desfazer o backup que já foi feito: só fica registrada no log.
    try {
      $os.mkdirAll(destino, 0o755)
      $os.writeFile(`${destino}/${nome}.parcial`, $os.readFile(`${app.dataDir()}/backups/${nome}`), 0o644)
      $os.rename(`${destino}/${nome}.parcial`, `${destino}/${nome}`)
      const guardados = escolherGuardados(zipsDaPasta(destino), { diasComUm: DIAS_NA_NUVEM })
      for (const item of zipsDaPasta(destino)) if (!guardados.has(item.nome)) $os.remove(`${destino}/${item.nome}`)
      app.logger().info('Backup copiado para a pasta da nuvem', 'backup', nome, 'pasta', destino)
    } catch (erro) {
      app.logger().error('Não consegui copiar o backup para a pasta da nuvem', 'backup', nome, 'pasta', destino, 'erro', String(erro))
    }
  },

  /**
   * Leva para o HD os backups do PC que ainda não estão lá e apaga do HD o que passou do histórico.
   * Sem a pasta (HD desconectado, ou com outra letra), não faz nada: a pasta nunca é criada aqui, para
   * um pendrive que pegue a mesma letra não receber backups.
   */
  copiarParaHd(app) {
    const destino = pastaDe('DISCORDVTT_COPIA_HD')
    if (!destino || !existe(destino)) return
    // Uma cópia grande pode passar de 5 minutos: a rodada seguinte espera a anterior acabar.
    const outra = app.store().get(COPIANDO_HD)
    if (typeof outra === 'number' && Date.now() - outra < HORA_MS) return
    app.store().set(COPIANDO_HD, Date.now())
    try {
      const origem = `${app.dataDir()}/backups`
      const noPc = zipsDaPasta(origem)
      const noHd = zipsDaPasta(destino)
      const bytesNoHd = new Map(noHd.map((item) => [item.nome, item.bytes]))
      // O histórico é decidido sobre o PC e o HD juntos, para não copiar de novo o que o HD já descartou.
      const todos = [...noHd, ...noPc.filter((item) => !bytesNoHd.has(item.nome))]
      const guardados = escolherGuardados(todos, { diasComTudo: DIAS_COMPLETOS_NO_HD, maximoDias: DIAS_NO_HD })
      let copiados = 0
      for (const item of noPc) {
        if (!guardados.has(item.nome) || bytesNoHd.get(item.nome) === item.bytes) continue
        // Com nome provisório até o fim: se o cabo soltar no meio, não fica um backup quebrado com nome de bom.
        $os.writeFile(`${destino}/${item.nome}.parcial`, $os.readFile(`${origem}/${item.nome}`), 0o644)
        $os.rename(`${destino}/${item.nome}.parcial`, `${destino}/${item.nome}`)
        copiados++
      }
      let apagados = 0
      for (const item of noHd) {
        if (guardados.has(item.nome)) continue
        $os.remove(`${destino}/${item.nome}`)
        apagados++
      }
      // Restos de uma cópia interrompida.
      for (const item of $os.readDir(destino)) {
        if (item.isDir() || !item.name().endsWith('.zip.parcial')) continue
        if (Date.now() - $os.stat(`${destino}/${item.name()}`).modTime().unixMilli() > HORA_MS) $os.remove(`${destino}/${item.name()}`)
      }
      if (copiados > 0 || apagados > 0) app.logger().info('Backups levados para o HD', 'copiados', copiados, 'apagados', apagados, 'pasta', destino)
    } catch (erro) {
      app.logger().error('Não consegui copiar os backups para o HD', 'pasta', destino, 'erro', String(erro))
    } finally {
      app.store().remove(COPIANDO_HD)
    }
  },
}
