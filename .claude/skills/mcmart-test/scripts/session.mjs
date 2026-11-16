#!/usr/bin/env node
// Signs a LOCAL demo account in for browser tests (no SMS code needed), and signs them all out after.
//
//   node session.mjs customer   # → prints a session token for the demo customer
//   node session.mjs shop       # → the demo shop owner (Seller Center and the app's seller area)
//   node session.mjs admin      # → the Super Admin (admin console)
//   node session.mjs cleanup    # deletes every session this created
//
// Local only: it writes to the database in the `talad-postgres-1` Docker container. Sessions are
// marked with the user agent below so `cleanup` finds exactly these.
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const HERE = new URL('.', import.meta.url).pathname;
const { accounts } = JSON.parse(readFileSync(join(HERE, '..', 'config.json'), 'utf8'));
const MARK = 'mcmart-test-skill';

const sql = (query) =>
  execFileSync('docker', ['exec', 'talad-postgres-1', 'psql', '-U', 'talad', '-d', 'talad', '-At', '-c', query], { encoding: 'utf8' }).trim();

const who = process.argv[2];
if (who === 'cleanup') {
  console.log(sql(`delete from "Session" where "userAgent" = '${MARK}'`));
  process.exit(0);
}

let actorType;
let actorId;
if (who === 'customer' || who === 'shop') {
  actorType = 'CUSTOMER';
  // Phone numbers come from config.json (digits and + only).
  const phone = accounts[who].replace(/[^\d+]/g, '');
  actorId = sql(`select id from "Customer" where phone = '${phone}'`);
} else if (who === 'admin') {
  actorType = 'ADMIN';
  const role = accounts.admin.replace(/[^A-Z_]/g, '');
  actorId = sql(`select a.id from "AdminUser" a join "AdminRole" r on r.id = a."roleId" where r.key = '${role}' order by a."createdAt" limit 1`);
} else {
  console.error('Usage: node session.mjs customer | shop | admin | cleanup');
  process.exit(1);
}
if (!/^[0-9a-f-]{36}$/.test(actorId)) {
  console.error(`✖ No local ${who} account found (is the database running and seeded?)`);
  process.exit(1);
}

const token = randomBytes(32).toString('base64url');
const hash = createHash('sha256').update(token).digest('hex');
sql(`insert into "Session" (id, "actorType", "actorId", "refreshTokenHash", "userAgent", "expiresAt") values (gen_random_uuid(), '${actorType}', '${actorId}', '${hash}', '${MARK}', now() + interval '1 day')`);
console.log(token);
