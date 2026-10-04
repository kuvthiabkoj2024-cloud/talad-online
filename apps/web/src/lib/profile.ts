import type { AddressLabel, BankCode, ProvinceCode } from "@talad/shared";

/** Mirrors the API's saved address (services/api customers module). */
export interface AddressItem {
  id: string;
  label: AddressLabel | null;
  recipientName: string;
  phone: string;
  province: ProvinceCode | string;
  district: string;
  village: string | null;
  line: string;
  isDefault: boolean;
}

export type AddressInput = Omit<AddressItem, "id" | "label" | "village"> & {
  label?: AddressLabel;
  village?: string;
};

export interface BankAccountItem {
  id: string;
  bankCode: BankCode;
  accountName: string;
  accountNumber: string;
  hasQr: boolean;
  isDefault: boolean;
}

export type ProfileErrorCode =
  | "LIMIT_REACHED"
  | "INVALID_PHONE"
  | "INVALID_ACCOUNT_NUMBER"
  | "INVALID_QR"
  | "FILE_TOO_LARGE"
  | "STORAGE_UNAVAILABLE"
  | "EMAIL_TAKEN"
  | "INVALID_EMAIL"
  | "generic";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: ProfileErrorCode };

/** "010120001234567" → "0101 2000 1234 567" for readability. */
export function groupDigits(value: string): string {
  return value.replace(/(\d{4})(?=\d)/g, "$1 ");
}
