/** Password rules for platform accounts (customers and shop owners, §3.1 / §4.1). */
export const ACCOUNT_PASSWORD = { min: 8, max: 200 } as const;

/** Second sign-in step an account can turn on (mirrors Prisma `TwoFactorMethod`). */
export const TWO_FACTOR_METHODS = ['NONE', 'TOTP', 'SMS'] as const;
export type TwoFactorMethod = (typeof TWO_FACTOR_METHODS)[number];
