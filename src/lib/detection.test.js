import { describe, expect, it } from 'vitest'
import {
  INPUT,
  NUM_ANCHORS,
  COCO_NAMES,
  decodeYolo,
  decodeYuNet,
  iou,
  lidClosure,
  nms,
  sceneScale,
} from './detection.js'

const box = (x, y, w, h, extra = {}) => ({ x, y, w, h, score: 0.9, cls: 0, ...extra })

describe('iou', () => {
  it('is 1 for identical boxes and 0 for disjoint ones', () => {
    expect(iou(box(0, 0, 10, 10), box(0, 0, 10, 10))).toBe(1)
    expect(iou(box(0, 0, 10, 10), box(20, 20, 5, 5))).toBe(0)
  })

  it('computes partial overlap', () => {
    // 5x10 overlap over a union of 150
    expect(iou(box(0, 0, 10, 10), box(5, 0, 10, 10))).toBeCloseTo(50 / 150)
  })
})

describe('nms', () => {
  it('drops overlapping boxes of the same class, keeping the best', () => {
    const kept = nms([
      box(0, 0, 10, 10, { score: 0.6 }),
      box(1, 1, 10, 10, { score: 0.9 }),
    ])
    expect(kept).toHaveLength(1)
    expect(kept[0].score).toBe(0.9)
  })

  it('keeps overlapping boxes of different classes', () => {
    expect(nms([box(0, 0, 10, 10), box(0, 0, 10, 10, { cls: 56 })])).toHaveLength(2)
  })

  it('caps the number of results', () => {
    const many = Array.from({ length: 30 }, (_, i) => box(i * 100, 0, 10, 10))
    expect(nms(many)).toHaveLength(20)
  })
})

describe('decodeYolo', () => {
  const lb = { scale: 1, dx: 0, dy: 0 }

  function output(anchors) {
    const o = new Float32Array((4 + COCO_NAMES.length) * NUM_ANCHORS)
    for (const [a, cls, score, cx, cy, w, h] of anchors) {
      o[a] = cx
      o[NUM_ANCHORS + a] = cy
      o[2 * NUM_ANCHORS + a] = w
      o[3 * NUM_ANCHORS + a] = h
      o[(4 + cls) * NUM_ANCHORS + a] = score
    }
    return o
  }

  it('returns labelled boxes above the threshold in frame pixels', () => {
    const o = output([[5, 41, 0.8, 100, 200, 40, 60]])
    const [d] = decodeYolo(o, { objectConf: 0.4, onlyPeople: false }, lb)
    expect(d.label).toBe('cup')
    expect(d).toMatchObject({ x: 80, y: 170, w: 40, h: 60 })
  })

  it('undoes the letterbox offset and scale', () => {
    const o = output([[0, 0, 0.9, 340, 320, 100, 200]])
    const [d] = decodeYolo(o, { objectConf: 0.4, onlyPeople: false }, { scale: 2, dx: 40, dy: 0 })
    expect(d).toMatchObject({ x: 125, y: 110, w: 50, h: 100 })
  })

  it('applies the confidence threshold and the people-only filter', () => {
    const o = output([
      [1, 0, 0.3, 50, 50, 10, 10],
      [2, 41, 0.9, 300, 300, 10, 10],
    ])
    expect(decodeYolo(o, { objectConf: 0.4, onlyPeople: false }, lb).map((d) => d.label)).toEqual(['cup'])
    expect(decodeYolo(o, { objectConf: 0.4, onlyPeople: true }, lb)).toEqual([])
  })
})

describe('decodeYuNet', () => {
  function emptyOut() {
    const out = {}
    for (const [stride, n] of [[8, 6400], [16, 1600], [32, 400]]) {
      out[`cls_${stride}`] = { data: new Float32Array(n) }
      out[`obj_${stride}`] = { data: new Float32Array(n) }
      out[`bbox_${stride}`] = { data: new Float32Array(n * 4) }
    }
    return out
  }

  it('finds nothing when every score is zero', () => {
    expect(decodeYuNet(emptyOut(), 0.5)).toBeNull()
  })

  it('decodes a face at a grid cell', () => {
    const out = emptyOut()
    const cols = INPUT / 8
    const i = 10 * cols + 20 // row 10, col 20 at stride 8
    out.cls_8.data[i] = 1
    out.obj_8.data[i] = 0.81
    out.bbox_8.data.set([0.5, 0.5, Math.log(4), Math.log(4)], i * 4)
    const f = decodeYuNet(out, 0.5)
    expect(f.score).toBeCloseTo(0.9)
    // centre (20.5*8, 10.5*8), size 32
    expect(f.x).toBeCloseTo(164 - 16)
    expect(f.y).toBeCloseTo(84 - 16)
    expect(f.w).toBeCloseTo(32)
  })

  it('respects the minimum score', () => {
    const out = emptyOut()
    out.cls_8.data[0] = 0.25
    out.obj_8.data[0] = 0.25
    expect(decodeYuNet(out, 0.5)).toBeNull()
  })
})

describe('lidClosure', () => {
  it('is open at 0 and shut at 1', () => {
    expect(lidClosure(0, 0.6)).toBe(0)
    expect(lidClosure(1, 0.6)).toBe(1)
  })

  it('closes earlier at higher sensitivity', () => {
    expect(lidClosure(0.3, 1)).toBeGreaterThan(lidClosure(0.3, 0))
  })
})

describe('sceneScale', () => {
  it('fits the viewport within bounds', () => {
    expect(sceneScale(1180, 760)).toBe(1)
    expect(sceneScale(100, 100)).toBe(0.35)
    expect(sceneScale(5000, 5000)).toBe(1.15)
  })
})
