import { useEffect, useRef } from 'react'
import { VOICES } from './lib/voices.js'

function Toggle({ label, hint, checked, onChange }) {
  return (
    <label className="radio row" title={hint}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <i />
      {label}
    </label>
  )
}

function Slider({ label, value, min, max, step, onChange, format }) {
  return (
    <label className="row slider">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <output>{format ? format(value) : value}</output>
    </label>
  )
}

function Select({ label, value, onChange, children }) {
  return (
    <label className="row select">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </label>
  )
}

function Color({ label, value, onChange }) {
  return (
    <label className="row color">
      <span>{label}</span>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

export default function SettingsPanel({ settings, set, reset, onClose, anchorRef }) {
  const panelRef = useRef(null)
  // the app re-renders constantly; keep the latest onClose in a ref so the
  // effect below runs once and never steals focus from a control
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  // Move focus in on open, give it back to the gear on close, and close on
  // Escape or a click outside.
  useEffect(() => {
    const anchor = anchorRef?.current
    panelRef.current?.focus()
    const onKey = (e) => e.key === 'Escape' && closeRef.current()
    const onDown = (e) => {
      if (!panelRef.current?.contains(e.target) && !anchor?.contains(e.target)) closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
      anchor?.focus()
    }
  }, [anchorRef])

  const pct = (v) => `${Math.round(v * 100)}%`

  return (
    <div className="panel" role="dialog" aria-label="Settings" tabIndex={-1} ref={panelRef}>
      <header>
        <h2>Settings</h2>
        <button className="close" onClick={onClose} aria-label="Close settings">
          &times;
        </button>
      </header>

      <section>
        <h3>Tracking</h3>
        <Toggle
          label="YOLO (objects &amp; people)"
          hint="Detect people and objects"
          checked={settings.yolo}
          onChange={(v) => set('yolo', v)}
        />
        <Toggle
          label="YuNet (face lock)"
          hint="Lock onto faces"
          checked={settings.yunet}
          onChange={(v) => set('yunet', v)}
        />
        <Toggle
          label="Hand tracking (MediaPipe)"
          hint="Track your hands; the eyes follow a hand when nothing else is found"
          checked={settings.hands}
          onChange={(v) => set('hands', v)}
        />
        <Toggle
          label="GPU acceleration (reload)"
          hint="Run the detection models on the graphics card via WebGPU. Reload the page after changing."
          checked={settings.gpu}
          onChange={(v) => set('gpu', v)}
        />
        <Toggle
          label="Face recognition (SFace)"
          hint="Recognise saved faces so the voice chat can say your name"
          checked={settings.recognize}
          onChange={(v) => set('recognize', v)}
        />
        <Toggle
          label="Blink sync (MediaPipe)"
          hint="Copy your blinks and winks"
          checked={settings.blink}
          onChange={(v) => set('blink', v)}
        />
      </section>

      <section>
        <h3>Detection</h3>
        <Slider
          label="Object sensitivity"
          value={settings.objectConf}
          min={0.15}
          max={0.9}
          step={0.05}
          // lower confidence threshold = more sensitive
          format={(v) => `≥ ${pct(v)}`}
          onChange={(v) => set('objectConf', v)}
        />
        <Slider
          label="Face sensitivity"
          value={settings.faceConf}
          min={0.3}
          max={0.95}
          step={0.05}
          format={(v) => `≥ ${pct(v)}`}
          onChange={(v) => set('faceConf', v)}
        />
        <Slider
          label="Blink sensitivity"
          value={settings.blinkSens}
          min={0}
          max={1}
          step={0.05}
          format={pct}
          onChange={(v) => set('blinkSens', v)}
        />
        <Toggle
          label="People only"
          hint="Ignore objects, track only people"
          checked={settings.onlyPeople}
          onChange={(v) => set('onlyPeople', v)}
        />
      </section>

      <section>
        <h3>Look</h3>
        <Select label="Character voice" value={settings.voice} onChange={(v) => set('voice', v)}>
          <option value="">Default</option>
          {VOICES.map((v) => (
            <option key={v.name} value={v.name}>
              {v.name} · {v.style}
            </option>
          ))}
        </Select>
        <Color label="Eye colour" value={settings.eyeColor} onChange={(v) => set('eyeColor', v)} />
        <Color label="Face colour" value={settings.faceColor} onChange={(v) => set('faceColor', v)} />
        <Slider
          label="Eye contact"
          value={settings.eyeContact}
          min={0}
          max={1}
          step={0.05}
          format={pct}
          onChange={(v) => set('eyeContact', v)}
        />
        <Slider
          label="Expression strength"
          value={settings.expression}
          min={0}
          max={1.5}
          step={0.1}
          format={pct}
          onChange={(v) => set('expression', v)}
        />
      </section>

      <section>
        <h3>Display</h3>
        <Toggle
          label="Camera preview"
          checked={settings.showPreview}
          onChange={(v) => set('showPreview', v)}
        />
        <Toggle
          label="3D character"
          hint="A body with a neck, and a head that turns toward what it watches"
          checked={settings.character3d}
          onChange={(v) => set('character3d', v)}
        />
        <Toggle
          label="Character hands"
          hint="Give the character hands that copy yours (needs hand tracking)"
          checked={settings.charHands}
          onChange={(v) => set('charHands', v)}
        />
        <Toggle
          label="Landmarks (face &amp; hands)"
          hint="Draw your face mesh and hand skeleton on the preview"
          checked={settings.showLandmarks}
          onChange={(v) => set('showLandmarks', v)}
        />
        <Toggle
          label="Detection boxes"
          checked={settings.showBoxes}
          onChange={(v) => set('showBoxes', v)}
        />
      </section>

      <button className="reset" onClick={reset}>
        Reset to defaults
      </button>
    </div>
  )
}
