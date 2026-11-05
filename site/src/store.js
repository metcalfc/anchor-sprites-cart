import { randomBytes, randomInt } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const MAX_USERS = 5000;
const CODE_TTL_MS = 10 * 60 * 1000;
const MAIL_KEPT = 5;

// Everything the portal remembers, as files in one directory. Sign-in codes and
// the mailbox are kept in memory: they only need to last a few minutes.
export function createStore(dir) {
  mkdirSync(dir, { recursive: true });
  const usersFile = join(dir, 'users.json');
  const secretFile = join(dir, 'session-secret');

  if (!existsSync(secretFile)) {
    writeFileSync(secretFile, randomBytes(32).toString('hex'), { mode: 0o600 });
  }
  const secret = readFileSync(secretFile, 'utf8').trim();

  const users = existsSync(usersFile) ? JSON.parse(readFileSync(usersFile, 'utf8')) : {};
  const saveUsers = () => {
    writeFileSync(`${usersFile}.tmp`, JSON.stringify(users, null, 2), { mode: 0o600 });
    renameSync(`${usersFile}.tmp`, usersFile);
  };

  const codes = new Map(); // userId -> { code, expires }
  const mail = new Map(); // userId -> [{ at, subject, body }]

  return {
    secret,
    userCount: () => Object.keys(users).length,
    getUser: (id) => users[id],
    findUserByEmail: (email) =>
      Object.values(users).find((user) => user.email === email.toLowerCase()),
    createUser({ name, company, email, password }) {
      const user = {
        id: randomBytes(8).toString('hex'),
        name,
        company,
        email: email.toLowerCase(),
        password,
        design: 'classic',
        createdAt: new Date().toISOString(),
      };
      users[user.id] = user;
      saveUsers();
      return user;
    },
    updateUser(id, changes) {
      Object.assign(users[id], changes);
      saveUsers();
      return users[id];
    },

    // Issues a one-time code and "emails" it to the user's Hangar Mail inbox.
    issueCode(userId, now = Date.now()) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      codes.set(userId, { code, expires: now + CODE_TTL_MS });
      const inbox = mail.get(userId) ?? [];
      inbox.unshift({
        at: new Date(now).toISOString(),
        subject: 'Your Hangar Supply sign-in code',
        body: `Your sign-in code is ${code}. It expires in 10 minutes.`,
      });
      mail.set(userId, inbox.slice(0, MAIL_KEPT));
      return code;
    },
    checkCode(userId, given, now = Date.now()) {
      const issued = codes.get(userId);
      if (!issued || issued.expires < now || issued.code !== String(given).trim()) return false;
      codes.delete(userId);
      return true;
    },
    inbox: (userId) => mail.get(userId) ?? [],
  };
}
