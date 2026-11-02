import { WebSocketServer, WebSocket } from 'ws'
import { VOICE_NAMES } from '../src/lib/voices.js'
import { TOOL_DECLARATIONS } from '../src/lib/toolDefs.js'

const UPSTREAM =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'

const BASE_PERSONA =
  'You are Greeny, a cheerful, curious little green avatar with big expressive eyes. ' +
  'Talk like a warm, playful friend: short, natural sentences, a bit of humour, never long speeches. ' +
  'You can see nothing but you love chatting. Keep replies under three sentences unless asked for more.'

// What Greeny knows about who is on camera: `who` is the recognised name (or
// empty); `names` is everyone saved in the database.
export function personaFor(who, names) {
  const known = names.length ? `People you know by face or voice: ${names.join(', ')}.` : 'You do not know anyone by face yet.'
  const now = who
    ? `The camera has just recognised the person talking to you as ${who}. If they ask their name or who they are, answer ${who}, and feel free to greet them by name.`
    : 'The camera does not recognise the person talking to you. If they ask their name, say you do not recognise them yet and that they can press the Add face button to introduce themselves; never guess a name.'
  return `${BASE_PERSONA} ${known} ${now} If they tell you a different name, use it in conversation, but trust the camera facts above. Messages that start with [Voice update] or [Camera update] come from the app, not the user: they say who is speaking (identified by their voice) and who is on camera. When they differ, a different person than the one on camera is speaking, so talk to the speaker by name; never read these messages aloud and never reply to them on their own. You have tools for controlling yourself. When someone says they are leaving and you should not wake up until they (or certain other people) return, call list_users first to see who is registered, then set_wake_policy with the real registered names (use the speaker's own name for "me"; set any_registered when they say any other user may wake you). If a name is not registered, say so. After the tool succeeds, say a short goodnight and that you will wake for those people; you then fall asleep. Use go_to_sleep, wake_up, clear_wake_policy and change_colors when asked. To save a new person: when someone says to save the person on camera ("save him as Sam"), call register_face with the name, then ask aloud "Save him as Sam, is that right?" and wait for a clear yes before calling confirm_pending with confirm true (if they correct the name, pass it). For a voice ("save his voice too"): call register_voice, tell the person to keep talking for a few seconds, call finish_voice_recording, ask to confirm the name, then confirm_pending. To delete someone's saved face or voice: call remove_person, ask aloud to confirm the deletion, and only after a yes call confirm_pending with confirm true. Never save or delete without that spoken yes. Never mention tool names aloud.`
}

// Dev/preview-server plugin: the browser talks to /api/live and this relays to
// Gemini Live, so GEMINI_API_KEY stays on the server and never reaches the page.
export function liveProxy(env, getNames = async () => []) {
  const attach = (server) => {
    const wss = new WebSocketServer({ noServer: true })

    server.httpServer?.on('upgrade', (req, socket, head) => {
      if (!req.url?.startsWith('/api/live')) return
      wss.handleUpgrade(req, socket, head, (client) => {
        const q = new URL(req.url, 'http://x').searchParams
        open(client, q.get('who') || '', q.get('voice') || '')
      })
    })

    async function open(client, who, voiceChoice) {
      const key = env.GEMINI_API_KEY
      if (!key) {
        client.send(JSON.stringify({ error: 'GEMINI_API_KEY is not set in .env' }))
        client.close()
        return
      }
      const model = env.GEMINI_LIVE_MODEL || 'gemini-live-2.5-flash-preview'
      // the settings dropdown may pick a voice; anything unknown falls back to .env
      const voice = VOICE_NAMES.has(voiceChoice) ? voiceChoice : env.GEMINI_LIVE_VOICE || 'Puck'
      let names = []
      try { names = await getNames() } catch { /* persona works without names */ }
      const persona = personaFor(who.slice(0, 120), names)
      const up = new WebSocket(`${UPSTREAM}?key=${encodeURIComponent(key)}`)
      const queue = []

      up.on('open', () => {
        up.send(
          JSON.stringify({
            setup: {
              model: model.startsWith('models/') ? model : `models/${model}`,
              generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
              },
              systemInstruction: { parts: [{ text: persona }] },
              tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
              inputAudioTranscription: {},
              outputAudioTranscription: {},
            },
          })
        )
        queue.splice(0).forEach((m) => up.send(m))
      })
      up.on('message', (data) => client.readyState === 1 && client.send(data.toString()))
      up.on('unexpected-response', (_req, res) => {
        client.send(JSON.stringify({ error: `Gemini refused the connection (HTTP ${res.statusCode})` }))
        client.close()
      })
      up.on('error', (e) => {
        client.readyState === 1 && client.send(JSON.stringify({ error: `Gemini connection error: ${e.message}` }))
      })
      up.on('close', (code, reason) => {
        if (client.readyState === 1) {
          const why = reason?.toString()
          if (code !== 1000 && why) client.send(JSON.stringify({ error: `Gemini closed: ${why}` }))
          client.close()
        }
      })

      client.on('message', (data) => {
        const msg = data.toString()
        if (up.readyState === 1) up.send(msg)
        else if (up.readyState === 0) queue.push(msg)
      })
      client.on('close', () => up.close())
    }
  }

  return { name: 'gemini-live-proxy', configureServer: attach, configurePreviewServer: attach }
}
