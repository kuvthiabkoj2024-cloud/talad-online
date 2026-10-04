const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export type LocalizedText = Partial<Record<'lo' | 'en', string>>;

export interface CategoryNode {
  id: string;
  slug: string;
  name: LocalizedText;
  iconUrl: string | null;
  children: CategoryNode[];
}
