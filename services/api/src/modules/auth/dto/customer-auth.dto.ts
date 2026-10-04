import { IsIn, IsNotEmpty, IsOptional, IsString, Length, Matches } from 'class-validator';

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
