import test from 'node:test'
import assert from 'node:assert/strict'
import { typingCharacter } from './fieldTypingLanguage.ts'

test('Persian and English physical keys, shift, caps, digits and ZWNJ', () => {
  assert.equal(typingCharacter('KeyA','fa'),'ش')
  assert.equal(typingCharacter('KeyD','fa'),'ی')
  assert.equal(typingCharacter('KeyA','en'),'a')
  assert.equal(typingCharacter('KeyA','en',true),'A')
  assert.equal(typingCharacter('KeyA','en',true,true),'a')
  assert.equal(typingCharacter('Digit2','fa'),'۲')
  assert.equal(typingCharacter('Digit2','en'),'2')
  assert.equal(typingCharacter('Space','fa',true),'\u200c')
  for (const key of ['Enter','F3','ArrowLeft','Backspace','Delete','Tab']) assert.equal(typingCharacter(key,'fa'),undefined)
})
