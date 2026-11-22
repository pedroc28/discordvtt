/// <reference path="../pb_data/types.d.ts" />

// Funções auxiliares dos hooks de campanhas.pb.js. O nome sem ".pb" impede o PocketBase de
// carregar este arquivo como hook: ele só entra pelo require.

module.exports = {
  // Recusa a mudança se a participação for a única de mestre na campanha.
  exigirOutroMestre(app, participacao) {
    const outros = app.findRecordsByFilter(
      'participantes',
      'campanha = {:campanha} && papel = "mestre" && id != {:id}',
      '',
      1,
      0,
      { campanha: participacao.get('campanha'), id: participacao.id },
    )
    if (outros.length === 0) {
      throw new BadRequestError('A campanha precisa de pelo menos um mestre. Torne outra pessoa mestre antes.')
    }
  },
}
