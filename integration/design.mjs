// Switches the lab account between Hangar Supply's two designs: the redesign
// is what breaks the compiled task.
//
//   npm run design -- new
//   npm run design -- classic
//
// The same as My Account → Switch to the new design (and back), done in the
// signed-in browser profile, so you don't have to sign in yourself.

import { openBrowser } from './anchor.mjs';
import { profile, requireSiteUrl, siteUrl } from './config.mjs';

requireSiteUrl();
const design = process.argv[2];
if (!['new', 'classic'].includes(design)) {
  console.error('Usage: npm run design -- new | classic');
  process.exit(2);
}

const { page, close } = await openBrowser({ profile });
let exitCode = 0;
try {
  await page.goto(`${siteUrl}/`, { waitUntil: 'domcontentloaded' });
  const res = await page.request.post(`${siteUrl}/settings/design`, { form: { design } });
  if (/\/login/.test(res.url())) throw new Error('the profile is signed out. Run npm run connect.');
  if (!res.ok()) throw new Error(`Hangar Supply answered ${res.status()}.`);
  console.log(design === 'new' ? 'Hangar Supply now shows the new design.' : 'Hangar Supply is back to the classic design.');
} catch (error) {
  exitCode = 1;
  console.error(`design failed: ${error.message}`);
} finally {
  await close().catch(() => {});
}
process.exit(exitCode);
