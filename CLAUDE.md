# Hangar Supply API

This repo turns a web UI into an API. Hangar Supply is a vendor portal with
invoices behind a sign-in and a one-time code, and no API. `GET /invoices` on
a Fly Machine returns those invoices as JSON.

How it works: you explore the portal once, write down how to get the invoices
(`tasks/invoices.json`), and Anchor compiles that into a task: deterministic
Playwright steps that run with no model in the loop. The API runs that task.
When the portal changes, the task breaks. Anchor may heal it, and you review
the fix; or you explore again and recompile.

You are working on a Fly.io Sprite. The browser is not here: it is an Anchor
session on the public internet, already signed in to Hangar Supply through a
saved browser profile.

## Layout

- `tasks/invoices.json` — the spec: the prompt Anchor compiles, the input and
  output schema, and which task and version it compiled to. You edit this.
- `tasks/invoices.workflow.json` — the compiled code, mirrored from Anchor.
  Written by `compile`, `pull` and `promote`. Do not edit it by hand.
- `integration/invoices.mjs` — the contract: what `GET /invoices` promises.
  Callers depend on it. Do not change it to make a broken run pass.
- `integration/` — the commands below, and the anchorbrowser SDK calls.
- `api/` — the API on the Fly Machine.
- `heal/` — the service on this Sprite that starts you when something breaks.
- `site/` — the source of Hangar Supply, for people hosting their own. Do not
  read it to work out how the portal behaves, and do not change it: treat the
  portal as someone else's website. Work from what the browser shows you.

## Commands

- `npm run look -- /some/path` — print a portal page as an accessibility
  outline and save `artifacts/look.png`. Use this to see the portal.
- `npm run compile` — compile `tasks/invoices.json` into a new Anchor task.
  Takes a minute or two.
- `npm run call` — run the task once and check its output against the
  contract. This is the check that matters.
- `npm run pull -- --draft` — mirror a draft version (for example one Anchor's
  self-heal made) into `tasks/invoices.workflow.json`.
- `npm test` — unit tests.

## Definition of done

A change is done when `npm run call` passes twice, a few minutes apart, and
the PR shows the diff in `tasks/`. One green run does not mean it works.

A call that exits 3 has drifted: Anchor's AI fallback rescued the run, so the
data came back, but the compiled steps no longer match the portal. That is not
a pass. Recompile until calls pass without it.

When a call fails, read the message, the run and session ids, and look at the
portal yourself before changing anything.

## Rules

- Never ask for, read, or handle the Hangar Supply password or sign-in codes.
  Do not read `.env`: it holds the lab account's password and the keys. If
  the profile is signed out, stop and ask a person to run `npm run connect`.
- Describe pages by role, label and visible text. The portal has no ids or
  test hooks.
- Each look, compile and call costs an Anchor session. Look first, then change
  the spec, then compile and call.
- Do not merge your own PR. Merging is what promotes the fix to production.
