import { InputOTP, InputOTPGroup, InputOTPSlot } from '@talad/ui/components/input-otp'

/** Six boxes for an authenticator code; `onComplete` fires on the last digit. */
export function CodeInput({
  value,
  onChange,
  onComplete,
  disabled,
  label,
}: {
  value: string
  onChange: (v: string) => void
  onComplete?: (v: string) => void
  disabled?: boolean
  label: string
}) {
  return (
    <InputOTP maxLength={6} value={value} onChange={onChange} onComplete={onComplete} autoFocus disabled={disabled} aria-label={label}>
      <InputOTPGroup>
        {Array.from({ length: 6 }, (_, i) => (
          <InputOTPSlot key={i} index={i} className="size-11 text-lg" />
        ))}
      </InputOTPGroup>
    </InputOTP>
  )
}
