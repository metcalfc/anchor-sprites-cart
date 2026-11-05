// Shows what a Hangar Supply page looks like right now, signed in.
//
//   npm run look -- /invoices
//
// Prints the page as an accessibility outline (roles, names and text) and
// saves a screenshot to artifacts/look.png. Read this, not the HTML.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { openBrowser } from './anchor.mjs';
import { profile, requireSiteUrl, siteUrl } from './config.mjs';

requireSiteUrl();
const path = process.argv[2] ?? '/';
mkdirSync('artifacts', { recursive: true });

const { page, sessionId, close } = await openBrowser({ profile });
let exitCode = 0;
try {
  await page.goto(`${siteUrl}${path}`, { waitUntil: 'domcontentloaded' });
  console.log(`${page.url()}\n`);
  console.log(await page.locator('body').ariaSnapshot({ timeout: 10_000 }));
  const shot = join('artifacts', 'look.png');
  await page.screenshot({ path: shot, fullPage: true });
  console.log(`\nscreenshot: ${shot}`);
  if (sessionId) console.log(`session:    ${sessionId}  (npm run compile -- --from ${sessionId})`);
} catch (error) {
  exitCode = 1;
  console.error(`look failed: ${error.message}`);
} finally {
  await close().catch(() => {});
}
process.exit(exitCode);
