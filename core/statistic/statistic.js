'use strict'
const _ = require('lodash')
const ChatStatistic = require('../models/chat-statistic')

const getChatStatistic = (chat_id) => ChatStatistic.findOne({chat_id}).catch(() => null)

function updateStatistic(user_info, chat_id) {
  return getChatStatistic(chat_id).then(chatStatistic => {
    chatStatistic = chatStatistic || {chat_id, users: []}
    let userStatistic = _.find(chatStatistic.users, {id: user_info.id})

    if (!userStatistic) {
      userStatistic = {
        id: user_info.id,
        username: getUserName(user_info),
        msgCount: 1
      }
      chatStatistic.users.push(userStatistic)
    } else {
      userStatistic.msgCount++
      userStatistic.username = getUserName(user_info)
    }

    return ChatStatistic.update({chat_id}, {chat_id, users: chatStatistic.users}, {upsert: true}).exec()
      .catch(() => null)
  })
}

function getUserName(user_info) {
  return user_info.username || user_info.first_name || user_info.last_name || user_info.id
}

module.exports = {getChatStatistic, updateStatistic}