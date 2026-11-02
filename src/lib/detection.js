// Pure detection helpers: model constants, input packing, output decoding and
// small geometry utilities. Nothing here touches the DOM, so it is unit-tested.

export const INPUT = 640
export const NUM_ANCHORS = 8400
export const PERSON_CLASS = 0
export const NMS_IOU = 0.5
export const MAX_OBJECTS = 20
const STRIDES = [8, 16, 32]

export const COCO_NAMES = [
  'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat',
  'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat', 'dog',
  'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'backpack', 'umbrella',
  'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball', 'kite',
  'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket', 'bottle',
  'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple', 'sandwich', 'orange',
  'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair', 'couch', 'potted plant',
  'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse', 'remote', 'keyboard', 'cell phone',
  'microwave', 'oven', 'toaster', 'sink', 'refrigerator', 'book', 'clock', 'vase', 'scissors',
  'teddy bear', 'hair drier', 'toothbrush',
]

// YOLO wants RGB planes in 0..1.
export function toYoloInput(rgba) {
  const planes = INPUT * INPUT
  const input = new Float32Array(3 * planes)
  for (let i = 0; i < planes; i++) {
    input[i] = rgba[i * 4] / 255
    input[planes + i] = rgba[i * 4 + 1] / 255
    input[2 * planes + i] = rgba[i * 4 + 2] / 255
  }
  return input
}

// YuNet wants BGR planes in 0..255.
export function toYuNetInput(rgba) {
  const planes = INPUT * INPUT
  const input = new Float32Array(3 * planes)
  for (let i = 0; i < planes; i++) {
    input[i] = rgba[i * 4 + 2]
    input[planes + i] = rgba[i * 4 + 1]
    input[2 * planes + i] = rgba[i * 4]
  }
  return input
}

export function iou(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  if (w <= 0 || h <= 0) return 0
  const inter = w * h
  return inter / (a.w * a.h + b.w * b.h - inter)
}

// Per-class non-max suppression; returns detections sorted by score.
export function nms(dets, iouLimit = NMS_IOU, max = MAX_OBJECTS) {
  const sorted = [...dets].sort((a, b) => b.score - a.score)
  const kept = []
  for (const d of sorted) {
    if (kept.every((k) => k.cls !== d.cls || iou(k, d) < iouLimit)) kept.push(d)
  }
  return kept.slice(0, max)
}

// Decodes YOLOv8 output [84, 8400] (cx, cy, w, h, then 80 class scores) into
// boxes in source-frame pixels. `lb` is the letterbox placement used for the
// input ({ scale, dx, dy }).
export function decodeYolo(o, { objectConf, onlyPeople }, lb) {
  const cands = []
  for (let a = 0; a < NUM_ANCHORS; a++) {
    let cls = 0
    let score = 0
    for (let c = 0; c < COCO_NAMES.length; c++) {
      const s = o[(4 + c) * NUM_ANCHORS + a]
      if (s > score) {
        score = s
        cls = c
      }
    }
    if (score < objectConf) continue
    if (onlyPeople && cls !== PERSON_CLASS) continue
    const w = o[2 * NUM_ANCHORS + a] / lb.scale
    const h = o[3 * NUM_ANCHORS + a] / lb.scale
    const cx = (o[a] - lb.dx) / lb.scale
    const cy = (o[NUM_ANCHORS + a] - lb.dy) / lb.scale
    cands.push({ x: cx - w / 2, y: cy - h / 2, w, h, score, cls, label: COCO_NAMES[cls] })
  }
  return nms(cands)
}

// Decodes YuNet's three stride maps; returns the best face as
// { x, y, w, h, score } in the 640x640 letterboxed space, or null.
export function decodeYuNet(out, minScore) {
  let best = null
  for (const stride of STRIDES) {
    const cols = INPUT / stride
    const cls = out[`cls_${stride}`].data
    const obj = out[`obj_${stride}`].data
    const bbox = out[`bbox_${stride}`].data
    const kps = out[`kps_${stride}`]?.data
    for (let i = 0; i < cls.length; i++) {
      const c = Math.min(Math.max(cls[i], 0), 1)
      const o = Math.min(Math.max(obj[i], 0), 1)
      const score = Math.sqrt(c * o)
      if (score < minScore || (best && score <= best.score)) continue
      const col = i % cols
      const row = Math.floor(i / cols)
      const cx = (col + bbox[i * 4]) * stride
      const cy = (row + bbox[i * 4 + 1]) * stride
      const w = Math.exp(bbox[i * 4 + 2]) * stride
      const h = Math.exp(bbox[i * 4 + 3]) * stride
      best = { x: cx - w / 2, y: cy - h / 2, w, h, score }
      if (kps) {
        // five landmarks: right eye, left eye, nose, right and left mouth corner
        best.kps = Array.from({ length: 5 }, (_, n) => [
          (col + kps[i * 10 + n * 2]) * stride,
          (row + kps[i * 10 + n * 2 + 1]) * stride,
        ])
      }
    }
  }
  return best
}

// Maps a raw blink score (0..1) to how shut the lid should be. Higher
// sensitivity starts closing the lid earlier.
export function lidClosure(score, sensitivity) {
  const lo = 0.4 - 0.4 * sensitivity
  return Math.min(1, Math.max(0, (score - lo) / 0.55))
}

// Scale factor that fits the fixed-size character into the viewport.
export function sceneScale(width, height) {
  return Math.min(1.15, Math.max(0.35, Math.min(width / 1180, height / 760)))
}
