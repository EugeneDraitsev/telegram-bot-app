'use strict';

function yasnyfy(text) {
  return `\n>${new Date().getFullYear()}${text ? `\n>${text}` : ''}\nЯсно`
}

module.exports = {yasnyfy}
