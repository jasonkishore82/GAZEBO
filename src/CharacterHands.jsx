import { useEffect, useRef } from 'react'
import * as THREE from 'three'

// The character's hands, as real 3D meshes (three.js) that copy the user's
// MediaPipe hand landmarks. Each finger is a chain of rounded capsules, the
// palm is a padded ellipsoid, and the landmark depth (z) tilts and pushes the
// hand toward or away from the screen. A back-face shell gives the cartoon
// outline. Rendered on a transparent full-screen canvas in its own loop,
// reading landmarks from a ref.

const CHAINS = [
  [1, 2, 3, 4], // thumb
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
]
const PALM_BONES = [[0, 1], [0, 5], [0, 17], [5, 9], [9, 13], [13, 17]]
const PALM_POINTS = [0, 5, 9, 13, 17]
const SLOTS = 2
const FOV = 40
const UP = new THREE.Vector3(0, 1, 0)

// One shape drawn twice: the body, and a slightly larger back-face copy that
// shows only as an outline around it.
class Part {
  constructor(geometry, bodyMat, lineMat, parent) {
    this.body = new THREE.Mesh(geometry, bodyMat)
    this.line = new THREE.Mesh(geometry, lineMat)
    parent.add(this.body, this.line)
  }

  place(position, quaternion, sx, sy, sz, edge) {
    for (const [m, e] of [[this.body, 0], [this.line, edge]]) {
      m.position.copy(position)
      m.quaternion.copy(quaternion)
      m.scale.set(sx + e, sy + e, sz + e)
      m.visible = true
    }
  }

  hide() {
    this.body.visible = false
    this.line.visible = false
  }
}

const tmp = {
  a: new THREE.Vector3(),
  dir: new THREE.Vector3(),
  mid: new THREE.Vector3(),
  q: new THREE.Quaternion(),
  m: new THREE.Matrix4(),
  x: new THREE.Vector3(),
  y: new THREE.Vector3(),
  z: new THREE.Vector3(),
}

class HandRig {
  constructor(scene, sphere, cylinder) {
    this.group = new THREE.Group()
    this.group.visible = false
    scene.add(this.group)
    this.body = new THREE.MeshStandardMaterial({ roughness: 0.48, metalness: 0 })
    this.line = new THREE.MeshBasicMaterial({ side: THREE.BackSide })
    const mk = (geo) => new Part(geo, this.body, this.line, this.group)
    this.joints = Array.from({ length: 21 }, () => mk(sphere))
    this.bones = Array.from({ length: 15 + PALM_BONES.length }, () => mk(cylinder))
    this.palm = mk(sphere)
  }

  setColor(hex) {
    this.body.color.set(hex)
    this.line.color.set(hex).multiplyScalar(0.28)
  }

  setAlpha(a) {
    for (const m of [this.body, this.line]) {
      m.transparent = a < 0.99
      m.opacity = a
    }
  }

  bone(part, pa, pb, r, edge) {
    tmp.dir.subVectors(pb, pa)
    const len = tmp.dir.length() || 0.001
    tmp.mid.addVectors(pa, pb).multiplyScalar(0.5)
    tmp.q.setFromUnitVectors(UP, tmp.dir.normalize())
    part.place(tmp.mid, tmp.q, r, len, r, edge)
  }

  // pts: 21 world-space Vector3
  update(pts) {
    // 3D distances, so a tilted or foreshortened palm keeps its true size
    const palmW = pts[5].distanceTo(pts[17])
    const fw = Math.min(64, Math.max(12, palmW * 0.36)) // finger width
    const edge = Math.max(2.5, fw * 0.1)
    const ident = tmp.q.identity()

    // joints: rounded, tapering toward the fingertips
    const radius = new Array(21).fill(fw * 0.45)
    CHAINS.forEach((chain, c) =>
      chain.forEach((idx, j) => {
        radius[idx] = (fw / 2) * (1 - 0.1 * j) * (c === 0 ? 1.08 : 1)
      })
    )
    this.joints.forEach((part, i) => {
      const r = radius[i]
      part.place(pts[i], ident, r, r, r, edge)
    })

    // fingers
    let n = 0
    CHAINS.forEach((chain) => {
      for (let j = 0; j < 3; j++) {
        const r = (radius[chain[j]] + radius[chain[j + 1]]) / 2
        this.bone(this.bones[n++], pts[chain[j]], pts[chain[j + 1]], r, edge)
      }
    })
    // palm bones fill in between the knuckles
    PALM_BONES.forEach(([a, b]) => this.bone(this.bones[n++], pts[a], pts[b], fw * 0.42, edge))

    // padded palm: an ellipsoid on the palm plane (wrist, index and pinky bases)
    tmp.x.subVectors(pts[17], pts[5]).normalize()
    tmp.y.subVectors(pts[9], pts[0]).normalize()
    tmp.z.crossVectors(tmp.x, tmp.y).normalize()
    tmp.y.crossVectors(tmp.z, tmp.x).normalize()
    tmp.q.setFromRotationMatrix(tmp.m.makeBasis(tmp.x, tmp.y, tmp.z))
    tmp.a.set(0, 0, 0)
    PALM_POINTS.forEach((i) => tmp.a.add(pts[i]))
    tmp.a.multiplyScalar(1 / PALM_POINTS.length)
    const palmLen = pts[9].distanceTo(pts[0])
    // sized to just cover the knuckle quad and thick enough to read as a pad
    this.palm.place(tmp.a, tmp.q, palmW * 0.5 + fw * 0.3, palmLen * 0.4 + fw * 0.25, fw * 0.62, edge)
  }

