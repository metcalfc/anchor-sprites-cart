# Turn any web UI into an API

Every team has a tool with no API: a vendor portal, a legacy admin panel, a
dashboard whose only export is behind a login and MFA. This repo turns one into
an API, and keeps it working when the portal changes.

**Hangar Supply** is a vendor portal (made up, and in this repo) with invoices
behind a password and a one-time code. It has no API. At the end of this lab:

```console
$ curl https://hangar-invoices-api.fly.dev/invoices
{"fetchedAt":"…","invoices":[{"number":"HS-10480","issued":"2026-11-02","amount":"1840.00","status":"open",…},…]}
```

How it gets there:

1. **Explore once.** A coding agent on a [Fly.io Sprite](https://sprites.dev)
   looks at the portal through an [Anchor](https://anchorbrowser.io) browser,
   and writes down how to get the invoices.
2. **Compile.** Anchor compiles that into a task: deterministic Playwright
   steps. The model is on the cold path, not the hot path.
3. **Serve.** A small API on a Fly Machine runs the task and serves JSON.
4. **Heal.** Redesign the portal. The next run fails. Anchor heals the task
   into a draft, the Sprite wakes up, reviews the fix, and opens a PR. Merge it
   and the fix is live.

The password is typed once, by a person, into a browser at Anchor. It never
reaches the Sprite, the Machine, or the agent.

This repo is the shared example for two posts:

- **Fly.io:** _link to come_ — your Sprite writes the integration, a Machine runs it.
- **Anchor:** _link to come_ — explore once, compile to code, heal on change.

## What is here

| Path | What it is |
| --- | --- |
| `site/` | Hangar Supply, the portal. Two designs: classic, and the redesign. |
| `tasks/` | The spec the agent writes, and the code Anchor compiles it into. |
| `integration/` | Commands: `connect`, `look`, `compile`, `call`, `pull`, `promote`. |
| `api/` | `GET /invoices`, on a Fly Machine. |
| `heal/` | Runs on the Sprite. Wakes the agent when the task breaks. |
| `CLAUDE.md` | What the agent is told about the job. |

## Part 1: get a vendor account

Open Hangar Supply at `<site URL>` and choose **Register for portal access**.
Use a made-up email and a password you do not use anywhere else. Sign out and
back in: you get a code in **Hangar Mail**, the portal's stand-in for your
inbox.

## Part 2: a Sprite for the agent

```bash
curl -fsSL https://sprites.dev/install.sh | sh
sprite login
sprite create hangar
```

On the Sprite:

```bash
git clone <your fork of this repo> hangar && cd hangar
npm install
npm test
export SITE_URL=<site URL> ANCHOR_API_KEY=...
```

## Part 3: sign the browser in

```bash
npm run connect
```

It prints a live view URL. Open it, sign in, and type the code from Hangar
Mail. The session is saved as an Anchor browser profile. Everything after this
starts signed in. The password went from your keyboard to a browser at Anchor
and nowhere else.

## Part 4: explore once, compile

Start Claude Code on the Sprite:

```bash
claude
```

> Turn Hangar Supply's invoices into an API. Look at the portal, update
> tasks/invoices.json, compile it, and call it until it passes twice.

The agent runs `npm run look` to read the portal, writes the spec, and runs
`npm run compile`. Anchor turns the spec into a task in a minute or two. Open
`tasks/invoices.workflow.json`: each step has the instruction it came from and
the Playwright code that does it. Then `npm run call` runs the task once,
checks the output against the contract in `integration/invoices.mjs`, and
prints the eight invoices and how long the run took.

Take a checkpoint before you let the agent loose, so you can roll back:
`sprite checkpoint create --comment "compiled"`.

## Part 5: ship it on a Machine

```bash
fly launch --copy-config --no-deploy
fly secrets set ANCHOR_API_KEY=... SITE_URL=... API_TOKEN=$(openssl rand -hex 16)
fly deploy
curl -H "authorization: Bearer $API_TOKEN" https://<app>.fly.dev/invoices
```

The Machine refreshes in the background and answers from memory, so `GET
/invoices` takes milliseconds. A refresh takes seconds and runs the compiled
task, with no model in the loop.

## Part 6: wire up the heal

On the Sprite, run the heal service and give it a public URL. Anchor's
webhooks have to reach it.

```bash
export HEAL_TOKEN=$(openssl rand -hex 16)
sprite-env services create heal --cmd "$(which node)" --args heal/server.mjs --dir "$PWD" --http-port 8080
```

Make the Sprite's URL public (`sprite url` in the Sprites docs; the service
checks every request itself). Then:

- On the Machine: `fly secrets set HEAL_URL=<sprite URL> HEAL_TOKEN=<same token>`.
- At Anchor: create a webhook to `<sprite URL>/anchor` for `task.failed` and
  `task.healed`, and set its signing secret on the Sprite as
  `ANCHOR_WEBHOOK_SECRET`.
- In GitHub: add `ANCHOR_API_KEY` and `FLY_API_TOKEN` as repo secrets, for
  `.github/workflows/promote.yml`. Make sure `gh` is signed in on the Sprite.

## Part 7: redesign the portal

In your own browser, open Hangar Supply, go to **My Account** and click
**Switch to the new design**. Invoices are now "documents" under Billing, with
new words, new dates and new money formatting. Then:

```bash
curl -X POST -H "authorization: Bearer $API_TOKEN" https://<app>.fly.dev/invoices/refresh
```

It fails. `GET /invoices` keeps serving the last good result, marked `stale`.
Then:

1. Anchor reports `task.failed`, tries to heal the task, and reports
   `task.healed` with a draft and an explanation.
2. The request wakes the Sprite. `heal/server.mjs` starts Claude Code in a fresh
   worktree. It pulls the draft, checks it against the portal and the
   contract, and opens a PR with the diff. If no heal comes within three
   minutes, it explores the portal itself and recompiles.
3. You review the PR and merge it. The promote workflow publishes the version
   and redeploys. The next refresh passes.

Watch it at `<sprite URL>/` and in `data/heal/` on the Sprite.

## Running your own Hangar Supply

The lab uses a hosted Hangar Supply. To host one yourself on a Fly Machine:

```bash
fly launch --config fly.site.toml --copy-config --no-deploy
fly deploy --config fly.site.toml
```

Anchor's browsers are on the public internet, so the portal has to be too.
`SITE_DESIGN=classic` or `SITE_DESIGN=new` pins every account to one design.
For working on the site without Anchor, `BROWSER_MODE=local` makes `look` and
`connect` use a local Chrome; tasks still run at Anchor.

## Clean up

```bash
sprite destroy hangar
fly apps destroy <api app>
```

The browser profile is kept by Anchor under the name `hangar`, and each
compile leaves a task. Delete them from the Anchor dashboard.

## Notes

- Use this on portals you are allowed to automate: your own tools, and vendors
  whose terms permit it. Hangar Supply exists so the lab never touches anyone
  else's site.
- The Anchor API key is an environment variable on the Sprite and the Machine
  for now. The plan is an Anchor Connector, where the Sprite's own identity
  gets the browser and no key is stored on it.
- A Hangar Supply session lasts 30 days. When it expires, the heal service
  opens an issue asking a person to run `npm run connect`. Anchor's managed
  identities can sign back in on their own, codes included; this lab does not
  use them.
