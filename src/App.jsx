import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Eye from './Eye.jsx'
import Mouth from './Mouth.jsx'
import { useLive } from './useLive.js'
import { useFaces } from './useFaces.js'
import { useVoices } from './useVoices.js'
import { useHeadTurn } from './useHeadTurn.js'
import { createToolRunner } from './tools.js'
import { useRegistration } from './useRegistration.js'
import { PendingCard } from './FacesWindow.jsx'
import { describePolicy, mayWake } from './lib/wake.js'
import { useSpeaker } from './useSpeaker.js'
import { AddFaceWindow, ManageFacesWindow, RecordVoiceWindow } from './FacesWindow.jsx'
import SettingsPanel from './SettingsPanel.jsx'
import { useSettings } from './settings.js'
import { usePersonTracker } from './usePersonTracker.js'
import { useLandmarks } from './useLandmarks.js'
import LandmarkOverlay from './LandmarkOverlay.jsx'
import CharacterHands from './CharacterHands.jsx'
import { lidClosure, sceneScale } from './lib/detection.js'

// stable color per class so each object type keeps its box color
function labelColor(cls) {
  return cls === 0 ? '#3ddc97' : `hsl(${(cls * 47) % 360} 80% 60%)`
}

function useSceneScale(tall) {
  const [scale, setScale] = useState(() => sceneScale(window.innerWidth, window.innerHeight, tall))
  useEffect(() => {
    const on = () => setScale(sceneScale(window.innerWidth, window.innerHeight, tall))
    on()
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [tall])
  return scale
}

const BLOCKED = new Set(['denied', 'nocamera', 'error'])

function statusText(status, target, fps, who, accel) {
  if (status.state !== 'tracking') return status.message
  if (!target) return 'Tracking · nothing detected'
  const what = target.face ? (who ? `face locked · ${who}` : 'face locked') : `${target.objects[0]?.label ?? 'object'} found`
  return `Tracking · ${what}${fps ? ` · ${fps} fps${accel === 'gpu' ? ' · GPU' : ''}` : ''}`
}

const HELP = {
  denied: 'Allow camera access in your browser’s site settings, then try again. Meanwhile the eyes follow your mouse.',
  nocamera: 'Connect a camera and try again. Meanwhile the eyes follow your mouse.',
  error: 'The eyes follow your mouse until this is fixed.',
}

export default function App() {
  const [mouse, setMouse] = useState(null)
  const [settings, set, reset] = useSettings()
  const [panelOpen, setPanelOpen] = useState(false)
  const gearRef = useRef(null)
  const scale = useSceneScale(settings.character3d ? 1060 : 760)
  const facesApi = useFaces()
  const { videoRef, target, status, fps, accel, retry, identity, captureFace } = usePersonTracker(settings, facesApi.faces)
  const who = identity ? facesApi.faces.find((f) => f.id === identity.id)?.name ?? '' : ''
  const voices = useVoices()
  const voiceId = useSpeaker()
  const toolCtx = useRef(null)
  const runTool = useMemo(() => createToolRunner(toolCtx), [])
  const faceSeenNow = !!target?.face
  const registration = useRegistration({
    captureFace,
    addFace: facesApi.add,
    addVoice: voices.add,
    removeFace: facesApi.remove,
    removeVoice: voices.remove,
    faces: facesApi.faces,
    voices: voices.voices,
    who,
    faceSeen: faceSeenNow,
  })
  const feedMic = registration.feedPcm
  const feedSpeaker = voiceId.feed
  const onPcm = useCallback(
    (pcm) => {
      feedSpeaker(pcm)
      feedMic(pcm)
    },
    [feedSpeaker, feedMic]
  )
  const live = useLive({ face: who, speaker: voiceId.speaker, onPcm, voice: settings.voice, onToolCall: runTool })
  const liveOn = live.state === 'live'
  const { reset: resetSpeaker } = voiceId
  useEffect(() => {
    if (!liveOn) resetSpeaker()
  }, [liveOn, resetSpeaker])
  const appRef = useRef(null)
  const lookRef = useRef(null)
  const [win, setWin] = useState(null) // null | 'add' | 'manage' | 'record'
  const addRef = useRef(null)
  const manageRef = useRef(null)
  const faceOn = settings.blink || settings.showLandmarks
  const { blink, hand, marks } = useLandmarks(videoRef, { face: faceOn, hands: settings.hands })

  useEffect(() => {
    const onMove = (e) => setMouse({ x: e.clientX, y: e.clientY })
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  // Mood: startled when a face shows up (or comes back after a nap), happy
  // while it sees one, drowsy after 3 s without a face and fast asleep after 7 s.
  // It only dozes off while the camera is tracking faces and no voice chat is on.
  const faceSeen = !!target?.face
  // Wake rule set by the set_wake_policy tool: only some people may wake it. It
  // is "armed" once nobody who could wake it has been in view for 2 s, so the
  // person who says "go to sleep" doesn't wake it again by sitting there.
  const [policy, setPolicy] = useState(null) // null | { users, anyRegistered }
  const [armed, setArmed] = useState(true)
  const [sleepRequested, setSleepRequested] = useState(false)
  const eligible = faceSeen && mayWake(policy, who)
  useEffect(() => {
    if (armed || eligible) return
    const t = setTimeout(() => setArmed(true), 2000)
    return () => clearTimeout(t)
  }, [armed, eligible])
  const awakeFace = eligible && armed
  const sleepable = status.state === 'tracking' && settings.yunet && !liveOn
  const [stage, setStage] = useState(0) // 0 awake, 1 drowsy, 2 asleep
  const [startled, setStartled] = useState(false)
  const stageRef = useRef(0)
  const everSeen = useRef(false)
  useEffect(() => {
    if (!sleepable || awakeFace) {
      if (awakeFace && (stageRef.current > 0 || !everSeen.current)) {
        setStartled(true)
        setTimeout(() => setStartled(false), 700)
      }
      if (awakeFace) everSeen.current = true
      stageRef.current = 0
      setStage(0)
      return
    }
    const t1 = setTimeout(() => stageRef.current < 1 && ((stageRef.current = 1), setStage(1)), 3000)
    const t2 = setTimeout(() => ((stageRef.current = 2), setStage(2)), 7000)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [awakeFace, sleepable])

  let mood = 'idle'
  if (startled) mood = 'surprised'
  else if (awakeFace) mood = 'happy'
  else if (stage === 2) mood = 'asleep'
  else if (stage === 1) mood = 'sleepy'
  else if (target || hand) mood = 'curious'
  const asleep = mood === 'asleep'

  // Tools ask for sleep: say goodnight first, then end the chat and doze off.
  const endLive = live.end
  const speakingNow = live.speaking
  useEffect(() => {
    if (!sleepRequested || speakingNow) return
    const t = setTimeout(() => {
      stageRef.current = 2
      setStage(2)
      endLive()
      setSleepRequested(false)
    }, 4000)
    return () => clearTimeout(t)
  }, [sleepRequested, speakingNow, endLive])

  // what the tools can see and do (always the latest state)
  toolCtx.current = {
    users: () => {
      const names = new Map()
      for (const f of facesApi.faces) names.set(f.name, { name: f.name, has_face: true, has_voice: false })
      for (const v of voices.voices) names.set(v.name, { ...(names.get(v.name) || { name: v.name, has_face: false }), has_voice: true })
      return [...names.values()]
    },
    onCamera: () => who,
    strangerOnCamera: () => faceSeen && !who,
    speaker: () => voiceId.speaker?.name || '',
    state: () => ['awake', 'drowsy', 'asleep'][stageRef.current] || 'awake',
    policy: () => policy,
    setPolicy: (p) => {
      setPolicy(p)
      setArmed(!p)
    },
    sleepSoon: () => {
      setArmed(false)
      setSleepRequested(true)
    },
    wake: () => {
      setSleepRequested(false)
      setArmed(true)
      stageRef.current = 0
      setStage(0)
    },
    setSetting: set,
    registration,
  }

  // now and then the eyes glance away and come back, like a person's would
  const [glance, setGlance] = useState(null)
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    let t
    const loop = () => {
      t = setTimeout(() => {
        const a = Math.random() * Math.PI * 2
        const d = 220 + Math.random() * 260
        setGlance({ x: Math.cos(a) * d, y: Math.sin(a) * d * 0.6 })
        t = setTimeout(() => {
          setGlance(null)
          loop()
        }, 450 + Math.random() * 500)
      }, 3500 + Math.random() * 4500)
    }
    loop()
    return () => clearTimeout(t)
  }, [])

  // Webcam is mirrored: a person on the camera's right is on the viewer's left.
  // With nothing else in view, watch the user's hand.
  const aim = target || hand
  const watching = aim
    ? { x: (1 - aim.x) * window.innerWidth, y: aim.y * window.innerHeight }
    : mouse

  // With a face in view the eyes mostly look at the viewer (eye contact);
  // during a voice chat even more so. Glances apply on top of that.
  const contact = awakeFace ? Math.max(settings.eyeContact, liveOn ? 0.9 : 0) : 0
  const look = watching && contact > 0.4 && glance ? { x: watching.x + glance.x, y: watching.y + glance.y } : watching

  // the head follows the person; asleep, it droops
  lookRef.current = asleep ? { x: window.innerWidth / 2, y: window.innerHeight } : watching
  useHeadTurn(appRef, lookRef, settings.character3d)

  const pct = (v) => `${Math.max(0, Math.min(100, v * 100))}%`
  // boxes are in video coordinates; the preview is mirrored, so flip x
  const boxStyle = (b, color) => ({
    left: pct(1 - b.x - b.w),
    top: pct(b.y),
    width: pct(Math.min(b.w, 1 - Math.max(0, b.x))),
    height: pct(Math.min(b.h, 1 - Math.max(0, b.y))),
    '--box': color,
  })

  const showCam = settings.showPreview
  const dot = BLOCKED.has(status.state) ? 'bad' : status.state === 'tracking' ? 'ok' : 'wait'

  return (
    <div
      ref={appRef}
      className={`app${settings.character3d ? ' is-3d' : ''}`}
      style={{ '--face': settings.faceColor, '--iris': settings.eyeColor, '--s': scale }}
    >
      {settings.character3d && (
        <>
          <div className="neck" />
          <div className="body" />
          <div className="core" />
        </>
      )}
      <div className="head">
        {settings.character3d && (
          <>
            <div className="ear l" />
            <div className="ear r" />
            <div className="antenna" />
          </>
        )}
        <div className="dome" />
        <div className="eyes">
        <Eye
          look={look}
          mood={mood}
          side={-1}
          contact={contact}
          expression={settings.expression}
          sync={settings.blink && blink ? lidClosure(blink.left, settings.blinkSens) : null}
        />
        <Eye
          look={look}
          mood={mood}
          side={1}
          contact={contact}
          expression={settings.expression}
          sync={settings.blink && blink ? lidClosure(blink.right, settings.blinkSens) : null}
        />
      </div>

        <Mouth look={look} mood={live.speaking ? 'talking' : mood} levelRef={live.levelRef} />
      </div>

      {asleep && (
        <div className="zzz" aria-hidden="true">
          <span>z</span>
          <span>z</span>
          <span>Z</span>
        </div>
      )}

      {live.caption && <p className="caption">{live.caption}</p>}

      {settings.hands && settings.charHands && (
        <CharacterHands marks={marks} videoRef={videoRef} color={settings.faceColor} />
      )}

      <div className="pill" role="status" aria-live="polite">
        <span className={`dot ${dot}`} aria-hidden="true" />
        {live.state === 'connecting' ? live.message : asleep && policy ? `Asleep \u00b7 ${describePolicy(policy)}` : statusText(status, target, fps, who, accel)}
      </div>

      {BLOCKED.has(status.state) && (
        <div className="notice" role="alert">
          <strong>{status.message}</strong>
          <p>{HELP[status.state]}</p>
          <button className="btn" onClick={retry}>
            Try again
          </button>
        </div>
      )}

      {live.state === 'error' && (
        <div className="notice live-notice" role="alert">
          <strong>Voice chat unavailable</strong>
          <p>{live.message}</p>
          <button className="btn" onClick={live.toggle}>Try again</button>
        </div>
      )}

      <figure className="preview" style={{ display: showCam ? 'block' : 'none' }}>
        <video ref={videoRef} muted playsInline aria-label="Camera preview" />
        {settings.showLandmarks && (
          <LandmarkOverlay marks={marks} faceOn={faceOn} handsOn={settings.hands} />
        )}
        {settings.showBoxes &&
          target?.objects.map((o, i) => (
            <div key={i} className="bbox" style={boxStyle(o, labelColor(o.cls))}>
              <span>
                {o.label} {Math.round(o.score * 100)}%
              </span>
            </div>
          ))}
        {settings.showBoxes && target?.face && (
          <div className="bbox is-face" style={boxStyle(target.face, '#ffd54a')}>
            <span>face {Math.round(target.face.score * 100)}%</span>
          </div>
        )}
      </figure>

      {win === 'add' && (
        <AddFaceWindow
          videoRef={videoRef}
          captureFace={captureFace}
          onSave={facesApi.add}
          onClose={() => setWin(null)}
          anchorRef={addRef}
          hasFace={!!target?.face}
        />
      )}
      {win === 'manage' && (
        <ManageFacesWindow
          faces={facesApi.faces}
          error={facesApi.error}
          rename={facesApi.rename}
          remove={facesApi.remove}
          recognisedId={identity?.id}
          voices={voices}
          speakerName={voiceId.speaker?.name}
          onRecord={() => setWin('record')}
          onAdd={() => setWin('add')}
          onClose={() => setWin(null)}
          anchorRef={manageRef}
        />
      )}

      {registration.pending && (
        <PendingCard
          pending={registration.pending}
          onName={registration.setName}
          onConfirm={(yes) => registration.confirm(yes)}
        />
      )}

      {win === 'record' && (
        <RecordVoiceWindow
          names={[...new Set([...facesApi.faces.map((f) => f.name), ...voices.voices.map((v) => v.name)])]}
          onSave={voices.add}
          onClose={() => setWin('manage')}
          anchorRef={manageRef}
        />
      )}

      {liveOn && voiceId.speaker && (
        <div className={`speaker-chip${voiceId.speaker.name && who && voiceId.speaker.name !== who ? ' other' : ''}`} role="status">
          {voiceId.speaker.name ? `${voiceId.speaker.name} is speaking` : 'Unrecognised voice'}
          {voiceId.speaker.name && who && voiceId.speaker.name !== who ? ` \u00b7 not ${who}` : ''}
        </div>
      )}

      {panelOpen && (
        <SettingsPanel
          settings={settings}
          set={set}
          reset={reset}
          anchorRef={gearRef}
          onClose={() => setPanelOpen(false)}
        />
      )}

      <nav className="dock" aria-label="Controls">
        <button
          className="icon-btn"
          onClick={() => set('showPreview', !showCam)}
          aria-label={showCam ? 'Hide camera preview' : 'Show camera preview'}
          aria-pressed={showCam}
          title={showCam ? 'Hide camera' : 'Show camera'}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M23 7l-7 5 7 5V7z" />
            <rect x="1" y="5" width="15" height="14" rx="2" />
            {!showCam && <path d="M2 2l20 20" />}
          </svg>
        </button>
        <button
          ref={addRef}
          className="icon-btn"
          onClick={() => setWin('add')}
          aria-label="Add face"
          title="Add face"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="10" cy="8" r="4" />
            <path d="M2 21a8 8 0 0 1 12.5-6.6M19 14v6M16 17h6" />
          </svg>
        </button>
        <button
          ref={manageRef}
          className="icon-btn"
          onClick={() => setWin('manage')}
          aria-label="Faces and voices"
          title="Faces and voices"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="9" cy="8" r="3.5" />
            <path d="M2 20a7 7 0 0 1 14 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a7 7 0 0 1 4 6" />
          </svg>
        </button>
        <button
          className={`icon-btn mic${live.state === 'live' ? ' on' : live.state === 'connecting' ? ' wait' : live.state === 'error' ? ' bad' : ''}`}
          onClick={live.toggle}
          aria-label={live.state === 'off' || live.state === 'error' ? 'Start voice chat' : 'End voice chat'}
          aria-pressed={live.state === 'live' || live.state === 'connecting'}
          title={live.state === 'live' ? 'End voice chat' : 'Talk to Greeny'}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v4" />
          </svg>
        </button>
        <button
          ref={gearRef}
          className="icon-btn"
          onClick={() => setPanelOpen((v) => !v)}
          aria-label="Settings"
          aria-expanded={panelOpen}
          title="Settings"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </nav>
    </div>
  )
}
