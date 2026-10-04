"use client";

import { OTP_LENGTH } from "@talad/shared";
import { useRef } from "react";

/**
 * Segmented one-time-code input: auto-advances, supports backspace, arrow keys,
 * pasting the whole code and iOS/Android SMS autofill.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  label: string;
}) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] ?? "");

  function update(next: string, focusIndex: number) {
    const clean = next.replace(/\D/g, "").slice(0, OTP_LENGTH);
    onChange(clean);
    inputs.current[Math.min(focusIndex, OTP_LENGTH - 1)]?.focus();
    if (clean.length === OTP_LENGTH) onComplete?.(clean);
  }

  function onInput(index: number, raw: string) {
    const typed = raw.replace(/\D/g, "");
    if (!typed) return;
    // Autofill / paste delivers several digits at once.
    const next = (value.slice(0, index) + typed + value.slice(index + typed.length)).slice(0, OTP_LENGTH);
    update(next, index + typed.length);
  }

  function onKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (digits[index]) update(value.slice(0, index) + value.slice(index + 1), index);
      else if (index > 0) update(value.slice(0, index - 1) + value.slice(index), index - 1);
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < OTP_LENGTH - 1) {
      inputs.current[index + 1]?.focus();
    }
  }

  return (
    <div role="group" aria-label={label} className="flex justify-between gap-2 sm:gap-3">
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            inputs.current[i] = el;
          }}
          value={digit}
          onChange={(e) => onInput(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onFocus={(e) => e.target.select()}
          onPaste={(e) => {
            e.preventDefault();
            update(e.clipboardData.getData("text"), OTP_LENGTH);
          }}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`${label} ${i + 1}`}
          aria-invalid={invalid}
          autoFocus={i === 0}
          className={`h-14 w-full min-w-0 rounded-xl border-2 bg-card text-center text-2xl font-semibold tabular-nums outline-none transition-colors focus:border-primary focus:ring-4 focus:ring-primary/15 disabled:opacity-60 sm:h-16 ${
            invalid ? "border-sale" : digit ? "border-primary/50" : "border-border"
          }`}
        />
      ))}
    </div>
  );
}
