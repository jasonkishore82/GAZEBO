import { useEffect, useRef, useState } from 'react'
import Eye from './Eye.jsx'
import Mouth from './Mouth.jsx'
import { useLive } from './useLive.js'
import { useFaces } from './useFaces.js'
import { useVoices } from './useVoices.js'
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

function useSceneScale() {
  const [scale, setScale] = useState(() => sceneScale(window.innerWidth, window.innerHeight))
  useEffect(() => {
    const on = () => setScale(sceneScale(window.innerWidth, window.innerHeight))
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return scale
}

const BLOCKED = new Set(['denied', 'nocamera', 'error'])

function statusText(status, target, fps, who) {
  if (status.state !== 'tracking') return status.message
  if (!target) return 'Tracking · nothing detected'
  const what = target.face ? (who ? `face locked · ${who}` : 'face locked') : `${target.objects[0]?.label ?? 'object'} found`
  return `Tracking · ${what}${fps ? ` · ${fps} fps` : ''}`
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
  const scale = useSceneScale()
  const facesApi = useFaces()
  const { videoRef, target, status, fps, retry, identity, captureFace } = usePersonTracker(settings, facesApi.faces)
  const who = identity ? facesApi.faces.find((f) => f.id === identity.id)?.name ?? '' : ''
  const voices = useVoices()
  const voiceId = useSpeaker()
  const live = useLive({ face: who, speaker: voiceId.speaker, onPcm: voiceId.feed, voice: settings.voice })
  const liveOn = live.state === 'live'
  const { reset: resetSpeaker } = voiceId
  useEffect(() => {
    if (!liveOn) resetSpeaker()
  }, [liveOn, resetSpeaker])
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

  // Eye mood: startled when something appears, happy on a face, curious on
  // other detections, sleepy when nothing has been seen for a while.
  const [startled, setStartled] = useState(false)
  const [lost, setLost] = useState(false)
  const hadTarget = useRef(false)
  const seen = !!target
  useEffect(() => {
    if (seen && !hadTarget.current) {
      setStartled(true)
      const t = setTimeout(() => setStartled(false), 700)
      hadTarget.current = true
      setLost(false)
      return () => clearTimeout(t)
    }
    if (!seen) {
      hadTarget.current = false
      const t = setTimeout(() => setLost(true), 5000)
      return () => clearTimeout(t)
    }
  }, [seen])

  let mood = 'idle'
  if (startled) mood = 'surprised'
  else if (target?.face) mood = 'happy'
  else if (target || hand) mood = 'curious'
  else if (lost && status.state === 'tracking' && (settings.yolo || settings.yunet)) mood = 'sleepy'

  // Webcam is mirrored: a person on the camera's right is on the viewer's left.
  // With nothing else in view, watch the user's hand.
  const aim = target || hand
  const look = aim
    ? { x: (1 - aim.x) * window.innerWidth, y: aim.y * window.innerHeight }
    : mouse

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
      className="app"
      style={{ '--face': settings.faceColor, '--iris': settings.eyeColor, '--s': scale }}
    >
      <div className="dome" />
      <div className="eyes">
        <Eye
          look={look}
          mood={mood}
          side={-1}
          expression={settings.expression}
          sync={settings.blink && blink ? lidClosure(blink.left, settings.blinkSens) : null}
        />
        <Eye
          look={look}
          mood={mood}
          side={1}
          expression={settings.expression}
          sync={settings.blink && blink ? lidClosure(blink.right, settings.blinkSens) : null}
        />
      </div>

      <Mouth look={look} mood={live.speaking ? 'talking' : mood} levelRef={live.levelRef} />

      {live.caption && <p className="caption">{live.caption}</p>}

      {settings.hands && settings.charHands && (
        <CharacterHands marks={marks} videoRef={videoRef} color={settings.faceColor} />
      )}

      <div className="pill" role="status" aria-live="polite">
        <span className={`dot ${dot}`} aria-hidden="true" />
        {statusText(status, target, fps, who)}
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
          className={`icon-btn mic${live.state === 'live' ? ' on' : ''}`}
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
