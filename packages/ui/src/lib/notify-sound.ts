/**
 * The "you've got a notification" chime: two soft notes made with the Web Audio API (no sound
 * file). Browsers only allow sound after the person has tapped or typed on the page, so the
 * audio is unlocked on the first interaction. On/off is remembered on this device.
 */
const KEY = 'talad_notify_sound'
const MIN_GAP_MS = 1500

let ctx: AudioContext | null = null
let lastPlayed = 0
let unlocking = false

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  ctx ??= new Ctor()
  return ctx
}

/** Call once at start-up: the first tap or key press unlocks sound for the session. */
export function unlockNotificationSound(): void {
  if (unlocking || typeof window === 'undefined') return
  unlocking = true
  const unlock = () => {
    void audio()?.resume()
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
  }
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
}

export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

export function setSoundEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    // Private mode: the setting lasts for this page only.
  }
}

/** Plays the chime (if sound is on, unlocked, and it didn't just play). */
export function playNotificationSound(): void {
  if (!soundEnabled() || Date.now() - lastPlayed < MIN_GAP_MS) return
  const ac = audio()
  if (!ac || ac.state !== 'running') return
  lastPlayed = Date.now()
  const now = ac.currentTime
  // E6 then A6, each a short sine "ding" with a quick fade.
  ;[
    { freq: 1318.5, start: 0 },
    { freq: 1760, start: 0.12 },
  ].forEach(({ freq, start }) => {
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, now + start)
    gain.gain.exponentialRampToValueAtTime(0.18, now + start + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + 0.35)
    osc.connect(gain).connect(ac.destination)
    osc.start(now + start)
    osc.stop(now + start + 0.4)
  })
}
