import { useCallback, useEffect, useState } from 'react'

async function api(path, options) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`)
  return body
}

// Saved faces, backed by the /api/faces routes (SQLite on the server).
export function useFaces() {
  const [faces, setFaces] = useState([])
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      setFaces(await api('/api/faces'))
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const add = useCallback(async ({ name, embedding, thumbnail }) => {
    const face = await api('/api/faces', { method: 'POST', body: JSON.stringify({ name, embedding, thumbnail }) })
    setFaces((f) => [...f, face])
    return face
  }, [])

  const rename = useCallback(async (id, name) => {
    const face = await api(`/api/faces/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) })
    setFaces((f) => f.map((x) => (x.id === id ? face : x)))
  }, [])

  const remove = useCallback(async (id) => {
    await api(`/api/faces/${id}`, { method: 'DELETE' })
    setFaces((f) => f.filter((x) => x.id !== id))
  }, [])

  return { faces, error, refresh, add, rename, remove }
}
