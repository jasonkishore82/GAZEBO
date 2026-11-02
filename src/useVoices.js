import { useCallback, useEffect, useState } from 'react'

async function api(path, options) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`)
  return body
}

// Saved voiceprints, backed by /api/voices.
export function useVoices() {
  const [voices, setVoices] = useState([])
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      setVoices(await api('/api/voices'))
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const add = useCallback(async ({ name, audio }) => {
    const v = await api('/api/voices', { method: 'POST', body: JSON.stringify({ name, audio }) })
    setVoices((all) => [...all, v])
    return v
  }, [])

  const rename = useCallback(async (id, name) => {
    const v = await api(`/api/voices/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) })
    setVoices((all) => all.map((x) => (x.id === id ? v : x)))
  }, [])

  const remove = useCallback(async (id) => {
    await api(`/api/voices/${id}`, { method: 'DELETE' })
    setVoices((all) => all.filter((x) => x.id !== id))
  }, [])

  return { voices, error, refresh, add, rename, remove }
}
