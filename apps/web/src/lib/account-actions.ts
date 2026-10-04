"use server";

import { API_URL } from "./api";
import type { CustomerProfile } from "./customer";
import type { ActionResult, AddressInput, ProfileErrorCode } from "./profile";
import { getSessionToken } from "./session";

const KNOWN = new Set<ProfileErrorCode>([
  "LIMIT_REACHED",
  "INVALID_PHONE",
  "INVALID_ACCOUNT_NUMBER",
  "INVALID_QR",
  "FILE_TOO_LARGE",
  "EMAIL_TAKEN",
]);

/** Calls the API as the signed-in customer and maps failures to translatable codes. */
async function send<T = unknown>(
  method: "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<ActionResult<{ data: T }>> {
  const token = await getSessionToken();
  if (!token) return { ok: false, error: "generic" };
  try {
    const isForm = body instanceof FormData;
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(!isForm && body !== undefined && { "Content-Type": "application/json" }),
      },
      body: isForm ? body : body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const json = res.status === 204 ? null : await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: json as T };
    if (res.status === 413) return { ok: false, error: "FILE_TOO_LARGE" };
    if (res.status === 503) return { ok: false, error: "STORAGE_UNAVAILABLE" };
    const code = json?.code as ProfileErrorCode | undefined;
    return { ok: false, error: code && KNOWN.has(code) ? code : "generic" };
  } catch {
    return { ok: false, error: "generic" };
  }
}

const drop = <T,>(r: ActionResult<{ data: T }>): ActionResult => (r.ok ? { ok: true } : r);

// ─── Profile ──────────────────────────────────────────────────────────────────

export async function updateProfile(input: {
  name: string;
  email: string;
}): Promise<ActionResult<{ customer: CustomerProfile }>> {
  const res = await send<CustomerProfile>("PUT", "/me/profile", input);
  return res.ok ? { ok: true, customer: res.data } : res;
}

/** `photo` in the form data: the image file to upload. */
export async function uploadAvatar(form: FormData): Promise<ActionResult<{ customer: CustomerProfile }>> {
  const photo = form.get("photo");
  if (!(photo instanceof File) || photo.size === 0) return { ok: false, error: "INVALID_QR" };
  const upload = new FormData();
  upload.set("file", photo);
  const res = await send<CustomerProfile>("POST", "/me/avatar", upload);
  return res.ok ? { ok: true, customer: res.data } : res;
}

export async function removeAvatar(): Promise<ActionResult<{ customer: CustomerProfile }>> {
  const res = await send<CustomerProfile>("DELETE", "/me/avatar");
  return res.ok ? { ok: true, customer: res.data } : res;
}

// ─── Addresses ────────────────────────────────────────────────────────────────

export async function saveAddress(input: AddressInput, id?: string): Promise<ActionResult<{ id: string }>> {
  const res = await send<{ id: string }>(id ? "PUT" : "POST", id ? `/me/addresses/${id}` : "/me/addresses", input);
  return res.ok ? { ok: true, id: res.data.id } : res;
}

export async function deleteAddress(id: string): Promise<ActionResult> {
  return drop(await send("DELETE", `/me/addresses/${id}`));
}

export async function setDefaultAddress(id: string): Promise<ActionResult> {
  return drop(await send("POST", `/me/addresses/${id}/default`));
}

// ─── Bank accounts ────────────────────────────────────────────────────────────

/**
 * Saves a bank account. `qr` in the form data: a File to upload a new image,
 * "remove" to delete the current one, absent to keep it.
 */
export async function saveBankAccount(form: FormData, id?: string): Promise<ActionResult> {
  const qr = form.get("qr");
  let qrImageKey: string | null | undefined;
  if (qr instanceof File && qr.size > 0) {
    const upload = new FormData();
    upload.set("file", qr);
    const res = await send<{ qrImageKey: string }>("POST", "/me/bank-accounts/qr", upload);
    if (!res.ok) return res;
    qrImageKey = res.data.qrImageKey;
  } else if (qr === "remove") {
    qrImageKey = null;
  }

  const body = {
    bankCode: form.get("bankCode"),
    accountName: form.get("accountName"),
    accountNumber: form.get("accountNumber"),
    isDefault: form.get("isDefault") === "true",
    ...(qrImageKey !== undefined && { qrImageKey }),
  };
  return drop(await send(id ? "PUT" : "POST", id ? `/me/bank-accounts/${id}` : "/me/bank-accounts", body));
}

export async function deleteBankAccount(id: string): Promise<ActionResult> {
  return drop(await send("DELETE", `/me/bank-accounts/${id}`));
}

export async function setDefaultBankAccount(id: string): Promise<ActionResult> {
  return drop(await send("POST", `/me/bank-accounts/${id}/default`));
}
