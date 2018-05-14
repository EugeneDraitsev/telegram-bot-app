import { findIndex } from 'lodash'

const consonants = ['бвгджзйклмнпрстфхчцшщ']
const patterns = [new RegExp(`^[${consonants}]*[оеёэ]`, 'i'), new RegExp(`^[${consonants}]*[ую]`, 'i'),
  new RegExp(`^[${consonants}]*[ая]`, 'i'), new RegExp(`^[${consonants}]*[иы]`, 'i')]
const mainPattern = new RegExp(`^[${consonants}]*.`, 'i')

function huifyWord(word: string) {
  if (word.length > 2) {
    switch (findIndex(patterns, pattern => pattern.test(word))) {
      case 0:
        return word.replace(mainPattern, 'хуе')
      case 1:
        return word.replace(mainPattern, 'хую')
      case 2:
        return word.replace(mainPattern, 'хуя')
      case 3:
        return word.replace(mainPattern, 'хуи')
      default:
        return word
    }
  }
  return word
}

export const huify = (text: string) => text && text.replace ? text.replace(/[А-Я0-9]+/ig, huifyWord) : text
