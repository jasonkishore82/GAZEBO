import { spawn } from 'node:child_process'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { liveProxy } from './server/liveProxy.js'
import { faceRoutes } from './server/api.js'
import { voiceRoutes } from './server/voiceApi.js'
import { factRoutes } from './server/factsApi.js'
import { factsRepo } from './server/db/facts.js'
import { openDatabase } from './server/db/index.js'
import { facesRepo } from './server/db/faces.js'
import { voicesRepo } from './server/db/voices.js'

// Starts the SpeechBrain speaker-embedding service next to the dev server
// (set VOICE_SERVICE_URL to use one you run yourself, VOICE_AUTOSTART=0 to skip).
function startVoiceService(env, server) {
  const port = env.VOICE_PORT || '8791'
  const url = env.VOICE_SERVICE_URL || `http://127.0.0.1:${port}`
  if (env.VOICE_SERVICE_URL || env.VOICE_AUTOSTART === '0') return url
  const child = spawn(env.PYTHON || 'python', ['-u', 'sidecar/voice_service.py', port], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  })
  const log = (d) => d.toString().split('\n').filter((l) => /\[voice\]|Error|error/.test(l)).forEach((l) => console.log(l))
  child.stdout.on('data', log)
  child.stderr.on('data', log)
  child.on('error', (e) => console.warn(`[voice] could not start the voice service: ${e.message}`))
  const stop = () => child.kill()
  server.httpServer?.on('close', stop)
  process.on('exit', stop)
  return url
}

// REST API (faces, voices), the Gemini Live relay and the voice service,
// all served by the dev/preview server
function backend(env) {
  let dbPromise
  const getDb = () => (dbPromise ??= openDatabase(env))
  const attach = (server) => {
    const voiceUrl = startVoiceService(env, server)
    const route = (prefix, make) =>
      server.middlewares.use(async (req, res, next) => {
        if (!prefix.some((p) => req.url?.startsWith(p))) return next()
        try {
          return make(await getDb())(req, res, next)
        } catch (e) {
          console.error('[db]', e)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Database unavailable' }))
        }
      })
    route(['/api/faces'], (db) => faceRoutes(db))
    route(['/api/voices', '/api/voice/'], (db) => voiceRoutes(db, voiceUrl))
    route(['/api/facts'], (db) => factRoutes(db))
    liveProxy(
      env,
      async () => {
        const db = await getDb()
        const names = [...(await facesRepo(db).names()), ...(await voicesRepo(db).names())]
        return [...new Set(names)].sort()
      },
      async () => factsRepo(await getDb()).list()
    ).configureServer(server)
  }
  return { name: 'greeny-backend', configureServer: attach, configurePreviewServer: attach }
}

export default defineConfig(({ mode }) => {
  // empty prefix: read GEMINI_* for the server only; they are not exposed to the client
  const env = loadEnv(mode, process.cwd(), '')
  return { plugins: [react(), backend(env)] }
})
