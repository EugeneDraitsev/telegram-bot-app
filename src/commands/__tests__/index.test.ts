import { findCommand } from '../'

describe('findCommand must works as designed', () => {
    test('findCommand must properly coomands from first word in message or string ending with @', () => {
        expect(findCommand('/g')).toEqual('/g')
        expect(findCommand('/hello world')).toEqual(undefined)
        expect(findCommand('/g@draiBot')).toEqual('/g')
        expect(findCommand('g')).toEqual(undefined)
    })

})
