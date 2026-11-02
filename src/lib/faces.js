// Pure helpers for face recognition: alignment, embedding maths, matching.

// Where YuNet's five landmarks (right eye, left eye, nose, right and left
// mouth corner, as seen in the image) land in the 112x112 crop SFace expects.
export const FACE_TEMPLATE = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041],
]
export const FACE_SIZE = 112

// Cosine distance threshold from OpenCV's SFace reference: same person above it.
export const MATCH_THRESHOLD = 0.363

// Best similarity transform (rotation, uniform scale, translation) taking the
// source points onto the destination points (Umeyama). Returns [a, b, tx, ty]
// meaning x' = a*x - b*y + tx, y' = b*x + a*y + ty - the arguments of
// CanvasRenderingContext2D.setTransform(a, b, -b, a, tx, ty).
export function similarityTransform(src, dst = FACE_TEMPLATE) {
  const n = src.length
  let sx = 0, sy = 0, dx = 0, dy = 0
  for (let i = 0; i < n; i++) {
    sx += src[i][0]; sy += src[i][1]
    dx += dst[i][0]; dy += dst[i][1]
  }
  sx /= n; sy /= n; dx /= n; dy /= n
  let num1 = 0, num2 = 0, den = 0
  for (let i = 0; i < n; i++) {
    const x = src[i][0] - sx, y = src[i][1] - sy
    const u = dst[i][0] - dx, v = dst[i][1] - dy
    num1 += x * u + y * v // a numerator
    num2 += x * v - y * u // b numerator
    den += x * x + y * y
  }
  const a = num1 / den
  const b = num2 / den
  return [a, b, dx - (a * sx - b * sy), dy - (b * sx + a * sy)]
}

export function normalize(v) {
  let s = 0
  for (const x of v) s += x * x
  const n = Math.sqrt(s) || 1
  return Array.from(v, (x) => x / n)
}

export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return dot / (Math.sqrt(na * nb) || 1)
}

// Mean of several unit embeddings, re-normalised.
export function averageEmbeddings(list) {
  const sum = new Array(list[0].length).fill(0)
  for (const e of list) for (let i = 0; i < sum.length; i++) sum[i] += e[i]
  return normalize(sum)
}

// Best saved face for an embedding, or null if nothing is similar enough.
// A person saved several times is judged on their best-matching record.
export function matchFace(embedding, faces, threshold = MATCH_THRESHOLD) {
  let best = null
  for (const f of faces) {
    const score = cosine(embedding, f.embedding)
    if (score >= threshold && (!best || score > best.score)) best = { id: f.id, name: f.name, score }
  }
  return best
}
