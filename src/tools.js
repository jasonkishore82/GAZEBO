import { describePolicy, parseColor, resolveNames } from './lib/wake.js'

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
