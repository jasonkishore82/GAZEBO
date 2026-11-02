import { describe, expect, it } from 'vitest'
import { describePolicy, mayWake, parseColor, resolveNames } from './wake.js'

describe('resolveNames', () => {
  const registered = ['Jason', 'prAKASH', 'sudhan']
  it('matches ignoring case and spacing, using the registered spelling', () => {
    expect(resolveNames([' jason ', 'PRakash'], registered)).toEqual({ resolved: ['Jason', 'prAKASH'], unknown: [] })
  })
  it('reports names nobody registered', () => {
    expect(resolveNames(['Sam', 'sudhan'], registered)).toEqual({ resolved: ['sudhan'], unknown: ['Sam'] })
  })
  it('handles nothing', () => {
    expect(resolveNames(undefined, registered)).toEqual({ resolved: [], unknown: [] })
  })
})

describe('mayWake', () => {
  it('lets anyone wake it when there is no policy', () => {
    expect(mayWake(null, '')).toBe(true)
  })
  it('only lets the listed users wake it', () => {
    const p = { users: ['Jason'], anyRegistered: false }
    expect(mayWake(p, 'jason')).toBe(true)
    expect(mayWake(p, 'Sam')).toBe(false)
    expect(mayWake(p, '')).toBe(false)
  })
  it('lets any registered user but not strangers wake it', () => {
    const p = { users: [], anyRegistered: true }
    expect(mayWake(p, 'Sam')).toBe(true)
    expect(mayWake(p, '')).toBe(false)
  })
})

describe('describePolicy / parseColor', () => {
  it('describes policies', () => {
    expect(describePolicy(null)).toMatch(/anyone/)
    expect(describePolicy({ users: ['Jason'], anyRegistered: false })).toBe('only Jason can wake me')
  })
  it('parses colours', () => {
    expect(parseColor('Pink')).toBe('#ec407a')
    expect(parseColor('#abc')).toBe('#aabbcc')
    expect(parseColor('ff8800')).toBe('#ff8800')
    expect(parseColor('not a colour')).toBeNull()
  })
})
