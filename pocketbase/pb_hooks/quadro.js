/// <reference path="../pb_data/types.d.ts" />

// Funções do quadro de cortiça, usadas por quadro.pb.js com require. O porquê está em
// docs/servidor/README.md, seção "Quadro".

// Espaço de imagens de cada campanha. Cada backup copia todas as imagens, e o servidor guarda 24
// backups no PC e 48 na pasta da nuvem: 50 MB por campanha viram até 2,4 GB na nuvem.
const LIMITE_PADRAO_MB = 50

function limiteEmBytes() {
  const bruto = String($os.getenv('DISCORDVTT_QUADRO_LIMITE_MB') || '').trim()
  const mb = bruto === '' || !Number.isFinite(Number(bruto)) || Number(bruto) <= 0 ? LIMITE_PADRAO_MB : Number(bruto)
  return Math.round(mb * 1024 * 1024)
}

const emMB = (bytes) => String(Math.round((bytes / (1024 * 1024)) * 10) / 10).replace('.', ',')

/** Só quem entrou com uma conta do app mexe no quadro. O administrador do painel não participa de campanhas. */
function contaDoApp(e, oQue) {
  const conta = e.auth
  if (!conta || conta.collection().name !== 'users') {
    throw new BadRequestError(`${oQue}: só quem entrou com uma conta do app mexe no quadro.`)
  }
  return conta
}

/** Imagem só com imagem, nota só com texto e cor. */
function validarItem(app, record) {
  const tipo = record.getString('tipo')
  if (tipo === 'imagem') {
    const imagemId = record.getString('imagem')
    if (!imagemId) throw new BadRequestError('Item recusado: falta a imagem.')
    let imagem = null
    try {
      imagem = app.findRecordById('quadro_imagens', imagemId)
    } catch (_) {
      imagem = null
    }
    if (!imagem || imagem.getString('campanha') !== record.getString('campanha')) {
      throw new BadRequestError('Item recusado: a imagem não é desta campanha.')
    }
    record.set('texto', '')
    record.set('cor', '')
  } else {
    if (record.getString('imagem')) throw new BadRequestError('Item recusado: nota não tem imagem.')
    if (!record.getString('cor')) record.set('cor', 'amarelo')
  }
}

module.exports = {
  LIMITE_PADRAO_MB,

  /** Nova imagem na biblioteca: grava quem enviou e o tamanho, e confere o espaço da campanha. */
  enviarImagem(e) {
    const conta = contaDoApp(e, 'Imagem recusada')
    const arquivo = e.record.getUnsavedFiles('arquivo')[0]
    if (!arquivo) throw new BadRequestError('Imagem recusada: falta o arquivo da imagem.')
    const limite = limiteEmBytes()
    const campanha = e.record.getString('campanha')

    // Na transação, dois envios ao mesmo tempo não passam juntos do limite: o PocketBase grava uma
    // transação de cada vez.
    e.app.runInTransaction((txApp) => {
      const soma = new DynamicModel({ total: 0 })
      txApp.db().newQuery('SELECT COALESCE(SUM(bytes), 0) AS total FROM quadro_imagens WHERE campanha = {:campanha}').bind({ campanha }).one(soma)
      if (soma.total + arquivo.size > limite) {
        throw new BadRequestError(
          `Imagem recusada: a campanha chegou ao limite de ${emMB(limite)} MB de imagens (já usa ${emMB(soma.total)} MB). Apague imagens que não usam mais e tente de novo.`,
        )
      }
      e.record.set('autor', conta.id)
      e.record.set('bytes', arquivo.size)
      e.app = txApp
      e.next()
    })
  },

  /** Na biblioteca, só o nome muda. Trocar o arquivo seria uma imagem nova, com outro tamanho. */
  editarImagem(e) {
    const antes = e.record.original()
    const mudou = ['campanha', 'autor', 'bytes', 'largura', 'altura', 'arquivo'].some((campo) => e.record.getString(campo) !== antes.getString(campo))
    if (mudou || e.record.getUnsavedFiles('arquivo').length > 0) {
      throw new BadRequestError('Imagem recusada: na biblioteca só o nome muda. Para trocar a imagem, envie outra.')
    }
    e.next()
  },

  /** Novo item no quadro: grava quem pôs e confere a imagem ou a nota. */
  criarItem(e) {
    const conta = contaDoApp(e, 'Item recusado')
    e.record.set('autor', conta.id)
    validarItem(e.app, e.record)
    e.next()
  },

  /** Mover, mudar de tamanho ou editar a nota. A regra já conferiu quem pode o quê. */
  editarItem(e) {
    validarItem(e.app, e.record)
    e.next()
  },
}
