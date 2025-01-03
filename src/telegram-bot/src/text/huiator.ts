const consonants = ['бвгджзйклмнпрстфхчцшщ']
const patterns = [
  new RegExp(`^[${consonants}]*[оеёэ]`, 'i'),
  new RegExp(`^[${consonants}]*[ую]`, 'i'),
  new RegExp(`^[${consonants}]*[ая]`, 'i'),
  new RegExp(`^[${consonants}]*[иы]`, 'i'),
]
const mainPattern = new RegExp(`^[${consonants}]*.`, 'i')

const capitalize = (capitalization: boolean[], word = '') =>
  word
    .split('')
    .map((letter, index) =>
      capitalization[index] ? letter.toUpperCase() : letter.toLowerCase(),
    )
    .join('')

const huifyWord = (word = '') => {
  if (word.length > 2) {
    const capitalization = word
      .split('')
      .map((letter) => letter === letter.toUpperCase())

    switch (patterns.findIndex((pattern) => pattern.test(word))) {
      case 0:
        return capitalize(capitalization, word.replace(mainPattern, 'хуе'))
      case 1:
        return capitalize(capitalization, word.replace(mainPattern, 'хую'))
      case 2:
        return capitalize(capitalization, word.replace(mainPattern, 'хуя'))
      case 3:
        return capitalize(capitalization, word.replace(mainPattern, 'хуи'))
      default:
        return capitalize(capitalization, word)
    }
  }
  return word
}

export const huify = (text: string): string =>
  text?.replace ? text.replace(/[А-Я0-9]+/gi, huifyWord) : text
