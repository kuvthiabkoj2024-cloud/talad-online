import * as React from "react"

interface TurnstileApi {
  render(el: HTMLElement, options: Record<string, unknown>): string
  reset(id: string): void
  remove(id: string): void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let script: Promise<TurnstileApi> | null = null
function loadTurnstile(): Promise<TurnstileApi> {
  script ??= new Promise((resolve, reject) => {
    const el = document.createElement("script")
    el.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
    el.async = true
    el.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile missing")))
    el.onerror = () => {
      script = null
      reject(new Error("Turnstile failed to load"))
    }
    document.head.appendChild(el)
  })
  return script
}

/**
 * Cloudflare Turnstile robot check for sign-in forms, shown as its box across the form
 * ("Verifying… → Success", a checkbox to tick when Cloudflare is unsure). Without a site key
 * (development) it's off.
 *
 * Render `widget` inside the form, e.g. above its button (forms can swap: the box follows
 * wherever `widget` is mounted, one place at a time); send `headers()` with the request (it uses up the token and
 * fetches a fresh one for the next try). Without a pass yet, `headers()` is empty and the API
 * answers CAPTCHA_REQUIRED, so buttons never get stuck disabled. When the check can't run, the
 * widget shows `failedText` with Cloudflare's code (e.g. 110200: hostname not allowed).
 */
function useTurnstile(siteKey: string | undefined, options: { action: string; language?: string; failedText?: string }) {
  // A callback ref: when the form showing the box changes, it's drawn again in the new one.
  const [slot, setSlot] = React.useState<HTMLDivElement | null>(null)
  const widget = React.useRef<string | null>(null)
  const [token, setToken] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const { action, language, failedText } = options

  React.useEffect(() => {
    if (!siteKey || !slot) return
    let cancelled = false
    loadTurnstile()
      .then((api) => {
        if (cancelled) return
        widget.current = api.render(slot, {
          sitekey: siteKey,
          action,
          language: language ?? "auto",
          appearance: "always",
          size: "flexible",
          callback: (t: string) => {
            setToken(t)
            setError(null)
          },
          "expired-callback": () => setToken(null),
          "error-callback": (code: string) => {
            setToken(null)
            setError(String(code))
            return true
          },
          "unsupported-callback": () => setError("unsupported"),
        })
      })
      .catch(() => setError("script"))
    return () => {
      cancelled = true
      if (widget.current) window.turnstile?.remove(widget.current)
      widget.current = null
      setToken(null)
    }
  }, [siteKey, slot, action, language])

  const headers = React.useCallback((): Record<string, string> => {
    if (!siteKey || !token) return {}
    setToken(null)
    if (widget.current) window.turnstile?.reset(widget.current)
    return { "X-Turnstile-Token": token }
  }, [siteKey, token])

  return {
    widget: siteKey ? (
      <>
        <div ref={setSlot} className="min-h-[65px] w-full" />
        {error && failedText && (
          <p role="alert" className="text-center text-sm text-destructive">
            {failedText} ({error})
          </p>
        )}
      </>
    ) : null,
    headers,
  }
}

export { useTurnstile }
