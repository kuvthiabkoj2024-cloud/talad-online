/**
 * A live event stream (Server-Sent Events) read with fetch, so it can send an Authorization
 * header (EventSource can't). Reconnects with backoff; `onOpen` fires on every (re)connect so
 * the app can refetch anything it missed while offline.
 */
export function connectEventStream<T>({
  url,
  headers,
  onEvent,
  onOpen,
  onUnauthorized,
}: {
  url: string
  headers?: () => Record<string, string>
  onEvent: (event: T) => void
  onOpen?: () => void
  /** The session is gone (401): stop instead of retrying. */
  onUnauthorized?: () => void
}): () => void {
  let stopped = false
  let controller: AbortController | null = null
  let retry = 1000
  let timer: ReturnType<typeof setTimeout> | null = null

  const schedule = () => {
    if (stopped) return
    timer = setTimeout(run, retry)
    retry = Math.min(30_000, retry * 2)
  }

  async function run() {
    controller = new AbortController()
    try {
      const res = await fetch(url, { headers: { Accept: 'text/event-stream', ...headers?.() }, signal: controller.signal, cache: 'no-store' })
      if (res.status === 401 || res.status === 403) {
        stopped = true
        onUnauthorized?.()
        return
      }
      if (!res.ok || !res.body) return schedule()
      retry = 1000
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let end: number
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, end)
          buffer = buffer.slice(end + 2)
          const lines = block.split('\n')
          const name = lines.find((l) => l.startsWith('event: '))?.slice(7)
          const data = lines
            .filter((l) => l.startsWith('data: '))
            .map((l) => l.slice(6))
            .join('\n')
          if (name === 'ready') onOpen?.()
          else if (data) {
            try {
              onEvent(JSON.parse(data) as T)
            } catch {
              // A malformed event is skipped.
            }
          }
        }
      }
    } catch {
      // Network error or aborted.
    }
    schedule()
  }

  // A tab coming back to the front reconnects straight away (phones suspend background tabs).
  const onVisible = () => {
    if (document.visibilityState === 'visible' && !stopped && timer) {
      clearTimeout(timer)
      timer = null
      retry = 1000
      void run()
    }
  }
  document.addEventListener('visibilitychange', onVisible)
  void run()

  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
    controller?.abort()
    document.removeEventListener('visibilitychange', onVisible)
  }
}
