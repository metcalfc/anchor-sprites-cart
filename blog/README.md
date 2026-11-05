# Handshake post: proposal

Two posts, one from Fly.io and one from Anchor, published the same day. Both
start from the same example, this repo, and each tells its own half. Each ends
by sending the reader to the other.

Agreed with Anchor (Gabi, 20 Oct): **"Turn any web UI into an API."** Explore
once, compile to code, heal on change. The repo uses the anchorbrowser SDK for
session start and stop, and Anchor's post features Action Index and auth
profiles.

## The example

Every team has a tool with no API: a vendor portal, a legacy admin panel, a
dashboard where the only export is behind a login and MFA. Hangar Supply is
one: a made-up vendor portal, shipped in this repo, with invoices behind a
password and a one-time code.

An agent on a Sprite explores it once in an Anchor browser and writes down how
to get the invoices. Anchor compiles that into a task of deterministic
Playwright steps. A small service on a Fly Machine serves `GET /invoices` as
JSON. Then we redesign the portal mid-demo. The next run fails, Anchor heals
the task into a draft, a Sprite wakes up, checks the fix, and opens a PR.
Merge, and it is live.

Hangar Supply keeps the lab clean on terms of service. The posts frame real use
as portals you are allowed to automate.

## The split

| | Fly.io post | Anchor post |
| --- | --- | --- |
| Title | Your Sprite writes the integration, a Machine runs it | Explore once, compile to code, heal on change |
| Its subject | The computers: one that builds and heals, one that serves | The browser and the compiled task |
| Lab parts it owns | 2 (Sprite), 4 (the agent explores), 5 (Machine), 6 (wake on failure) | 3 (sign in once, MFA and all), 4 (compile), 7 (self-heal) |
| Outline | [fly.md](fly.md) | [anchor.md](anchor.md) |

The heal is told from both sides, and that is the handshake. Anchor's
self-heal finds the moved button and writes a draft. The Sprite reviews it
against the contract and turns it into a PR a person can merge. If Anchor
cannot heal it, the Sprite explores again and recompiles. Each post tells its
own half of that moment and links to the other.

## What is shared

- **The example**, the repo, and the before/after screenshots of Hangar Supply.
- **The opening.** The same few sentences in both: every team has a tool with
  no API; you have been clicking through it, or you wrote a scraper that broke.
- **One fact both sides get to say.** The login lives at Anchor. A person signs
  in once, code and all, and the agent never sees the password.
- **The turning point.** The redesign. Same request, nothing changed on our
  side, and the run fails.
- **The closing.** The same "other half" box at the bottom of each post, with
  the link to the other post first and the repo second.

## How the repo maps to the products

| Step | What runs | Product |
| --- | --- | --- |
| Sign in once | `npm run connect`: live view, password and code typed by a person | Anchor profiles |
| Explore | `npm run look`: accessibility outline and screenshot, on the Sprite | Sprite + Anchor session |
| Compile | `npm run compile`: `POST /v2/tasks/generate` | Anchor Tasks |
| Serve | `api/server.js`: runs the task with `POST /v2/tasks/{id}/run` in a profile session | Fly Machine + Anchor Tasks |
| Break | Account → Switch to the new design | Hangar Supply |
| Heal | Anchor `task.healed` webhook → `heal/server.mjs` wakes the Sprite → Claude Code reviews the draft, opens a PR | Anchor self-heal + Sprite |
| Promote | Merge → `.github/workflows/promote.yml` publishes the version and runs `fly deploy` | GitHub + Fly |

## What we found running it (5 Nov)

- `generateTask` took about 80 seconds. A run took 8–30 seconds. So `GET
  /invoices` answers from memory and refreshes in the background. Say
  "milliseconds" only about the cached GET.
- A task's code can be fetched (`GET /v1/task/{id}/latest`). It is JSON: one
  segment per step, each with its prompt and a Playwright function. That is
  the "show the generated code" moment, and it means a heal is a real diff in
  a PR.
- Both of our test tasks on example.com failed to run: one with a
  validation error at the root (no input parameters), and one where the AI
  fallback reported no `<h1>` on example.com. Neither produced a healed
  version. We have not yet run it end to end against Hangar Supply.

## To ask Anchor

1. **Action Index vs Tasks.** The repo uses the v2 Tasks API (`generate`, `run`,
   `task.healed`). Is that Action Index, or should the hot path call
   `run_action` from the Actions MCP server? Can a private domain like Hangar
   Supply have Action Index items?
2. **Promoting a healed draft.** `task.healed` says `published_as_draft`. What
   is the supported way to publish it from code? The repo uses
   `POST /v1/task/{id}/deploy` with the draft's code, which is a legacy
   endpoint and only lists `typescript`.
3. **Does self-heal need turning on?** Our failed runs had `aiFallbackEnabled:
   true` but no heal and no `healedTaskVersionId`.
4. **Profiles in tasks.** We start a session with the profile and pass its
   `session_id` to the run. Is `task_browser_default_configuration` with a
   profile the better way?
5. **The two example.com failures** above: known issue, or our mistake?
6. The GIFs for their post: the live view of exploring, and of the redesign.

## Still to agree

- Publish date, and who posts first on the day.
- Where the repo lives, and the public address for Hangar Supply.
- The shared opening and closing text, word for word.
- How each side says the Anchor Connector is coming without promising a date.
- Tracking on the cross-links.
