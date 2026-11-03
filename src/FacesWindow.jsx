import { useEffect, useRef, useState } from 'react'
import { openMic } from './lib/mic.js'
import { pcmToBase64 } from './lib/speaker.js'
import Icon from './icons.jsx'

// A dialog: focus goes in on open, Esc or a click on the backdrop closes it, and
// focus returns to the button that opened it.
function Dialog({ title, onClose, anchorRef, children }) {
  const ref = useRef(null)
  // the app re-renders constantly (camera updates): keep the latest onClose in a
  // ref and set up focus and Esc exactly once
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const anchor = anchorRef?.current
    // focus the dialog only if nothing inside (like a name field) already has it
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus()
    const onKey = (e) => e.key === 'Escape' && closeRef.current()
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      // give focus back to the opener, unless another dialog just took it
      if (!document.activeElement?.closest?.('.dialog')) anchor?.focus()
    }
  }, [anchorRef])

  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog surface" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <header className="dialog-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </header>
        {children}
      </div>
    </div>
  )
}

// Add a face: shows the camera, takes a few snapshots when you press Save, and
// stores them under the name you typed.
export function AddFaceWindow({ videoRef, captureFace, onSave, onClose, anchorRef, hasFace }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const camRef = useRef(null)

  useEffect(() => {
    const src = videoRef.current?.srcObject
    if (camRef.current && src) camRef.current.srcObject = src
  }, [videoRef])

  const save = async (e) => {
    e.preventDefault()
    const clean = name.trim()
    if (!clean || busy) return
    setBusy(true)
    setError('')
    try {
      const { embedding, thumbnail } = await captureFace()
      await onSave({ name: clean, embedding, thumbnail })
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Dialog title="Add face" onClose={onClose} anchorRef={anchorRef}>
      <form onSubmit={save}>
        <div className="dialog-body">
          <div className={`cam${hasFace ? ' ok' : ''}`}>
            <video ref={camRef} muted playsInline autoPlay aria-label="Camera" />
            <span className="cam-status">
              <span className={`dot ${hasFace ? 'ok' : 'wait'}`} />
              {hasFace ? 'Face found' : 'Looking for a face'}
            </span>
          </div>
          <label className="label" htmlFor="face-name">
            Name
          </label>
          <input
            id="face-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What should it call you?"
            maxLength={120}
            autoFocus
            autoComplete="off"
            disabled={busy}
          />
          <p className="help">Look straight at the camera, then save. It takes a few snapshots, so hold still for a moment.</p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="dialog-foot">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!name.trim() || busy}>
            {busy ? 'Saving…' : 'Save face'}
          </button>
        </footer>
      </form>
    </Dialog>
  )
}

function PersonRow({ item, kind, recognised, onRename, onRemove, onError }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(item.name)
  const [confirm, setConfirm] = useState(false)

  const commit = async () => {
    const clean = name.trim()
    setEditing(false)
    if (!clean || clean === item.name) return setName(item.name)
    try {
      await onRename(item.id, clean)
    } catch (e) {
      setName(item.name)
      onError(e.message)
    }
  }

  const meta =
    (kind === 'voice' && item.seconds ? `${Math.round(item.seconds)} s recording · ` : '') +
    `Added ${new Date(item.createdAt).toLocaleDateString()}`

  return (
    <li className="row">
      {item.thumbnail ? (
        <img className="avatar" src={item.thumbnail} alt="" />
      ) : (
        <span className="avatar">
          <Icon name={kind === 'voice' ? 'mic' : 'users'} />
        </span>
      )}
      <div className="row-text">
        {editing ? (
          <input
            className="input"
            value={name}
            autoFocus
            maxLength={120}
            aria-label={`Name for ${item.name}`}
            onChange={(e) => setName(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                e.stopPropagation()
                setName(item.name)
                setEditing(false)
              }
            }}
          />
        ) : (
          <>
            <strong>
              <span>{item.name}</span>
              {recognised && (
                <em className="tag">
                  <span className="dot ok" />
                  {kind === 'voice' ? 'speaking' : 'in view'}
                </em>
              )}
            </strong>
            <small>{meta}</small>
          </>
        )}
      </div>
      {!editing &&
        (confirm ? (
          <div className="row-actions">
            <button className="btn sm danger" onClick={() => onRemove(item.id).catch((e) => onError(e.message))}>
              Delete
            </button>
            <button className="btn sm" onClick={() => setConfirm(false)}>
              Keep
            </button>
          </div>
        ) : (
          <div className="row-actions">
            <button className="icon-btn" onClick={() => setEditing(true)} aria-label={`Rename ${item.name}`}>
              <Icon name="pencil" size={16} />
            </button>
            <button className="icon-btn danger" onClick={() => setConfirm(true)} aria-label={`Delete ${item.name}`}>
              <Icon name="trash" size={16} />
            </button>
          </div>
        ))}
    </li>
  )
}

