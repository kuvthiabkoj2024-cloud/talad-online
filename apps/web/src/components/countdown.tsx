"use client";

import { useEffect, useState } from "react";

function remaining(endsAt: string) {
  const ms = Math.max(0, new Date(endsAt).getTime() - Date.now());
  const s = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export function Countdown({ endsAt }: { endsAt: string }) {
  const [text, setText] = useState(() => remaining(endsAt));

  useEffect(() => {
    const id = setInterval(() => setText(remaining(endsAt)), 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  return (
    // The server render (and the 5-minute cached home page) is earlier than the browser's clock.
    <span suppressHydrationWarning className="rounded bg-black/25 px-2 py-0.5 font-mono font-semibold tabular-nums text-white ring-1 ring-white/30">
      {text}
    </span>
  );
}
