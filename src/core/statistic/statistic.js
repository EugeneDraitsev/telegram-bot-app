const _ = require('lodash')
const ChatStatistic = require('../models/chat-statistic')

const getChatStatistic = chat_id => ChatStatistic.findOne({ chat_id }).catch(() => null)

function getUserName(user_info) {
  return user_info.username || user_info.first_name || user_info.last_name || user_info.id
}

function updateStatistic(user_info, chat_id) {
  return getChatStatistic(chat_id).then((chatStatistic) => {
    const statistic = chatStatistic || { chat_id, users: [] }
    let userStatistic = _.find(statistic.users, { id: user_info.id })

    if (!userStatistic) {
      userStatistic = {
        id: user_info.id,
        username: getUserName(user_info),
        msgCount: 1,
      }
      statistic.users.push(userStatistic)
    } else {
      userStatistic.msgCount++
      userStatistic.username = getUserName(user_info)
    }

    return ChatStatistic.update({ chat_id },
      { chat_id, users: statistic.users },
      { upsert: true }).exec()
      .catch(() => null)
  })
}


module.exports = { getChatStatistic, updateStatistic }
