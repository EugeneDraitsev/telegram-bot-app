'use strict'
module.exports = {yasnyfy: (text) => `\n>${new Date().getFullYear()}${text ? `\n>${text}` : ''}\nЯсно`}
