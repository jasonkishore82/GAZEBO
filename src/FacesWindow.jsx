import { useEffect, useRef, useState } from 'react'
import { openMic } from './lib/mic.js'
import { pcmToBase64 } from './lib/speaker.js'

// A modal window: focus goes in on open, Esc or a click outside closes it, and
// focus returns to the button that opened it.
function Modal({ title, onClose, anchorRef, children }) {
  const ref = useRef(null)
  // the app re-renders constantly (camera updates), so keep the latest onClose
  // in a ref and set up focus and Esc exactly once
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const anchor = anchorRef?.current
    // focus the dialog only if nothing inside (like the name field) already has it
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus()
    const onKey = (e) => e.key === 'Escape' && closeRef.current()
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      // give focus back to the opener, unless another window just took it
      if (!document.activeElement?.closest?.('.modal')) anchor?.focus()
    }
  }, [anchorRef])

  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <header>
          <h2>{title}</h2>
          <button className="close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        {children}
      </div>
    </div>
  )
}

// Add a face: shows the camera, takes a few samples when you press Save, and
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
    <Modal title="Add face" onClose={onClose} anchorRef={anchorRef}>
      <form onSubmit={save}>
        <div className={`cam${hasFace ? ' has-face' : ''}`}>
          <video ref={camRef} muted playsInline autoPlay aria-label="Camera" />
          <span className="cam-status">{hasFace ? 'Face found' : 'Looking for a face…'}</span>
        </div>
        <label className="field">
          <span>Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What should Greeny call you?"
            maxLength={120}
            autoFocus
            autoComplete="off"
          />
        </label>
        <p className="hint">Look straight at the camera, then press Save. It takes a moment and uses a few snapshots.</p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!name.trim() || busy}>
            {busy ? 'Saving…' : 'Save face'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function FaceRow({ face, onRename, onRemove, onError, recognised, kind = 'face' }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(face.name)
  const [confirm, setConfirm] = useState(false)

  const commit = async () => {
    const clean = name.trim()
    setEditing(false)
    if (!clean || clean === face.name) return setName(face.name)
    try {
      await onRename(face.id, clean)
    } catch (e) {
      setName(face.name)
      onError(e.message)
    }
  }

  return (
    <li className="face-row">
      {face.thumbnail ? (
        <img src={face.thumbnail} alt="" />
      ) : (
        <span className="no-thumb" aria-hidden="true">
          {kind === 'voice' ? '\u{1F399}' : ''}
        </span>
      )}
      <div className="face-info">
        {editing ? (
          <input
            className="face-edit"
            value={name}
            autoFocus
            maxLength={120}
            aria-label={`Name for ${face.name}`}
            onChange={(e) => setName(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                setName(face.name)
                setEditing(false)
              }
            }}
          />
        ) : (
          <strong>
            {face.name}
            {recognised && <em className="seen">in view</em>}
          </strong>
        )}
        <small>
          {kind === 'voice' && face.seconds ? `${Math.round(face.seconds)} s recording \u00b7 ` : ''}Added{' '}
          {new Date(face.createdAt).toLocaleDateString()}
        </small>
      </div>
      {confirm ? (
        <div className="row-actions">
          <button
            className="btn danger"
            onClick={() => onRemove(face.id).catch((e) => onError(e.message))}
            aria-label={`Confirm delete ${face.name}`}
          >
            Delete
          </button>
          <button className="btn" onClick={() => setConfirm(false)}>
            Keep
          </button>
        </div>
      ) : (
        <div className="row-actions">
          <button className="btn" onClick={() => setEditing(true)} aria-label={`Rename ${face.name}`}>
            Rename
          </button>
          <button className="btn" onClick={() => setConfirm(true)} aria-label={`Delete ${face.name}`}>
            Delete
          </button>
        </div>
      )}
    </li>
  )
}

