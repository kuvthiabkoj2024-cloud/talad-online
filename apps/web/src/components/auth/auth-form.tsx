"use client";

import { formatPhone, OTP_LENGTH, type Locale } from "@talad/shared";
import { ArrowLeft, CircleAlert, KeyRound, LoaderCircle, Phone, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { requestOtp, socialSignIn, verifyOtp, verifyTwoFactor } from "@/lib/auth-actions";
import type { AuthErrorCode, CustomerProfile } from "@/lib/customer";
import { interpolate } from "@/lib/format";
import { OtpInput } from "./otp-input";
import { SocialButtons } from "./social-buttons";

export type AuthMode = "login" | "register";

/**
 * Phone-first sign in / sign up: details → 6-digit SMS code, with Google and
 * Apple as alternatives. Used by the header modal and the /login, /register pages.
 */
export function AuthForm({
  locale,
  dict,
  initialMode = "login",
  onModeChange,
  onSuccess,
}: {
  locale: Locale;
  dict: Dictionary["auth"];
  initialMode?: AuthMode;
  /** When set, switching mode is delegated (e.g. pages link to /login vs /register). */
  onModeChange?: (mode: AuthMode) => void;
  onSuccess: (customer: CustomerProfile) => void;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [step, setStep] = useState<"details" | "code" | "twoFactor">("details");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<AuthErrorCode | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [pending, startTransition] = useTransition();

  function fail(code: AuthErrorCode) {
    setErrorCode(code);
    setError(dict.errors[code] ?? dict.errors.generic);
  }

  function clearError() {
    setError(null);
    setErrorCode(null);
  }

  function switchMode(next: AuthMode) {
    clearError();
    if (onModeChange) onModeChange(next);
    else setMode(next);
  }

  function sendCode() {
    clearError();
    startTransition(async () => {
      const res = await requestOtp({ flow: mode, phone, name: mode === "register" ? name : undefined });
      if (!res.ok) {
        if (res.error === "OTP_COOLDOWN" && res.retryAfter) {
          setResendAt(Date.now() + res.retryAfter * 1000);
          if (sentTo) return setStep("code");
        }
        return fail(res.error);
      }
      setSentTo(res.phone);
      setDevCode(res.devCode);
      setCode("");
      setResendAt(Date.now() + res.resendAfterSeconds * 1000);
      setStep("code");
    });
  }

  function verify(value = code) {
    if (value.length !== OTP_LENGTH || pending) return;
    clearError();
    startTransition(async () => {
      const res = await verifyOtp({ flow: mode, phone: sentTo, code: value, name: mode === "register" ? name : undefined });
      if (!res.ok) {
        setCode("");
        return fail(res.error);
      }
      done(res);
    });
  }

  /** A session, or the authenticator step for accounts that turned it on. */
  function done(res: { customer: CustomerProfile } | { twoFactor: { challenge: string } }) {
    if ("twoFactor" in res && res.twoFactor) {
      setChallenge(res.twoFactor.challenge);
      setCode("");
      setStep("twoFactor");
      return;
    }
    if ("customer" in res && res.customer) onSuccess(res.customer);
  }

  function verifySecondStep(value = code) {
    if (value.length !== OTP_LENGTH || pending || !challenge) return;
    clearError();
    startTransition(async () => {
      const res = await verifyTwoFactor(challenge, value);
      if (!res.ok) {
        setCode("");
        if (res.error === "CHALLENGE_EXPIRED") setStep("details");
        return fail(res.error);
      }
      done(res);
    });
  }

  function onSocialToken(provider: "google" | "apple", idToken: string, fullName?: string) {
    clearError();
    startTransition(async () => {
      const res = await socialSignIn(provider, idToken, fullName);
      if (!res.ok) return fail(res.error);
      done(res);
    });
  }

  const isRegister = mode === "register";

  if (step === "twoFactor") {
    return (
      <div className="flex flex-col gap-6">
        <button
          type="button"
          onClick={() => {
            clearError();
            setStep("details");
          }}
          className="flex items-center gap-1.5 self-start text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {dict.back}
        </button>
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <ShieldCheck className="size-7" />
          </span>
          <h2 className="text-2xl font-bold">{dict.twoFactorTitle}</h2>
          <p className="text-sm text-muted-foreground">{dict.twoFactorPrompt}</p>
        </div>
        <OtpInput
          value={code}
          onChange={(v) => {
            setCode(v);
            if (error) clearError();
          }}
          onComplete={verifySecondStep}
          disabled={pending}
          invalid={errorCode === "TWO_FACTOR_INVALID"}
          label={dict.twoFactorTitle}
        />
        <ErrorMessage message={error} />
        <SubmitButton pending={pending} disabled={code.length !== OTP_LENGTH} onClick={() => verifySecondStep()}>
          {dict.verify}
        </SubmitButton>
      </div>
    );
  }

  if (step === "code") {
    return (
      <div className="flex flex-col gap-6">
        <button
          type="button"
          onClick={() => {
            clearError();
            setStep("details");
          }}
          className="flex items-center gap-1.5 self-start text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {dict.changeNumber}
        </button>

        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <KeyRound className="size-7" />
          </span>
          <h2 className="text-2xl font-bold">{dict.otpTitle}</h2>
          <p className="text-sm text-muted-foreground">
            {dict.otpSent.split("{phone}")[0]}
            <span className="whitespace-nowrap font-semibold text-foreground">{formatPhone(sentTo)}</span>
            {dict.otpSent.split("{phone}")[1]}
          </p>
        </div>

        <OtpInput
          value={code}
          onChange={(v) => {
            setCode(v);
            if (error) clearError();
          }}
          onComplete={verify}
          disabled={pending}
          invalid={errorCode === "OTP_INVALID"}
          label={dict.otpTitle}
        />

        {/* No SMS gateway yet: the API returns the code outside production so it can be shown here. */}
        {devCode && (
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-primary/30 bg-primary-soft px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-primary">{dict.devCodeTitle}</p>
              <p className="font-mono text-2xl font-bold tracking-[0.3em] tabular-nums">{devCode}</p>
              <p className="text-xs text-muted-foreground">{dict.devCodeNote}</p>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setCode(devCode);
                verify(devCode);
              }}
              className="shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-60"
            >
              {dict.fillCode}
            </button>
          </div>
        )}

        <ErrorMessage message={error} />

        <SubmitButton pending={pending} disabled={code.length !== OTP_LENGTH} onClick={() => verify()}>
          {dict.verify}
        </SubmitButton>

        <ResendButton resendAt={resendAt} pending={pending} dict={dict} onResend={sendCode} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">{isRegister ? dict.signUpTitle : dict.signInTitle}</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {isRegister ? dict.signUpSubtitle : dict.signInSubtitle}
        </p>
      </div>

      <div role="tablist" className="grid grid-cols-2 rounded-full bg-muted p-1 text-sm font-semibold">
        {(["login", "register"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => switchMode(m)}
            className={`rounded-full py-2.5 transition-all ${
              mode === m ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {m === "login" ? dict.signIn : dict.signUp}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendCode();
        }}
        className="flex flex-col gap-4"
      >
        {isRegister && (
          <Field icon={<UserRound className="size-5" />} label={dict.fullName} invalid={errorCode === "nameRequired"}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={dict.fullNamePlaceholder}
              autoComplete="name"
              required
              minLength={2}
              maxLength={100}
              className="h-full w-full bg-transparent outline-none placeholder:text-muted-foreground/70"
            />
          </Field>
        )}

        <Field icon={<Phone className="size-5" />} label={dict.phone} invalid={errorCode === "INVALID_PHONE"}>
          <span className="mr-2 border-r border-border pr-2.5 text-sm font-semibold text-muted-foreground">
            +856
          </span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="20 5555 1234"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            required
            className="h-full w-full bg-transparent tabular-nums outline-none placeholder:text-muted-foreground/70"
          />
        </Field>

        <ErrorMessage
          message={error}
          action={
            errorCode === "PHONE_REGISTERED" || errorCode === "PHONE_NOT_REGISTERED" ? (
              <button
                type="button"
                onClick={() => switchMode(errorCode === "PHONE_REGISTERED" ? "login" : "register")}
                className="font-semibold underline"
              >
                {errorCode === "PHONE_REGISTERED" ? dict.signIn : dict.signUp}
              </button>
            ) : null
          }
        />

        <SubmitButton pending={pending}>{dict.getOtp}</SubmitButton>
      </form>

      <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {dict.or}
        <span className="h-px flex-1 bg-border" />
      </div>

      <SocialButtons
        locale={locale}
        dict={dict}
        disabled={pending}
        onToken={onSocialToken}
        onNotice={(message) => {
          setErrorCode(null);
          setError(message);
        }}
      />

      <p className="text-center text-sm text-muted-foreground">
        {isRegister ? dict.haveAccount : dict.noAccount}{" "}
        <button
          type="button"
          onClick={() => switchMode(isRegister ? "login" : "register")}
          className="font-semibold text-primary hover:underline"
        >
          {isRegister ? dict.signIn : dict.signUp}
        </button>
      </p>

      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        {dict.termsPrefix}{" "}
        <Link href={`/${locale}/pages/terms`} className="underline hover:text-foreground">
          {dict.termsLink}
        </Link>{" "}
        {dict.and}{" "}
        <Link href={`/${locale}/pages/privacy`} className="underline hover:text-foreground">
          {dict.privacyLink}
        </Link>
      </p>
    </div>
  );
}

function Field({
  icon,
  label,
  invalid,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  invalid?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <span
        className={`flex h-12 items-center gap-3 rounded-xl border bg-card px-4 transition-colors focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15 ${
          invalid ? "border-sale" : "border-border"
        }`}
      >
        <span className="text-muted-foreground">{icon}</span>
        {children}
      </span>
    </label>
  );
}

function SubmitButton({
  pending,
  disabled,
  onClick,
  children,
}: {
  pending: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type={onClick ? "button" : "submit"}
      onClick={onClick}
      disabled={pending || disabled}
      className="flex h-12 items-center justify-center gap-2 rounded-full bg-primary font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:brightness-110 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
    >
      {pending && <LoaderCircle className="size-5 animate-spin" />}
      {children}
    </button>
  );
}

function ErrorMessage({ message, action }: { message: string | null; action?: React.ReactNode }) {
  if (!message) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-xl bg-sale/10 px-4 py-3 text-sm text-sale">
      <CircleAlert className="mt-0.5 size-4 shrink-0" />
      <span>
        {message} {action}
      </span>
    </p>
  );
}

function ResendButton({
  resendAt,
  pending,
  dict,
  onResend,
}: {
  resendAt: number;
  pending: boolean;
  dict: Dictionary["auth"];
  onResend: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.ceil((resendAt - now) / 1000));

  return (
    <p className="text-center text-sm text-muted-foreground">
      {seconds > 0 ? (
        interpolate(dict.resendIn, { s: seconds })
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={onResend}
          className="font-semibold text-primary hover:underline disabled:opacity-50"
        >
          {dict.resend}
        </button>
      )}
    </p>
  );
}
