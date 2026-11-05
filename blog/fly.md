# Fly.io post: outline

**Working title:** Your Sprite writes the integration, a Machine runs it.

**Reader:** a developer who needs data out of a web UI with no API, and has
either been clicking through it every month or maintaining a scraper.

**The one point:** use the model to write the integration, not to be the
integration. That needs two kinds of computer. A Sprite, where an agent can
spend an afternoon exploring and come back when something breaks. A Machine,
which serves the result all day without thinking about it. The browser lives
outside both.

## Voice

How the Sprites page talks, so the post matches it:

- A Sprite is a "Linux computer", "designed for agents". Never a box, a
  container or a sandbox.
- Plain claims about concrete things: "a real disk that survives sleep",
  "snapshot the whole filesystem in about a second", "a request wakes it".
- Dry, short asides. Let the 2009 portal screenshot do most of the joking.
- It sells what a Sprite is. It does not lecture.

## 1. Hook

Hangar Supply: a vendor portal with your invoices behind a login and a code
in your email. No API. Everyone has one. Screenshot of the classic portal, full
width.

## 2. The usual options

Click through it every month. Or hand-write a scraper, which works until the
vendor ships a redesign, which they will not announce.

## 3. The move

An agent on a Sprite explores the portal once, in an Anchor browser, and writes
the integration. One prompt (Part 4 of the lab). Show `npm run look`: the agent
reads the page as an outline of roles and names, not HTML.

## 4. Explore, then compile

The model is on the cold path, not the hot path. The agent writes a spec,
Anchor compiles it into deterministic Playwright steps. Show a segment from
`tasks/invoices.workflow.json`: the instruction, and the code under it. It is
in the repo, so it is reviewable like any other code.

## 5. Ship it

`fly deploy`. `GET /invoices` answers from memory in milliseconds; the Machine
refreshes in the background, by running the compiled task in seconds, not by
asking a model. Show the curl.

## 6. The break

Flip the redesign switch on the portal. Invoices are now "documents" under
Billing, dates are "4 Nov 2026", money is "USD 1,840.00". The refresh fails.
`GET /invoices` keeps serving the last good result, marked stale.

## 7. The heal

A request wakes the Sprite. The heal service starts Claude Code in a fresh
worktree. Anchor has already healed the task into a draft (link to Anchor's
post for how). The agent pulls the draft, checks it against the portal and
the contract, and opens a PR with the diff and the session recording. If no
heal arrives, it explores again and recompiles. Merge, and a workflow promotes
the version and redeploys.

Screenshot of the PR.

## 8. Why it's Fly-shaped

- Sprites build and heal, then sleep. A request wakes one with its disk, its
  repo and its `node_modules` where it left them.
- Checkpoint before you let the agent loose. About a second; restore if it
  makes a mess.
- Machines run forever and do not think.
- The browser lives outside both, at Anchor.

## 9. Credentials

The login lives at Anchor. A person signs in once, in a live view, code and
all. The password never touches the Sprite or the Machine, and the agent
never sees it. The Anchor API key is still an environment variable: say so,
and say Connectors are how that goes away.

## 10. Try it

> You built it. **Read Anchor's post** for what happens inside the browser:
> how the flow was compiled, and how it found the moved button.
>
> Then run the lab: _repo link_.

## Assets

- Hangar Supply, classic and redesigned, side by side.
- Terminal: `npm run look`, `npm run compile`, `npm run call`.
- A segment of the compiled workflow, before and after the heal, as a diff.
- The heal PR.
- curl against the Machine: fresh, then stale, then fresh again.
- What the lab cost, from the Sprites and Anchor usage pages.
