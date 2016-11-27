'use strict'

const _ = require('lodash')
const ChatStatistic = require('../models/chat-statistic')

function getChatStatistic(chat_id) {
  return new Promise((resolve, reject) => {
    ChatStatistic.findOne({chat_id})
      .exec((err, result) => {
        if (err) {
          console.log('Stat find error: ' + err)
          return reject(err)
        }
        return resolve(result)
      })
  })
}

function updateStatistic(user_info, chat_id) {
  if (!user_info || !user_info.id) {
    return Promise.reject()
  }
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

    return new Promise((resolve, reject) => {
      ChatStatistic.update({chat_id}, {
        chat_id,
        users: chatStatistic.users
      }, {upsert: true})
        .exec((err, result) => {
          if (err) {
            console.log('Stat update error: ' + err)
            return reject(err)
          }
          return resolve(result)
        })
    })
  })
}

function getUserName(user_info) {
  return user_info.username || user_info.first_name || user_info.last_name || user_info.id
}

module.exports = {getChatStatistic, updateStatistic}