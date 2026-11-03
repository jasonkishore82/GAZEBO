// WebXR "immersive-ar" glue, kept apart from the rig so the page works without it.
//
// Today: isArSupported() tells the UI whether an AR button can be shown, and
// startAr() opens a session and places the rig where the user taps on a real
// surface (hit-test). Needs HTTPS (or localhost) and an AR-capable device
// (Android Chrome with ARCore; Quest browser). iOS Safari has no WebXR.

export async function isArSupported() {
  try {
    return !!(navigator.xr && (await navigator.xr.isSessionSupported('immersive-ar')))
  } catch {
    return false
  }
}

// renderer: THREE.WebGLRenderer, scene: THREE.Scene, rig: from createAvatarRig,
// onEnd: called when the session closes. Returns the session.
export async function startAr({ renderer, rig, onEnd }) {
  const session = await navigator.xr.requestSession('immersive-ar', {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['local-floor', 'dom-overlay'],
  })
  renderer.xr.enabled = true
  await renderer.xr.setSession(session)

  const refSpace = await session.requestReferenceSpace('viewer')
  const hitSource = await session.requestHitTestSource({ space: refSpace })
  const local = renderer.xr.getReferenceSpace()
  let pose = null
  let placed = false

  rig.object3d.visible = false
  session.addEventListener('select', () => {
    if (!pose) return
    rig.object3d.position.set(pose.position.x, pose.position.y, pose.position.z)
    rig.object3d.visible = true
    placed = true
  })

  // call from the render loop with the XR frame
  const onFrame = (frame) => {
    if (!frame || placed) return
    const hits = frame.getHitTestResults(hitSource)
    pose = hits.length ? hits[0].getPose(local)?.transform ?? null : null
  }

  session.addEventListener('end', () => {
    hitSource.cancel?.()
    renderer.xr.enabled = false
    rig.object3d.position.set(0, 0, 0)
    rig.object3d.visible = true
    onEnd?.()
  })
  return { session, onFrame }
}