// Everyone saved: faces and voices on two tabs; rename and delete in place.
export function ManageFacesWindow({ faces, error, rename, remove, voices, onAdd, onRecord, onClose, anchorRef, recognisedId, speakerName }) {
  const [tab, setTab] = useState('faces')
  const [actionError, setActionError] = useState('')
  const isFaces = tab === 'faces'
  const items = isFaces ? faces : voices.voices

  const onTabKey = (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const next = isFaces ? 'voices' : 'faces'
    setTab(next)
    document.getElementById(`people-tab-${next}`)?.focus()
  }

  return (
    <Dialog title="People" onClose={onClose} anchorRef={anchorRef}>
      <div className="tabs" role="tablist" aria-label="People" onKeyDown={onTabKey}>
        {[
          ['faces', 'Faces', faces.length],
          ['voices', 'Voices', voices.voices.length],
        ].map(([id, label, count]) => (
          <button
            key={id}
            id={`people-tab-${id}`}
            className="tab"
            role="tab"
            aria-selected={tab === id}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
          >
            {label}
            <span className="count">{count}</span>
          </button>
        ))}
      </div>

      <div className="dialog-body" role="tabpanel">
        {(actionError || error || voices.error) && (
          <p className="form-error" role="alert">
            {actionError || error || voices.error}
          </p>
        )}
        {items.length === 0 ? (
          <div className="empty">
            <strong>{isFaces ? 'No faces yet' : 'No voices yet'}</strong>
            {isFaces ? 'Add yours so it knows who you are.' : 'Record each person once so it can tell who is speaking.'}
          </div>
        ) : (
          <ul className="list">
            {items.map((item) =>
              isFaces ? (
                <PersonRow
                  key={item.id}
                  item={item}
                  kind="face"
                  recognised={item.id === recognisedId}
                  onRename={rename}
                  onRemove={remove}
                  onError={setActionError}
                />
              ) : (
                <PersonRow
                  key={item.id}
                  item={item}
                  kind="voice"
                  recognised={!!speakerName && item.name === speakerName}
                  onRename={voices.rename}
                  onRemove={voices.remove}
                  onError={setActionError}
                />
              )
            )}
          </ul>
        )}
      </div>

      <footer className="dialog-foot">
        <button className="btn primary" onClick={isFaces ? onAdd : onRecord}>
          {isFaces ? 'Add face' : 'Record voice'}
        </button>
      </footer>
    </Dialog>
  )
}

const RECORD_SECONDS = 8
const SCRIPT = 'Hi, it is me. The weather is lovely today, and I am happy to chat with you for a while.'