  dispose() {
    this.body.dispose()
    this.line.dispose()
  }
}

// Screen position of a normalized, mirrored video point; the video covers the
// screen (like object-fit: cover) so hands keep their proportions.
function toWorld(p, vw, vh, aspect, out) {
  const dh = Math.max(vh, vw / aspect)
  const dw = dh * aspect
  // landmark z shares x's scale; negative is toward the camera
  return out.set((0.5 - p.x) * dw, -(p.y - 0.5) * dh, -p.z * dw)
}

export default function CharacterHands({ marks, videoRef, color }) {
  const canvasRef = useRef(null)
  const colorRef = useRef(color)
  colorRef.current = color

  useEffect(() => {
    const canvas = canvasRef.current
    let renderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
    } catch (e) {
      console.warn('WebGL unavailable, character hands disabled:', e)
      return
    }
    renderer.setClearColor(0x000000, 0)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(FOV, 1, 10, 20000)

    // soft sky/ground fill, a key light from the upper left and a rim light
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9bbf7a, 2.1))
    const key = new THREE.DirectionalLight(0xffffff, 1.9)
    key.position.set(-0.6, 0.9, 1)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0xdfffd0, 1.1)
    rim.position.set(0.7, 0.2, -1)
    scene.add(rim)

    const sphere = new THREE.SphereGeometry(1, 28, 20)
    const cylinder = new THREE.CylinderGeometry(1, 1, 1, 24, 1, false)
    const rigs = Array.from({ length: SLOTS }, () => new HandRig(scene, sphere, cylinder))
    // smoothed world points and fade, per hand slot
    const slots = rigs.map(() => ({
      pts: Array.from({ length: 21 }, () => new THREE.Vector3()),
      has: false,
      a: 0,
    }))
    const next = new THREE.Vector3()

    let last = performance.now()
    let raf
    let size = ''

    const frame = (now) => {
      const dt = now - last
      last = now
      const vw = window.innerWidth
      const vh = window.innerHeight
      const dpr = Math.min(window.devicePixelRatio || 1, 2)

      const key2 = `${vw}x${vh}x${dpr}`
      if (key2 !== size) {
        size = key2
        renderer.setPixelRatio(dpr)
        renderer.setSize(vw, vh, false)
        camera.aspect = vw / vh
        // place the camera so the z = 0 plane maps 1:1 to screen pixels
        camera.position.z = vh / 2 / Math.tan((FOV * Math.PI) / 360)
        camera.updateProjectionMatrix()
      }

      const video = videoRef.current
      const aspect = video?.videoWidth ? video.videoWidth / video.videoHeight : 4 / 3
      const hands = marks.current.hands
      const follow = 1 - Math.exp(-dt / 50) // smooths landmark jitter
      const fade = 1 - Math.exp(-dt / 90)

      slots.forEach((slot, i) => {
        const src = hands[i]
        if (src) {
          src.forEach((p, n) => {
            toWorld(p, vw, vh, aspect, next)
            if (slot.has) slot.pts[n].lerp(next, follow)
            else slot.pts[n].copy(next)
          })
          slot.has = true
          slot.a += (1 - slot.a) * fade
        } else {
          slot.a += (0 - slot.a) * fade
          if (slot.a < 0.02) slot.has = false
        }

        const rig = rigs[i]
        rig.group.visible = slot.has && slot.a > 0.02
        if (rig.group.visible) {
          rig.setColor(colorRef.current)
          rig.setAlpha(slot.a)
          rig.update(slot.pts)
        }
      })

      renderer.render(scene, camera)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      rigs.forEach((r) => r.dispose())
      sphere.dispose()
      cylinder.dispose()
      renderer.dispose()
    }
  }, [marks, videoRef])

  return <canvas ref={canvasRef} className="hands" aria-hidden="true" />
}
