import test from 'node:test'
import assert from 'node:assert/strict'
import { yuanToCents } from '../src/money.ts'

test('whole yuan converts to integer fen', () => assert.equal(yuanToCents('12345'), 1234500))
test('decimal amounts convert without floating-point rounding', () => {
  assert.equal(yuanToCents('1.01'), 101)
  assert.equal(yuanToCents('0.29'), 29)
  assert.equal(yuanToCents('123.40'), 12340)
  assert.equal(yuanToCents('10.1'), 1010)
})
test('zero is valid', () => assert.equal(yuanToCents('0'), 0))
test('surrounding whitespace is tolerated', () => assert.equal(yuanToCents(' 9.99 '), 999))
test('negative, excess precision, empty, NaN, infinity, and exponent input rejected', () => {
  for (const value of ['-1', '0.001', '', 'NaN', 'Infinity', '1e3', 'abc']) assert.throws(() => yuanToCents(value))
})
test('amount above safe integer limit rejected', () => assert.throws(() => yuanToCents('90071992547409.92')))
