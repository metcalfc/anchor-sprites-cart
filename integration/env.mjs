import { existsSync, readFileSync, writeFileSync } from 'node:fs';

// The lab keeps its keys and its throwaway portal account in .env, which git
// ignores. Importing this module loads it. Variables already set in the
// environment win, so a Fly secret or a test's own value is never overridden.
export const ENV_FILE = process.env.ENV_FILE ?? '.env';
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

// Sets NAME=value lines in a dotenv file: replaces a name that is already
// there, appends one that is not, and leaves every other line alone.
export function saveEnv(values, file = ENV_FILE) {
  const lines = existsSync(file) ? readFileSync(file, 'utf8').replace(/\n$/, '').split('\n') : [];
  for (const [name, value] of Object.entries(values)) {
    const line = `${name}=${value}`;
    const at = lines.findIndex((l) => l.startsWith(`${name}=`));
    if (at === -1) lines.push(line);
    else lines[at] = line;
  }
  writeFileSync(file, `${lines.join('\n')}\n`, { mode: 0o600 });
}
