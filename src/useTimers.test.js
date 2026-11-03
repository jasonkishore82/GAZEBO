import { describe, expect, it } from 'vitest'
import { toSeconds } from './useTimers.js'

describe('toSeconds', () => {
  it('adds minutes and seconds', () => {
    expect(toSeconds({ minutes: 2, seconds: 30 })).toBe(150)
    expect(toSeconds({ minutes: 10 })).toBe(600)
    expect(toSeconds({ seconds: 45 })).toBe(45)
  })
  it('accepts fractions and numeric strings', () => {
    expect(toSeconds({ minutes: '1.5' })).toBe(90)
  })
  it('rejects empty, negative and absurd lengths', () => {
    expect(toSeconds({})).toBe(0)
    expect(toSeconds({ minutes: -5 })).toBe(0)
    expect(toSeconds({ minutes: 5000 })).toBe(0)
    expect(toSeconds()).toBe(0)
  })
})
