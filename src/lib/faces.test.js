import { describe, expect, it } from 'vitest'
import { FACE_TEMPLATE, averageEmbeddings, cosine, matchFace, normalize, similarityTransform } from './faces.js'

const apply = ([a, b, tx, ty], [x, y]) => [a * x - b * y + tx, b * x + a * y + ty]

describe('similarityTransform', () => {
  it('recovers a rotation, scale and shift', () => {
    const [a, b, tx, ty] = [1.3, 0.4, 20, -7]
    const src = FACE_TEMPLATE.map(([x, y]) => [a * x - b * y + tx, b * x + a * y + ty])
    const t = similarityTransform(src)
    src.forEach((p, i) => {
      const [x, y] = apply(t, p)
      expect(x).toBeCloseTo(FACE_TEMPLATE[i][0], 4)
      expect(y).toBeCloseTo(FACE_TEMPLATE[i][1], 4)
    })
  })
})

describe('embeddings', () => {
  it('normalizes to unit length', () => {
    const v = normalize([3, 4])
    expect(v[0]).toBeCloseTo(0.6)
    expect(v[1]).toBeCloseTo(0.8)
  })

  it('computes cosine similarity', () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1)
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0)
  })

  it('averages and re-normalizes', () => {
    const m = averageEmbeddings([[1, 0], [0, 1]])
    expect(m[0]).toBeCloseTo(Math.SQRT1_2)
    expect(m[1]).toBeCloseTo(Math.SQRT1_2)
  })
})

describe('matchFace', () => {
  const faces = [
    { id: 'a', name: 'Ann', embedding: [1, 0, 0] },
    { id: 'b', name: 'Bo', embedding: [0, 1, 0] },
  ]
  it('picks the closest saved face', () => {
    expect(matchFace([0.1, 0.99, 0], faces).name).toBe('Bo')
  })
  it('returns null when nobody is close enough', () => {
    expect(matchFace([0, 0, 1], faces)).toBeNull()
    expect(matchFace([1, 0, 0], [])).toBeNull()
  })
})
