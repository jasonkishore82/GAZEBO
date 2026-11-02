import { describe, expect, it } from 'vitest'
import { SpeechSegmenter, contextNote } from './speaker.js'

const chunk = (amp) => Int16Array.from({ length: 1600 }, (_, i) => Math.round(Math.sin(i / 5) * amp * 32767))
const loud = () => chunk(0.3)
const quiet = () => chunk(0.001)

describe('SpeechSegmenter', () => {
  it('returns a segment after enough speech followed by a pause', () => {
    const s = new SpeechSegmenter()
    let out = null
    for (let i = 0; i < 15; i++) s.feed(loud())
    for (let i = 0; i < 6 && !out; i++) out = s.feed(quiet())
    expect(out).not.toBeNull()
    expect(out.length).toBeGreaterThanOrEqual(15 * 1600)
  })

  it('ignores short blips', () => {
    const s = new SpeechSegmenter()
    for (let i = 0; i < 3; i++) s.feed(loud())
    let out = null
    for (let i = 0; i < 8; i++) out = out || s.feed(quiet())
    expect(out).toBeNull()
  })

  it('cuts long speech into segments', () => {
    const s = new SpeechSegmenter()
    let out = null
    for (let i = 0; i < 40 && !out; i++) out = s.feed(loud())
    expect(out).not.toBeNull()
  })

  it('stays silent in silence', () => {
    const s = new SpeechSegmenter()
    for (let i = 0; i < 50; i++) expect(s.feed(quiet())).toBeNull()
  })
})

describe('contextNote', () => {
  it('says when someone other than the person on camera is speaking', () => {
    expect(contextNote('Ann', { name: 'Bo' })).toMatch(/Bo, not Ann/)
  })
  it('confirms the person on camera is speaking', () => {
    expect(contextNote('Ann', { name: 'Ann' })).toMatch(/Ann, who is on camera/)
  })
  it('handles unknown voices and no speaker', () => {
    expect(contextNote('Ann', { name: null })).toMatch(/does not recognise/)
    expect(contextNote('', null)).toMatch(/no longer recognises/)
  })
})
