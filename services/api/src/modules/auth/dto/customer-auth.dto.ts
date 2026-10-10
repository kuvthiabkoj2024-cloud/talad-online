import { ACCOUNT_PASSWORD } from '@talad/shared';
import { IsIn, IsNotEmpty, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export const OTP_FLOWS = ['login', 'register'] as const;
export type OtpFlow = (typeof OTP_FLOWS)[number];

export class RequestOtpDto {
  /** Any common Lao mobile format; normalized server-side. */
  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsIn(OTP_FLOWS)
  flow: OtpFlow;

  /** Required when `flow` is "register". */
  @IsOptional()
  @IsString()
  @Length(2, 100)
  name?: string;
}

export class VerifyOtpDto extends RequestOtpDto {
  @Matches(/^\d{6}$/)
  code: string;
}

export class SocialSignInDto {
  @IsString()
  @IsNotEmpty()
  idToken: string;

  /** Apple only sends the user's name to the client, on first sign-in. */
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;
}

/** Phone (any Lao format) or email, plus password. */
export class PasswordLoginDto {
  @IsString()
  @Length(3, 200)
  identifier: string;

  @IsString()
  @Length(1, ACCOUNT_PASSWORD.max)
  password: string;
}

/** Second sign-in step: the challenge from step one + an authenticator or SMS code. */
export class TwoFactorVerifyDto {
  @IsString()
  @IsNotEmpty()
  challenge: string;

  @Matches(/^\d{6}$/)
  code: string;
}

export class TwoFactorChallengeDto {
  @IsString()
  @IsNotEmpty()
  challenge: string;
}

export class ForgotPasswordDto {
  @IsString()
  @IsNotEmpty()
  phone: string;
}

export class ResetPasswordDto extends ForgotPasswordDto {
  @Matches(/^\d{6}$/)
  code: string;

  @IsString()
  @Length(ACCOUNT_PASSWORD.min, ACCOUNT_PASSWORD.max)
  password: string;
}

export class SetPasswordDto {
  /** Required when the account already has a password. */
  @IsOptional()
  @IsString()
  @MaxLength(ACCOUNT_PASSWORD.max)
  current?: string;

  @IsString()
  @Length(ACCOUNT_PASSWORD.min, ACCOUNT_PASSWORD.max)
  password: string;
}

export class CodeDto {
  @Matches(/^\d{6}$/)
  code: string;
}
