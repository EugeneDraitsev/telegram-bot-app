import { model, models, Schema } from 'mongoose'

const chatStatistic = new Schema({
  chat_id: { type: Number, required: true },
  users: [{
    id: { type: Number, required: true },
    msgCount: { type: Number, required: true },
    username: { type: String, required: true },
  }],
})

export default models.chatStatistic ? models.chatStatistic : model('chatStatistic', chatStatistic)
