import { useEffect, useId, useRef, useState } from 'react'
import { VOICES } from './lib/voices.js'
import Icon from './icons.jsx'

function Switch({ label, hint, checked, onChange }) {
  const id = useId()
  return (
    <div className="field">
      <label className="field-text" htmlFor={id}>
        <span className="field-label">{label}</span>
        {hint && <span className="field-hint">{hint}</span>}
      </label>
      <span className="switch">
        <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span />
      </span>
    </div>
  )
}

function Slider({ label, hint, value, min, max, step, onChange, format }) {
  const id = useId()
  const p = ((value - min) / (max - min)) * 100
  return (
    <div className="slider">
      <div className="slider-top">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{format ? format(value) : value}</output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--p': `${p}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  )
}

function Select({ label, value, onChange, children }) {
  const id = useId()
  return (
    <div className="field">
      <label className="field-text" htmlFor={id}>
        <span className="field-label">{label}</span>
      </label>
      <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </div>
  )
}

function Color({ label, value, onChange }) {
  const id = useId()
  return (
    <div className="field">
      <label className="field-text" htmlFor={id}>
        <span className="field-label">{label}</span>
      </label>
      <span className="swatch">
        <i style={{ background: value }} />
        {value.toUpperCase()}
        <input id={id} type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      </span>
    </div>
  )
}

const TABS = [
  { id: 'character', label: 'Character' },
  { id: 'tracking', label: 'Tracking' },
  { id: 'display', label: 'Display' },
]

const pct = (v) => `${Math.round(v * 100)}%`

export default function SettingsPanel({ settings, set, reset, onClose, anchorRef }) {
  const panelRef = useRef(null)
  const [tab, setTab] = useState('character')
  // the app re-renders constantly; keep the latest onClose in a ref so the
  // effect below runs once and never steals focus from a control
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  // Move focus in on open, give it back to the opener on close, and close on
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

  // arrow keys move between tabs
  const onTabKey = (e) => {
    const i = TABS.findIndex((t) => t.id === tab)
    const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null
    if (next === null) return
    e.preventDefault()
    const t = TABS[(next + TABS.length) % TABS.length]
    setTab(t.id)
    document.getElementById(`tab-${t.id}`)?.focus()
  }

  return (
    <div className="sheet surface" role="dialog" aria-label="Settings" tabIndex={-1} ref={panelRef}>
      <header className="sheet-head">
        <h2>Settings</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close settings">
          <Icon name="x" />
        </button>
      </header>

      <div className="tabs" role="tablist" aria-label="Settings sections" onKeyDown={onTabKey}>
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            className="tab"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="sheet-body" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'character' && (
          <>
            <Select label="Style" value={settings.avatar} onChange={(v) => set('avatar', v)}>
              <option value="studio">Studio</option>
              <option value="classic">Classic</option>
              <option value="three">3D (three.js)</option>
            </Select>
            <Select label="Voice" value={settings.voice} onChange={(v) => set('voice', v)}>
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
              hint="How much it looks straight at you instead of following your position"
              value={settings.eyeContact}
              min={0}
              max={1}
              step={0.05}
              format={pct}
              onChange={(v) => set('eyeContact', v)}
            />
            <Slider
              label="Expressiveness"
              value={settings.expression}
              min={0}
              max={1.5}
              step={0.1}
              format={pct}
              onChange={(v) => set('expression', v)}
            />
            {settings.avatar === 'classic' && (
              <Switch
                label="3D body"
                hint="A robot body, and a head that turns toward what it watches"
                checked={settings.character3d}
                onChange={(v) => set('character3d', v)}
              />
            )}
            <Switch
              label="Hands"
              hint="Hands that copy yours. Needs hand tracking."
              checked={settings.charHands}
              onChange={(v) => set('charHands', v)}
            />
          </>
        )}

        {tab === 'tracking' && (
          <>
            <Switch
              label="Camera"
              hint="Turn off to stop the camera completely. Nothing is tracked and the camera light goes out."
              checked={settings.cameraOn}
              onChange={(v) => set('cameraOn', v)}
            />
            <p className="group-title">Detection</p>
            <Switch label="Faces" hint="Lock onto a face (YuNet)" checked={settings.yunet} onChange={(v) => set('yunet', v)} />
            <Switch label="People and objects" hint="Detect with YOLO" checked={settings.yolo} onChange={(v) => set('yolo', v)} />
            <Switch label="People only" hint="Ignore objects" checked={settings.onlyPeople} onChange={(v) => set('onlyPeople', v)} />
            <Switch label="Hands" hint="Follow a hand when nothing else is found" checked={settings.hands} onChange={(v) => set('hands', v)} />
            <Switch label="Recognise faces" hint="Needed for it to say who you are" checked={settings.recognize} onChange={(v) => set('recognize', v)} />
            <Switch label="Copy blinks" hint="Mirror your blinks and winks" checked={settings.blink} onChange={(v) => set('blink', v)} />
            <Switch
              label="Use graphics card"
              hint="Faster detection through WebGPU. Reload the page after changing."
              checked={settings.gpu}
              onChange={(v) => set('gpu', v)}
            />

            <p className="group-title">Sensitivity</p>
            <Slider
              label="Objects"
              value={settings.objectConf}
              min={0.15}
              max={0.9}
              step={0.05}
              format={(v) => `≥ ${pct(v)}`}
              onChange={(v) => set('objectConf', v)}
            />
            <Slider
              label="Faces"
              value={settings.faceConf}
              min={0.3}
              max={0.95}
              step={0.05}
              format={(v) => `≥ ${pct(v)}`}
              onChange={(v) => set('faceConf', v)}
            />
            <Slider
              label="Blinks"
              value={settings.blinkSens}
              min={0}
              max={1}
              step={0.05}
              format={pct}
              onChange={(v) => set('blinkSens', v)}
            />
          </>
        )}

        {tab === 'display' && (
          <>
            <Switch label="Camera preview" checked={settings.showPreview} onChange={(v) => set('showPreview', v)} />
            <Switch label="Detection boxes" hint="Outline what it sees on the preview" checked={settings.showBoxes} onChange={(v) => set('showBoxes', v)} />
            <Switch label="Landmarks" hint="Face and hand points on the preview" checked={settings.showLandmarks} onChange={(v) => set('showLandmarks', v)} />
          </>
        )}
      </div>

      <footer className="sheet-foot">
        <button className="btn sm" onClick={reset}>
          Reset to defaults
        </button>
      </footer>
    </div>
  )
}
