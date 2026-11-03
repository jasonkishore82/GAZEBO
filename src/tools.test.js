import { afterEach, describe, expect, it, vi } from 'vitest'
import { createToolRunner } from './tools.js'

function setup(over = {}) {
  const calls = { settings: [], emotion: [], greet: [], timers: [] }
  const ctx = {
    current: {
      users: () => [],
      onCamera: () => 'Jason',
      speaker: () => '',
      strangerOnCamera: () => false,
      state: () => 'awake',
      policy: () => null,
      setSetting: (k, v) => calls.settings.push([k, v]),
      showEmotion: (m, s) => calls.emotion.push([m, s]),
      setGreet: (on) => calls.greet.push(on),
      timers: {
        add: (t) => (calls.timers.push(t), { id: 'x', label: t.label || 'timer' }),
        cancel: (l) => (l === 'tea' ? 1 : 0),
      },
      ...over,
    },
  }
  return { run: createToolRunner(ctx), calls }
}

afterEach(() => vi.unstubAllGlobals())

describe('tools', () => {
  it('set_camera needs a boolean and sets cameraOn', async () => {
    const { run, calls } = setup()
    expect((await run('set_camera', {})).ok).toBe(false)
    expect(await run('set_camera', { on: false })).toMatchObject({ ok: true, camera: 'off' })
    expect(calls.settings).toEqual([['cameraOn', false]])
  })

  it('show_emotion validates and maps neutral to idle', async () => {
    const { run, calls } = setup()
    expect((await run('show_emotion', { emotion: 'angry' })).ok).toBe(false)
    expect((await run('show_emotion', { emotion: 'Neutral', seconds: 500 })).seconds).toBe(60)
    expect(calls.emotion).toEqual([['idle', 60]])
    await run('show_emotion', { emotion: 'happy' })
    expect(calls.emotion[1]).toEqual(['happy', 6])
  })

  it('greet_on_arrival defaults to on', async () => {
    const { run, calls } = setup()
    await run('greet_on_arrival', {})
    await run('greet_on_arrival', { enabled: false })
    expect(calls.greet).toEqual([true, false])
  })

  it('set_timer and cancel_timer', async () => {
    const { run, calls } = setup()
    expect((await run('set_timer', {})).ok).toBe(false)
    expect(await run('set_timer', { minutes: 10, label: 'tea' })).toMatchObject({ ok: true, seconds: 600 })
    expect(calls.timers[0]).toEqual({ seconds: 600, label: 'tea' })
    expect((await run('cancel_timer', { label: 'tea' })).ok).toBe(true)
    expect((await run('cancel_timer', { label: 'nope' })).ok).toBe(false)
  })

  it('remember_fact saves for the speaker, or the face on camera', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ person: 'Jason', text: 'likes tea' }) }))
    vi.stubGlobal('fetch', fetchMock)
    const { run } = setup()
    expect(await run('remember_fact', { fact: 'likes tea' })).toMatchObject({ ok: true, person: 'Jason' })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ person: 'Jason', text: 'likes tea' })
    const { run: noOne } = setup({ onCamera: () => '' })
    expect((await noOne('remember_fact', { fact: 'x' })).ok).toBe(false)
  })

  it('forget_fact reports what it removed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ removed: ['likes tea'] }) })))
    const { run } = setup()
    expect(await run('forget_fact', { about: 'tea' })).toMatchObject({ ok: true, forgotten: ['likes tea'] })
  })

  it('unknown tools fail cleanly', async () => {
    const { run } = setup()
    expect((await run('nope', {})).ok).toBe(false)
  })
})
