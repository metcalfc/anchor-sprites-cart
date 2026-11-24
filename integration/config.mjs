import './env.mjs';

export const siteUrl = (process.env.SITE_URL ?? '').replace(/\/+$/, '');
export const profile = process.env.BROWSER_PROFILE ?? 'hangar';

export function requireSiteUrl() {
  if (!siteUrl) {
    console.error('Set SITE_URL to Hangar Supply, for example https://hangar-supply.fly.dev');
    process.exit(2);
  }
}