// Manage faces and voices: see, rename and delete what is saved.
export function ManageFacesWindow({ faces, error, rename, remove, voices, onAdd, onRecord, onClose, anchorRef, recognisedId, speakerName }) {
  const [actionError, setActionError] = useState('')
  return (
    <Modal title="Faces & voices" onClose={onClose} anchorRef={anchorRef}>
      {(error || voices.error || actionError) && (
        <p className="form-error" role="alert">
          {actionError || error || voices.error}
        </p>
      )}
      <h3 className="section">Faces</h3>
      {faces.length === 0 ? (
        <div className="empty">
          <p>No faces saved yet. Add yours so Greeny knows who you are when you talk.</p>
        </div>
      ) : (
        <ul className="face-list">
          {faces.map((f) => (
            <FaceRow key={f.id} face={f} onRename={rename} onRemove={remove} onError={setActionError} recognised={f.id === recognisedId} />
          ))}
        </ul>
      )}
      <div className="actions">
        <button className="btn primary" onClick={onAdd}>
          Add face
        </button>
      </div>

      <h3 className="section">Voices</h3>
      {voices.voices.length === 0 ? (
        <div className="empty">
          <p>No voices recorded yet. Record each person once so Greeny can tell who is speaking.</p>
        </div>
      ) : (
        <ul className="face-list">
          {voices.voices.map((v) => (
            <FaceRow
              key={v.id}
              kind="voice"
              face={v}
              onRename={voices.rename}
              onRemove={voices.remove}
              onError={setActionError}
              recognised={!!speakerName && v.name === speakerName}
            />
          ))}
        </ul>
      )}
      <div className="actions">
        <button className="btn primary" onClick={onRecord}>
          Record voice
        </button>
      </div>
    </Modal>
  )
}

const RECORD_SECONDS = 8
const SCRIPT = 'Hi Greeny, it is me. The weather is lovely today, and I am happy to chat with you for a while.'

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
    <Modal title="Record voice" onClose={onClose} anchorRef={anchorRef}>
      <form onSubmit={record}>
        <label className="field">
          <span>Name</span>
          <input
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
        </label>
        <p className="script">Read this aloud when recording starts:</p>
        <blockquote className="script-text">&ldquo;{SCRIPT}&rdquo;</blockquote>
        {phase !== 'idle' && (
          <div className="meter" aria-label="Recording progress">
            <div className="meter-bar" style={{ width: `${Math.min(100, (elapsed / RECORD_SECONDS) * 100)}%` }} />
            <div className="meter-level" style={{ transform: `scaleX(${level})` }} />
          </div>
        )}
        <p className="hint">
          {phase === 'recording'
            ? 'Recording\u2026 keep talking in your normal voice.'
            : phase === 'saving'
              ? 'Analysing your voice\u2026'
              : `It records for ${RECORD_SECONDS} seconds. Use the same name as the saved face so they line up.`}
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="button" className="btn" onClick={onClose} disabled={phase === 'saving'}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!name.trim() || phase !== 'idle'}>
            {phase === 'recording' ? 'Recording\u2026' : phase === 'saving' ? 'Saving\u2026' : 'Start recording'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// Shown while a save or delete is waiting for a yes: the captured photo (or a
// voice sample), the name (editable), and buttons - the same answer can be given by voice.
export function PendingCard({ pending, onName, onConfirm }) {
  const { kind, name, status } = pending
  const busy = status !== 'ready'
  const title =
    kind === 'remove'
      ? `Delete ${pending.what === 'both' ? 'face and voice' : pending.what} of ${name}?`
      : kind === 'face'
        ? 'Save this face?'
        : status === 'recording'
          ? 'Listening\u2026 keep talking'
          : 'Save this voice?'
  return (
    <div className="pending" role="dialog" aria-label={title}>
      {kind === 'face' && pending.thumbnail && <img src={pending.thumbnail} alt="Captured face" />}
      {kind === 'voice' && (
        <div className={`pending-voice${status === 'recording' ? ' rec' : ''}`} aria-hidden="true">
          {'\u{1F399}'}
        </div>
      )}
      <div className="pending-body">
        <strong>{title}</strong>
        {kind !== 'remove' ? (
          <input
            value={name}
            onChange={(e) => onName(e.target.value)}
            aria-label="Name"
            maxLength={120}
            disabled={status === 'saving'}
          />
        ) : (
          <small>
            {pending.faces ? `${pending.faces} face${pending.faces > 1 ? 's' : ''}` : ''}
            {pending.faces && pending.voices ? ' and ' : ''}
            {pending.voices ? `${pending.voices} voice${pending.voices > 1 ? 's' : ''}` : ''} will be removed.
          </small>
        )}
        {kind === 'voice' && status === 'ready' && pending.seconds && <small>{Math.round(pending.seconds)} s of speech captured</small>}
        <small className="pending-hint">{status === 'recording' ? 'Say anything for a few seconds.' : 'You can also answer out loud.'}</small>
      </div>
      <div className="pending-actions">
        <button className={`btn ${kind === 'remove' ? 'danger' : 'primary'}`} disabled={busy || !name.trim()} onClick={() => onConfirm(true)}>
          {kind === 'remove' ? 'Delete' : status === 'saving' ? 'Saving\u2026' : 'Save'}
        </button>
        <button className="btn" disabled={status === 'saving'} onClick={() => onConfirm(false)}>
          {kind === 'remove' ? 'Keep' : 'Discard'}
        </button>
      </div>
    </div>
  )
}
