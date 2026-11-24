# Turn any web UI into an API

Hangar Supply is a vendor portal with invoices behind a password and an emailed
code, and no API. In this lab you turn it into `GET /invoices`:

- An agent on a [Fly.io Sprite](https://sprites.dev) explores the portal once
  and writes down how to get the invoices.
- [Anchor](https://anchorbrowser.io) compiles that into Playwright code that
  runs with no model in the loop.
- A Fly Machine serves the result as JSON.
- When the portal is redesigned, the Machine notices, the Sprite wakes up,
  recompiles, and opens a pull request. You merge it.

Hangar Supply is a made-up portal that ships in this repo, so the lab never
touches anyone else's site. A public copy runs at
`https://hangar-supply.fly.dev`.

## What you need

- A [Fly.io](https://fly.io) account, with `fly` installed and signed in
  (`fly auth login`).
- [Sprites](https://sprites.dev), with `sprite` installed and signed in
  (`sprite login`).
- An Anchor API key from
  [app.anchorbrowser.io/api-keys](https://app.anchorbrowser.io/api-keys).
- A GitHub account, with `gh` installed and signed in.
- Node 22 or later, and [Claude Code](https://claude.com/claude-code).

Your keys go in one file, `.env`, which git ignores. Fly, Sprites and GitHub
keep their own sign-ins; nothing else is exported.

## 1. Fork, clone, and add your key

```bash
gh repo fork superfly/anchor-sprites-cart --clone && cd anchor-sprites-cart
npm install && npm test
cp .env.example .env
```

Open `.env` and set `ANCHOR_API_KEY`. That's the only thing you type in.

## 2. Sign the browser in

```bash
npm run connect
```

This registers a throwaway Hangar Supply account (a made-up
`lab-…@example.com` and a random password), signs an Anchor browser profile
called `hangar` in with it, code from Hangar Mail and all, and saves the
account to `.env`. It also makes the two tokens later steps need.

From now on every Anchor session starts signed in. The agent never sees the
password. (To sign in yourself through Anchor's live view, the way you would
for a real portal, use `npm run connect -- --live`.)

## 3. Explore and compile

Start Claude Code in the repo and ask:

```bash
claude
```

> Turn Hangar Supply's invoices into an API. Look at the portal, update
> tasks/invoices.json, compile it, and call it until it passes twice.

`CLAUDE.md` tells it how. Or do it by hand:

```bash
npm run look -- /invoices   # the page as the agent sees it
npm run compile             # tasks/invoices.json -> an Anchor task (about 80s)
npm run call                # run it once and check it against the contract
```

A call that passes prints eight invoices in 6–10 seconds. Run it again a few
minutes later; one green run doesn't count.

`compile` adds your task id to `tasks/invoices.json` and writes the generated
code to `tasks/invoices.workflow.json`. Read it: each step has its instruction
and the Playwright that does it. Commit both, because the Machine and the
Sprite run what's on `main`:

```bash
git add tasks && git commit -m "Compile the invoices task" && git push
```

## 4. Serve it from a Machine

```bash
export APP=hangar-api-$(whoami)             # any name that's free on Fly
fly launch --copy-config --no-deploy --name $APP
grep -E '^(ANCHOR_API_KEY|SITE_URL|API_TOKEN)=' .env | fly secrets import
fly deploy
```

Then:

```bash
source .env
curl -H "authorization: Bearer $API_TOKEN" https://$APP.fly.dev/invoices
```

The Machine runs the task every 30 minutes and serves the last good result,
so `GET` never waits on a browser.

## 5. Set up the Sprite

The Sprite is where the agent lives. It needs the repo, your `.env`, and
Claude Code and `gh` signed in.

```bash
sprite create hangar --skip-console
sprite exec -s hangar -- git clone https://github.com/<you>/anchor-sprites-cart hangar
sprite exec -s hangar -- sh -c 'cat > hangar/.env' < .env
sprite console -s hangar
```

On the Sprite:

```bash
cd hangar && npm ci
gh auth login && gh auth setup-git   # so the agent can push a branch and open a PR
claude                              # sign in, then /exit
sprite-env services create heal --cmd "$(which node)" --args heal/server.mjs --dir "$PWD" --http-port 8080
exit
```

## 6. Connect the Machine to the Sprite

Make the Sprite's URL public (the heal service checks `HEAL_TOKEN` on every
report), and tell the Machine where it is:

```bash
sprite config update -s hangar --url-auth public
fly secrets set HEAL_URL=$(sprite info -s hangar | grep -o 'https://[^ ]*') $(grep '^HEAL_TOKEN=' .env)
```

## 7. Break it

Switch the portal to its redesign. Invoices move to Billing → Documents, as
cards, with new date, money and status formats:

```bash
npm run design -- new
curl -X POST -H "authorization: Bearer $API_TOKEN" https://$APP.fly.dev/invoices/refresh
```

The data still comes back, because Anchor's AI fallback finishes the run, but
the response is marked `drift`: a model is back on every request. The Machine
tells the Sprite. Watch it at the Sprite's URL:

```bash
curl -s $(sprite info -s hangar | grep -o 'https://[^ ]*')/
```

In about ten minutes the agent has looked at the new portal, recompiled the
task, called it twice, and opened a pull request on your fork.

## 8. Merge it

Read the PR: the diff in `tasks/` is the fix. Merge it, then:

```bash
git pull && fly deploy
```

The API is back to deterministic runs. (To deploy on merge instead, add
`ANCHOR_API_KEY` and `FLY_API_TOKEN` as secrets on your fork;
`.github/workflows/promote.yml` does the rest.)

## Clean up

```bash
sprite destroy hangar
fly apps destroy $APP
```

In the Anchor dashboard, delete the `hangar` browser profile and the tasks
the lab created.

## More

- **Without a Sprite or a Machine.** [walkthrough/](walkthrough/README.md)
  runs the whole loop from your laptop, one command at a time, with only an
  Anchor key. It also has the tasks we compiled, before and after the
  redesign, to compare with yours.
- **Host your own Hangar Supply.** Anchor's browsers are on the public
  internet, so the portal has to be too:

  ```bash
  fly launch --config fly.site.toml --copy-config --no-deploy
  fly deploy --config fly.site.toml
  ```

  Then set `SITE_URL` in `.env` to your copy.
- **Anchor's webhooks.** Anchor can also send `task.failed` and `task.healed`
  to `<sprite URL>/anchor`. Set the signing secret as `ANCHOR_WEBHOOK_SECRET`
  in the Sprite's `.env`, then restart the heal service.
- **Only automate portals you're allowed to.**
