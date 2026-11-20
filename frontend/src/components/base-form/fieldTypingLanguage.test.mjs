import test from 'node:test'
import assert from 'node:assert/strict'
import { typingCharacter } from './fieldTypingLanguage.ts'

test('Persian and English physical keys, shift, caps, digits and ZWNJ', () => {
  assert.equal(typingCharacter('KeyA','fa'),'ش')
  assert.equal(typingCharacter('KeyD','fa'),'ی')
  assert.equal(typingCharacter('KeyA','en'),'a')
  assert.equal(typingCharacter('KeyA','en',true),'A')
  assert.equal(typingCharacter('KeyA','en',true,true),'a')
  for (const mode of ['fa', 'en']) {
    for (const digit of '0123456789') assert.equal(typingCharacter('Digit' + digit, mode), digit)
  }
  assert.equal(typingCharacter('Space','fa',true),'\u200c')
  for (const key of ['Enter','F3','ArrowLeft','Backspace','Delete','Tab']) assert.equal(typingCharacter(key,'fa'),undefined)
})
