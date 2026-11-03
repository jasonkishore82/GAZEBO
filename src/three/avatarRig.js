import * as THREE from 'three'

// The three.js character as a self-contained "rig": one Object3D plus an
// update() that takes the current state. It knows nothing about the renderer,
// the camera or the page, so the same rig can sit on a screen canvas today and
// be placed in the room by a WebXR session later (see ar.js).
//
// Units are metres, origin at the feet (the floor under it), the character
// faces +z and is ~0.55 m tall, a sensible size for tabletop AR.
//
// Look: a glossy white head with a curved black glass face, a tapered body that
// floats under it with a glowing ring between, and two floating arms.

const FACE_W = 512
const FACE_H = 352
const INK = '#04060a'

//         eye w  eye h  lid  arch (happy ^ ^)  smile  open  half-width
const MOODS = {
  idle: { ew: 70, eh: 118, lid: 0, arch: 0, smile: 0.5, open: 0, mw: 30 },
  curious: { ew: 72, eh: 130, lid: 0, arch: 0, smile: 0.2, open: 0, mw: 24 },
  happy: { ew: 84, eh: 90, lid: 0, arch: 1, smile: 1, open: 0.1, mw: 40 },
  surprised: { ew: 84, eh: 150, lid: 0, arch: 0, smile: 0, open: 0.85, mw: 18 },
  sleepy: { ew: 72, eh: 112, lid: 0.5, arch: 0, smile: 0.05, open: 0, mw: 22 },
  asleep: { ew: 76, eh: 104, lid: 0.93, arch: 0, smile: 0.1, open: 0.05, mw: 20 },
  talking: { ew: 70, eh: 118, lid: 0, arch: 0, smile: 0.5, open: 0.25, mw: 34 },
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

function drawFace(g, s, color) {
  g.clearRect(0, 0, FACE_W, FACE_H)
  g.fillStyle = INK
  g.beginPath()
  g.roundRect(0, 0, FACE_W, FACE_H, 130)
  g.fill()

  g.fillStyle = color
  g.strokeStyle = color
  g.lineCap = 'round'
  g.shadowColor = color
  g.shadowBlur = 24

  const eyeY = FACE_H / 2 - 28
  for (const side of [-1, 1]) {
    const cx = FACE_W / 2 + side * 112
    // open eye: a capsule, shorter as the lid closes
    const h = Math.max(8, s.eh * (1 - s.lid))
    g.globalAlpha = 1 - s.arch
    g.beginPath()
    g.roundRect(cx - s.ew / 2, eyeY - h / 2 + s.eh * s.lid * 0.45, s.ew, h, s.ew / 2)
    g.fill()
    // happy eye: a clean arc "^"
    if (s.arch > 0.01) {
      g.globalAlpha = s.arch
      g.lineWidth = 20
      g.beginPath()
      g.arc(cx, eyeY + 26, 42, Math.PI * 1.12, Math.PI * 1.88)
      g.stroke()
    }
    g.globalAlpha = 1
  }

  // mouth: a soft curve; it fills in as it opens
  const mx = FACE_W / 2
  const my = FACE_H / 2 + 86
  const w = s.mw * 1.5
  const lift = s.smile * 16
  const d = s.open * 70
  g.shadowBlur = 16
  if (d < 6) {
    g.lineWidth = 11
    g.beginPath()
    g.moveTo(mx - w, my - lift * 0.4)
    g.quadraticCurveTo(mx, my + lift * 1.5, mx + w, my - lift * 0.4)
    g.stroke()
  } else {
    g.beginPath()
    g.moveTo(mx - w, my - lift * 0.4)
    g.quadraticCurveTo(mx, my + lift * 1.5 - 4, mx + w, my - lift * 0.4)
    g.bezierCurveTo(mx + w * 0.8, my + d * 1.25, mx - w * 0.8, my + d * 1.25, mx - w, my - lift * 0.4)
    g.fill()
  }
  g.shadowBlur = 0
}

function bodyProfile() {
  // a smooth teardrop: narrow at the top, full and round at the bottom
  const pts = []
  const H = 0.25
  const R = 0.082
  const belly = 0.4 // where it is widest, from the bottom (0..1)
  // sample by angle so the rounded ends get plenty of points (no pointed tips)
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI - Math.PI / 2 // -90deg (bottom) .. +90deg (top)
    const half = a < 0 ? belly : 1 - belly
    pts.push(new THREE.Vector2(Math.max(0.0005, R * Math.cos(a)), (belly + half * Math.sin(a)) * H))
  }
  return pts
}

function shadowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62)
  grad.addColorStop(0, 'rgba(0,0,0,0.5)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}

export function createAvatarRig({ color = '#7be0a4' } = {}) {
  const root = new THREE.Group()
  root.name = 'greeny'

  const ceramic = new THREE.MeshPhysicalMaterial({
    color: '#dfe3e8',
    roughness: 0.34,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
  })
  const ringMat = new THREE.MeshBasicMaterial({ color, toneMapped: false })

  // floating group so everything can bob together
  const float = new THREE.Group()
  root.add(float)

  const body = new THREE.Mesh(new THREE.LatheGeometry(bodyProfile(), 48), ceramic)
  body.position.y = 0.055
  body.scale.set(1, 1, 0.92)

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.0035, 12, 64), ringMat)
  ring.rotation.x = Math.PI / 2
  ring.position.y = 0.315

  // graphite joints: a neck between head and body, a ball at each shoulder
  const joint = new THREE.MeshPhysicalMaterial({ color: '#2a2f36', roughness: 0.4, clearcoat: 0.4 })
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.036, 0.06, 32), joint)
  neck.position.y = 0.318

  // each arm is a group pivoting at the shoulder; the capsule hangs below it
  const arms = [-1, 1].map((side) => {
    const pivot = new THREE.Group()
    pivot.position.set(side * 0.078, 0.225, 0)
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.02, 24, 16), joint)
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.017, 0.06, 8, 16), ceramic)
    arm.position.y = -0.05
    pivot.add(ball, arm)
    pivot.rotation.z = side * 0.28
    return pivot
  })

  const head = new THREE.Group()
  head.position.y = 0.45
  const SQUASH = new THREE.Vector3(1.22, 0.94, 1.0)
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.125, 64, 40), ceramic)
  shell.scale.copy(SQUASH)

  const canvas = document.createElement('canvas')
  canvas.width = FACE_W
  canvas.height = FACE_H
  const g = canvas.getContext('2d')
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  // curved glass: a patch of a slightly larger sphere with the same squash. The
  // face is emissive (always bright); the glossy surface still picks up reflections.
  const screen = new THREE.Mesh(
    new THREE.SphereGeometry(0.1262, 64, 40, Math.PI / 2 - 0.8, 1.6, Math.PI / 2 - 0.46, 0.92),
    new THREE.MeshPhysicalMaterial({
      color: '#000000',
      emissive: '#ffffff',
      emissiveMap: tex,
      map: tex,
      transparent: true,
      roughness: 0.3,
      specularIntensity: 0.35,
      envMapIntensity: 0.12,
      toneMapped: false,
    })
  )
  screen.scale.copy(SQUASH)
  head.add(shell, screen)

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.3),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false })
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.001

  float.add(body, neck, ring, ...arms, head)
  float.position.y = 0.04
  root.add(shadow)

  const cur = { ...MOODS.idle }
  let yaw = 0
  let pitch = 0
  let faceColor = color
  let last = ''

  // state: { mood, mouthMood, level (0..1 voice), look: {x,y} -1..1 or null, color, time }
  function update(state, dt) {
    const target = MOODS[state.mouthMood === 'talking' ? 'talking' : state.mood] || MOODS.idle
    const k = 1 - Math.exp(-dt / 0.09)
    for (const key in cur) cur[key] += (target[key] - cur[key]) * k
    const talk = state.mouthMood === 'talking' ? clamp(state.level || 0, 0, 1) : 0
    const shown = { ...cur, open: clamp(cur.open + talk * 0.9, 0, 1) }
    if (state.color && state.color !== faceColor) {
      faceColor = state.color
      ringMat.color.set(faceColor)
    }
    const key =
      [shown.ew, shown.eh, shown.lid, shown.arch, shown.smile, shown.open, shown.mw].map((v) => v.toFixed(1)).join() +
      faceColor
    if (key !== last) {
      last = key
      drawFace(g, shown, faceColor)
      tex.needsUpdate = true
    }

    const t = state.time || 0
    const ty = state.look ? clamp(state.look.x, -1, 1) * 0.5 : 0
    const tp = state.look ? clamp(state.look.y, -1, 1) * 0.3 : 0
    const hk = 1 - Math.exp(-dt / 0.38)
    yaw += (ty - yaw) * hk
    pitch += (tp - pitch) * hk
    head.rotation.set(pitch, yaw, 0)
    body.rotation.y = -yaw * 0.25
    float.position.y = 0.04 + Math.sin(t * 1.4) * 0.006
    ring.scale.setScalar(1 + Math.sin(t * 2.2) * 0.03)
    arms.forEach((a, i) => (a.rotation.z = (i ? 1 : -1) * (0.28 + Math.sin(t * 1.4 + i) * 0.04)))
    shadow.scale.setScalar(1 - (float.position.y - 0.04) * 6)
  }

  function dispose() {
    root.traverse((o) => {
      o.geometry?.dispose()
      o.material?.dispose?.()
    })
    tex.dispose()
  }

  return { object3d: root, update, dispose, height: 0.58 }
}
