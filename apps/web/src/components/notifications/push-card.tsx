"use client";

import type { Locale } from "@talad/shared";
import { BellRing, CheckCircle2, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { getPushPublicKey, removePushSubscription, savePushSubscription } from "@/lib/push-actions";
import { disablePush, enablePush, getPushState, type PushState } from "@/lib/web-push";

type Dict = Dictionary["notifications"];

/**
 * "Get notifications on this device": turns Web Push on or off for this browser, so order
 * updates and chat replies show as system notifications on desktop and installed PWAs.
 * Hidden where the browser can't, or while push is off on the server.
 */
export function PushCard({ locale, dict }: { locale: Locale; dict: Dict }) {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    void Promise.all([getPushPublicKey(), getPushState()]).then(([key, s]) => {
      if (!live) return;
      setPublicKey(key);
      setState(s);
    });
    return () => {
      live = false;
    };
  }, []);

  if (!publicKey || !state || state === "unsupported") return null;

  async function turnOn() {
    setBusy(true);
    setFailed(false);
    try {
      setState(await enablePush({ publicKey: publicKey!, locale, save: savePushSubscription }));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    await disablePush(removePushSubscription);
    setState("off");
    setBusy(false);
  }

  if (state === "on") {
    return (
      <div className="flex items-center gap-2.5 rounded-2xl bg-primary-soft px-4 py-3 text-sm text-primary">
        <CheckCircle2 className="size-5 shrink-0" />
        <span className="flex-1 font-medium">{dict.pushEnabled}</span>
        <button
          type="button"
          onClick={turnOff}
          disabled={busy}
          className="shrink-0 rounded-full px-3 py-1 font-semibold underline-offset-2 hover:underline disabled:opacity-60"
        >
          {dict.pushTurnOff}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border sm:flex-row sm:items-center">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
        <BellRing className="size-6" />
      </span>
      <div className="flex-1">
        <h2 className="font-semibold">{dict.pushTitle}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {state === "denied" ? dict.pushDenied : state === "install" ? dict.pushInstall : dict.pushBody}
        </p>
        {failed && <p className="mt-1 text-sm text-sale">{dict.pushFailed}</p>}
      </div>
      {state === "off" && (
        <button
          type="button"
          onClick={turnOn}
          disabled={busy}
          className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-70"
        >
          {busy && <LoaderCircle className="size-4 animate-spin" />}
          {dict.pushTurnOn}
        </button>
      )}
    </div>
  );
}