// Record a voice: reads a short sentence for a few seconds, then stores its
// voiceprint (computed by SpeechBrain on the server) under the chosen name.
export function RecordVoiceWindow({ names, onSave, onClose, anchorRef }) {
  const [name, setName] = useState('')
  const [phase, setPhase] = useState('idle') // idle | recording | saving
  const [elapsed, setElapsed] = useState(0)
  const [level, setLevel] = useState(0)
  const [error, setError] = useState('')
  const micRef = useRef(null)

  useEffect(() => () => micRef.current?.stop(), [])

  const record = async (e) => {
    e.preventDefault()
    const clean = name.trim()
    if (!clean || phase !== 'idle') return
    setError('')
    const chunks = []
    try {
      micRef.current = await openMic((pcm) => {
        chunks.push(pcm)
        let sum = 0
        for (let i = 0; i < pcm.length; i++) sum += (pcm[i] / 32768) ** 2
        setLevel(Math.min(1, Math.sqrt(sum / pcm.length) * 8))
        setElapsed(chunks.length / 10)
      })
    } catch (err) {
      return setError(
        err.name === 'NotAllowedError' ? 'Microphone access was blocked.' : err.name === 'NotFoundError' ? 'No microphone found.' : err.message
      )
    }
    setPhase('recording')
    await new Promise((r) => setTimeout(r, RECORD_SECONDS * 1000))
    micRef.current?.stop()
    micRef.current = null
    setPhase('saving')
    try {
      const all = new Int16Array(chunks.reduce((n, c) => n + c.length, 0))
      let at = 0
      for (const c of chunks) {
        all.set(c, at)
        at += c.length
      }
      await onSave({ name: clean, audio: pcmToBase64(all) })
      onClose()
    } catch (err) {
      setError(err.message)
      setPhase('idle')
      setElapsed(0)
    }
  }

  return (
    <Dialog title="Record voice" onClose={onClose} anchorRef={anchorRef}>
      <form onSubmit={record}>
        <div className="dialog-body">
          <label className="label" htmlFor="voice-name" style={{ marginTop: 4 }}>
            Name
          </label>
          <input
            id="voice-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Whose voice is this?"
            maxLength={120}
            list="known-names"
            autoFocus
            autoComplete="off"
            disabled={phase !== 'idle'}
          />
          <datalist id="known-names">
            {names.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>

          <p className="label">Read this out when recording starts</p>
          <blockquote className="quote">{SCRIPT}</blockquote>

          {phase !== 'idle' && (
            <div className="meter" role="progressbar" aria-label="Recording progress" aria-valuemin={0} aria-valuemax={RECORD_SECONDS} aria-valuenow={Math.round(elapsed)}>
              <div className="meter-bar" style={{ width: `${Math.min(100, (elapsed / RECORD_SECONDS) * 100)}%` }} />
              <div className="meter-level" style={{ transform: `scaleX(${level})` }} />
            </div>
          )}
          <p className="help">
            {phase === 'recording'
              ? 'Recording. Keep talking in your normal voice.'
              : phase === 'saving'
                ? 'Analysing your voice…'
                : `Takes ${RECORD_SECONDS} seconds. Use the same name as the saved face so they go together.`}
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="dialog-foot">
          <button type="button" className="btn" onClick={onClose} disabled={phase === 'saving'}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!name.trim() || phase !== 'idle'}>
            {phase === 'recording' ? 'Recording…' : phase === 'saving' ? 'Saving…' : 'Start recording'}
          </button>
        </footer>
      </form>
    </Dialog>
  )
}

// Shown while a save or delete waits for a yes: the captured photo (or voice
// sample), the name (editable), and buttons. The same answer works by voice.
export function PendingCard({ pending, onName, onConfirm }) {
  const { kind, name, status } = pending
  const busy = status !== 'ready'
  const what = pending.what === 'both' ? 'face and voice' : pending.what
  const title =
    kind === 'remove'
      ? `Delete the ${what} of ${name}?`
      : kind === 'face'
        ? 'Save this face?'
        : status === 'recording'
          ? 'Listening. Keep talking.'
          : 'Save this voice?'
  const counts = [pending.faces && `${pending.faces} face${pending.faces > 1 ? 's' : ''}`, pending.voices && `${pending.voices} voice${pending.voices > 1 ? 's' : ''}`]
    .filter(Boolean)
    .join(' and ')

  return (
    <div className="pending surface" role="dialog" aria-label={title}>
      {kind === 'face' && pending.thumbnail ? (
        <img className="avatar" src={pending.thumbnail} alt="Captured face" />
      ) : (
        <span className={`avatar${kind === 'voice' && status === 'recording' ? ' rec' : ''}`}>
          <Icon name={kind === 'voice' ? 'mic' : 'trash'} size={22} />
        </span>
      )}
      <div className="pending-text">
        <strong>{title}</strong>
        {kind !== 'remove' ? (
          <input
            className="input"
            value={name}
            onChange={(e) => onName(e.target.value)}
            aria-label="Name"
            maxLength={120}
            disabled={status === 'saving'}
          />
        ) : (
          <small>{counts} will be removed.</small>
        )}
        <small>
          {kind === 'voice' && status === 'ready' && pending.seconds
            ? `${Math.round(pending.seconds)} s of speech captured. `
            : ''}
          {status === 'recording' ? 'Say anything for a few seconds.' : 'You can also answer out loud.'}
        </small>
      </div>
      <div className="pending-actions">
        <button className={`btn ${kind === 'remove' ? 'danger' : 'primary'}`} disabled={busy || !name.trim()} onClick={() => onConfirm(true)}>
          {kind === 'remove' ? 'Delete' : status === 'saving' ? 'Saving…' : 'Save'}
        </button>
        <button className="btn" disabled={status === 'saving'} onClick={() => onConfirm(false)}>
          {kind === 'remove' ? 'Keep' : 'Discard'}
        </button>
      </div>
    </div>
  )
}
