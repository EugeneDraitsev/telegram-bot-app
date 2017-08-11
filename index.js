require('./load-config')
const _ = require('lodash')
const db = require('./src/core/db/mongoose')
const statistic = require('./src/core/statistic/statistic')
const commands = require('./src/commands')

function updateMessageStat(user_info, chat_id) {
  return db.openConnection().then(() => statistic.updateStatistic(user_info, chat_id))
}

function processRequest(req) {
  if (!req || !req.message || !req.message.chat || !req.message.text) {
    return Promise.resolve('not a telegram message')
  }

  const { message: { message_id, from, chat, text, reply_to_message } } = req
  const replyText = _.get(reply_to_message, 'text')

  return Promise.all([commands.processQuery(text, message_id, chat.id, replyText).catch(() => {}),
    updateMessageStat(from, chat.id).catch(() => {})])
    .then(db.closeConnection)
}

function sendResponse(message, input, callback) {
  const response = {
    statusCode: 200,
    body: JSON.stringify({ message, input }),
  }

  return callback(null, response)
}


function handler(req, context, callback) {
  // eslint-disable-next-line no-param-reassign
  req = req.body ? JSON.parse(req.body) : req
  console.log(req) // eslint-disable-line no-console

  processRequest(req)
    .then(message => sendResponse(message, req, callback))
    .catch(() => sendResponse('something going wrong :c', req, callback))
}

exports.handler = handler // eslint-disable-line
