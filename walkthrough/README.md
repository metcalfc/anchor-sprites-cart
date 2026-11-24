# Walkthrough: the whole loop, by hand

This runs the lab from a laptop with only an Anchor API key: no Sprite, no
Machine, no heal service. You compile the task, break it by redesigning the
portal, see the drift, and heal it, one command at a time.

`classic/` and `healed/` have the spec and compiled code from our own run on
5 Nov 2026, before and after the agent healed the task for the redesign. Use
them to compare with your result, or to heal by hand. Their task ids belong to
our Anchor account, so they won't run with your key; step 2 compiles your own.

## 0. Set up

Node 22 or later.

```bash
npm install
npm test
cp .env.example .env             # then set ANCHOR_API_KEY in it
```

## 1. Sign the browser in, once

```bash
npm run connect
```

It registers a throwaway Hangar Supply account, saves it to `.env`, and signs
an Anchor browser profile called `hangar` in with it, reading the one-time
code from **Hangar Mail**. Each account has its own design switch, so nothing
you do here affects anyone else. Set `BROWSER_PROFILE` to use another profile
name, or add `-- --live` to sign in yourself through Anchor's live view.

## 2. Explore and compile

```bash
npm run look -- /invoices    # the page as the agent sees it: an accessibility outline
npm run compile              # tasks/invoices.json -> a new Anchor task in your account (~80s)
```

`compile` updates `tasks/invoices.json` with your task id and writes the
generated code to `tasks/invoices.workflow.json`. Read that file: each segment
has its instruction and the Playwright code that does it.

## 3. Call it

```bash
npm run call
```

Expect eight invoices in about 6–10s, exit 0. Run it again a few minutes
later; it should pass both times.

## 4. Redesign the portal

```bash
npm run design -- new
```

That's **My Account** → **Switch to the new design**, done in the signed-in
profile. Invoices are now under Billing → Documents, as cards, with new date,
money and status formats.

## 5. See the drift

```bash
npm run call; echo "exit $?"
```

You still get eight correct invoices, but in about 30s, and it exits **3**:

```
call drifted: the run needed the AI fallback. The compiled steps no longer match the portal; recompile.
```

The compiled steps no longer match, so Anchor's AI fallback finished the run.
The API would keep working, but with a model on every request.

## 6. Heal it

Pick one.

**a. With an agent** (what the Sprite does). In this directory, run:

```bash
claude
```

> The Hangar Supply invoices task has drifted: `npm run call` exits 3
> because the run needs Anchor's AI fallback. Look at the portal with
> `npm run look`, update the prompt in tasks/invoices.json to describe the
> portal as it is now, keep the output contract in integration/invoices.mjs
> exactly as it is, then `npm run compile` and `npm run call` twice a few
> minutes apart. Both must pass without the fallback.

**b. By hand.** Use the spec our agent wrote, and compile it in your account:

```bash
cp walkthrough/healed/invoices.json tasks/invoices.json
npm run compile
```

## 7. Check the heal

```bash
npm run call; echo "exit $?"
```

Expect eight invoices in about 6s, exit 0, no fallback. Compare your compiled
code with ours (`walkthrough/classic/` is ours from before the redesign):

```bash
diff <(jq .workflow tasks/invoices.workflow.json) <(jq .workflow walkthrough/healed/invoices.workflow.json)
```

The code won't match line for line (each compile is generated fresh), but it
should do the same thing: go to `/billing/documents` and read the list of
cards.

## 8. Optional: the API and the heal service, locally

This is how we ran the end-to-end test. You need a git remote and `gh`
signed in, because the heal ends in a PR.

```bash
export HEAL_TOKEN=$(openssl rand -hex 16)
PORT=8093 node heal/server.mjs &
PORT=8092 HEAL_URL=http://localhost:8093 node api/server.js &
curl -X POST localhost:8092/invoices/refresh   # on a drifted portal: data comes back marked "drift"
curl localhost:8093/                           # the heal service has started Claude Code
```

## Reset

```bash
npm run design -- classic
git checkout tasks/
```

Then delete the `hangar` profile and the compiled tasks in the Anchor
dashboard.
