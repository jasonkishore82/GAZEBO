import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { createAvatarRig } from './avatarRig.js'
import { isArSupported, startAr } from './ar.js'

// The three.js character option: a full-size canvas that renders the avatar
// rig with real lighting. The rig is the same one an AR session places in the
// room; the "View in AR" button appears only where WebXR AR is available.
export default function ThreeStage({ mood, mouthMood, levelRef, lookRef, color }) {
  const mountRef = useRef(null)
  const stateRef = useRef({})
  const arRef = useRef(null)
  const [arReady, setArReady] = useState(false)
  const [inAr, setInAr] = useState(false)

  stateRef.current = { mood, mouthMood, color, levelRef, lookRef }

  useEffect(() => {
    isArSupported().then(setArReady)
  }, [])

  useEffect(() => {
    const mount = mountRef.current
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    mount.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 20)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 0.85
    camera.position.set(0, 0.32, 1.55)
    camera.lookAt(0, 0.3, 0)
    // soft studio reflections for the glossy surfaces
    const pmrem = new THREE.PMREMGenerator(renderer)
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environmentIntensity = 0.6
    const key = new THREE.DirectionalLight('#ffffff', 1.1)
    key.position.set(0.7, 1.1, 1.3)
    scene.add(key)

    const rig = createAvatarRig()
    scene.add(rig.object3d)
    arRef.current = { renderer, rig }

    const resize = () => {
      const w = mount.clientWidth || 1
      const h = mount.clientHeight || 1
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(mount)

    const clock = new THREE.Clock()
    renderer.setAnimationLoop((_, frame) => {
      const s = stateRef.current
      const look = s.lookRef.current
      rig.update(
        {
          mood: s.mood,
          mouthMood: s.mouthMood,
          level: s.levelRef?.current ?? 0,
          color: s.color,
          time: clock.elapsedTime,
          look: look ? { x: (look.x / innerWidth - 0.5) * 2, y: (look.y / innerHeight - 0.5) * 1.6 } : null,
        },
        Math.min(clock.getDelta(), 0.1)
      )
      arRef.current?.onFrame?.(frame)
      renderer.render(scene, camera)
    })

    return () => {
      renderer.setAnimationLoop(null)
      ro.disconnect()
      rig.dispose()
      pmrem.dispose()
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [])

  const enterAr = async () => {
    try {
      const { renderer, rig } = arRef.current
      const { onFrame } = await startAr({ renderer, rig, onEnd: () => setInAr(false) })
      arRef.current.onFrame = onFrame
      setInAr(true)
    } catch (e) {
      console.warn('[ar]', e.message)
    }
  }

  return (
    <div className="three-stage" ref={mountRef}>
      {arReady && !inAr && (
        <button className="three-ar" onClick={enterAr}>
          View in AR
        </button>
      )}
    </div>
  )
}
