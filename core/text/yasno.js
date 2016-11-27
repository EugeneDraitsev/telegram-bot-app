'use strict'

const yasnyfy = (text) => `\n>${new Date().getFullYear()}${text ? `\n>${text}` : ''}\nЯсно`

module.exports = {yasnyfy}
