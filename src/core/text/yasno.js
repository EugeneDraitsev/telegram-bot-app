const yasnyfy = (text) => {
  const year = String(new Date().getFullYear()).replace('0', 'k')
  return `\n>${year}${text ? `\n>${text}` : ''}\nЯсно`
}

module.exports = { yasnyfy }
