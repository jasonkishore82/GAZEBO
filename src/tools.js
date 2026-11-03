import { describePolicy, parseColor, resolveNames } from './lib/wake.js'
import { toSeconds } from './useTimers.js'

const EMOTIONS = ['neutral', 'happy', 'curious', 'surprised', 'sleepy']

async function api(path, options) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`)
  return body
}

// the person a note is about: the one named, else whoever is speaking, else who is on camera
function personFor(ctx, named) {
  const c = ctx.current
  return String(named || c.speaker() || c.onCamera() || '').trim()
}

// Runs the tools Greeny calls during a voice chat. `ctx` is a ref to the latest
// app state and actions (see App.jsx), so a tool always sees current data.
// Every handler returns a plain object that goes back to the model.
export function createToolRunner(ctx) {
  const handlers = {
    list_users() {
      const c = ctx.current
      const users = c.users()
      return {
        registered_users: users,
        on_camera: c.onCamera() || null,
        stranger_on_camera: c.strangerOnCamera(),
        speaking_now: c.speaker() || null,
        state: c.state(),
        wake_rule: describePolicy(c.policy()),
      }
    },

    set_wake_policy({ wake_for, any_registered, sleep_now } = {}) {
      const c = ctx.current
      const registered = c.users().map((u) => u.name)
      const { resolved, unknown } = resolveNames(wake_for, registered)
      if (!resolved.length && !any_registered) {
        return {
          ok: false,
          error: unknown.length
            ? `None of those names are registered: ${unknown.join(', ')}.`
            : 'Say who may wake me, or set any_registered.',
          registered_users: registered,
        }
      }
      const policy = { users: resolved, anyRegistered: !!any_registered }
      c.setPolicy(policy)
      const sleeping = sleep_now !== false
      if (sleeping) c.sleepSoon()
      return {
        ok: true,
        wake_rule: describePolicy(policy),
        will_wake_for: resolved,
        any_registered: !!any_registered,
        unknown_names: unknown,
        going_to_sleep: sleeping,
        note: unknown.length ? 'Tell the user those names are not registered.' : undefined,
      }
    },

    clear_wake_policy() {
      ctx.current.setPolicy(null)
      return { ok: true, wake_rule: describePolicy(null) }
    },

    go_to_sleep() {
      ctx.current.sleepSoon()
      return { ok: true, going_to_sleep: true, wake_rule: describePolicy(ctx.current.policy()) }
    },

    wake_up() {
      ctx.current.setPolicy(null)
      ctx.current.wake()
      return { ok: true, awake: true }
    },

    register_face({ name } = {}) {
      return ctx.current.registration.beginFace(name)
    },

    register_voice({ name } = {}) {
      return ctx.current.registration.beginVoice(name)
    },

    finish_voice_recording() {
      return ctx.current.registration.finishVoice()
    },

    remove_person({ name, what } = {}) {
      return ctx.current.registration.beginRemove(name, what)
    },

    confirm_pending({ confirm, name } = {}) {
      return ctx.current.registration.confirm(confirm === true, name)
    },

    set_camera({ on } = {}) {
      if (typeof on !== 'boolean') return { ok: false, error: 'Say whether the camera should be on or off.' }
      ctx.current.setSetting('cameraOn', on)
      return { ok: true, camera: on ? 'on' : 'off' }
    },

    async remember_fact({ fact, person } = {}) {
      const who = personFor(ctx, person)
      if (!who) return { ok: false, error: 'I do not know who this is about. Ask the user to say the person\'s name.' }
      if (!String(fact || '').trim()) return { ok: false, error: 'What should I remember?' }
      const saved = await api('/api/facts', { method: 'POST', body: JSON.stringify({ person: who, text: fact }) })
      return { ok: true, remembered: saved.text, person: saved.person }
    },

    async forget_fact({ about, person } = {}) {
      const who = personFor(ctx, person)
      if (!who) return { ok: false, error: 'I do not know whose notes to look in. Ask the user to say the name.' }
      const { removed } = await api('/api/facts/forget', { method: 'POST', body: JSON.stringify({ person: who, about }) })
      return removed.length ? { ok: true, forgotten: removed, person: who } : { ok: false, error: `I have nothing saved about "${about}" for ${who}.` }
    },

    async list_facts({ person } = {}) {
      const who = personFor(ctx, person)
      if (!who) return { ok: false, error: 'I do not know whose notes to read. Ask the user to say the name.' }
      const facts = await api(`/api/facts?person=${encodeURIComponent(who)}`)
      return { ok: true, person: who, facts: facts.map((f) => f.text) }
    },

    show_emotion({ emotion, seconds } = {}) {
      const e = String(emotion || '').toLowerCase()
      if (!EMOTIONS.includes(e)) return { ok: false, error: `Pick one of: ${EMOTIONS.join(', ')}.` }
      const secs = Math.min(60, Math.max(1, Number(seconds) || 6))
      ctx.current.showEmotion(e === 'neutral' ? 'idle' : e, secs)
      return { ok: true, emotion: e, seconds: secs }
    },

    greet_on_arrival({ enabled } = {}) {
      const on = enabled !== false
      ctx.current.setGreet(on)
      return { ok: true, greeting: on ? 'on' : 'off', note: on ? 'I will say hello to registered people when they come back while a voice chat is running.' : undefined }
    },

    set_timer({ minutes, seconds, label } = {}) {
      const total = toSeconds({ minutes, seconds })
      if (!total) return { ok: false, error: 'Give a length between 1 second and 24 hours.' }
      const t = ctx.current.timers.add({ seconds: total, label })
      return { ok: true, label: t.label, seconds: total }
    },

    cancel_timer({ label } = {}) {
      const n = ctx.current.timers.cancel(label)
      return n ? { ok: true, cancelled: n } : { ok: false, error: label ? `No timer called "${label}".` : 'No timers are running.' }
    },

    change_colors({ eye_color, face_color } = {}) {
      const eye = eye_color ? parseColor(eye_color) : undefined
      const face = face_color ? parseColor(face_color) : undefined
      const bad = [eye_color && !eye && eye_color, face_color && !face && face_color].filter(Boolean)
      if (bad.length) return { ok: false, error: `Not a colour I know: ${bad.join(', ')}. Try a name like red or a hex code.` }
      if (!eye && !face) return { ok: false, error: 'Give an eye_color and/or a face_color.' }
      if (eye) ctx.current.setSetting('eyeColor', eye)
      if (face) ctx.current.setSetting('faceColor', face)
      return { ok: true, eye_color: eye, face_color: face }
    },
  }

  return async function run(name, args) {
    const fn = handlers[name]
    if (!fn) return { ok: false, error: `Unknown tool: ${name}` }
    try {
      return await fn(args || {})
    } catch (e) {
      console.error(`[tool ${name}]`, e)
      return { ok: false, error: 'The tool failed.' }
    }
  }
}
