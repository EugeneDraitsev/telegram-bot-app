'use strict'
const _ = require('lodash')

//Collection of file_id's for stickers (https://telegram.me/addstickers/magicBall)
const prediction = () => _.sample([
  'BQADAgADYgADt7A3BoDZ58u5GNyPAg',
  'BQADAgADZAADt7A3BhljKKZjgGXtAg',
  'BQADAgADZgADt7A3Bs9cj69gGlocAg',
  'BQADAgADaAADt7A3BmStSmLLZBwxAg',
  'BQADAgADagADt7A3BoPYp7PlQl5fAg',
  'BQADAgADbAADt7A3BnptbzPfmMn1Ag',
  'BQADAgADbgADt7A3BklDNNYp4kfWAg',
  'BQADAgADcAADt7A3BmS_rlNb_urNAg',
  'BQADAgADcgADt7A3BsO6QhuVa5RXAg',
  'BQADAgADdAADt7A3BpLxoodPK1OWAg',
  'BQADAgADdgADt7A3BpmhhBqkfikyAg',
  'BQADAgADeAADt7A3Bp6Wr-D3duPSAg',
  'BQADAgADegADt7A3Br8RH16mv2HyAg',
  'BQADAgADfAADt7A3Bggy75myWyliAg',
  'BQADAgADfgADt7A3BgU1ufoc8cFWAg',
  'BQADAgADgAADt7A3BgcvSgO71AENAg',
  'BQADAgADggADt7A3BqjgUy3h4sdlAg',
  'BQADAgADhAADt7A3Bvj208m6u1NlAg',
  'BQADAgADhgADt7A3BoV9ejE-Lw4gAg',
  'BQADAgADiAADt7A3Bi3iPt8F9H3aAg'
])

module.exports = {prediction}