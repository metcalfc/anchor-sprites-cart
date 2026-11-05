# Anchor post: outline

A suggested shape for Anchor to rewrite, from Chad's email of 20 Oct. The
claims about Anchor here come from anchorbrowser.io, the public docs and from
running the lab. Anchor will know better.

**Working title:** Explore once, compile to code, heal on change.

**Reader:** a developer building on a web UI with no API, who has tried having
an LLM drive every click and watched the bill and the latency.

**The one point:** use the LLM to write the automation, not to be the
automation.

## Voice

- The product is "browser agents" and "computer environments for AI agents".
  The job is a "web task" on "any website".
- Humanized, authenticated, secure.
- Reliability said plainly: "boringly completing tasks", workflows kept "as
  deterministic code".
- Anchor's own numbers are Anchor's to use.

## 1. Hook

Having an LLM drive every click in production is slow and expensive, and it is
different every time.

## 2. The idea

Use the LLM once, to explore and write the automation. Run the result as
code. Bring the LLM back only when the page changes.

## 3. Auth

A person signs in once through the live view, password and emailed code. The
session is kept as a browser profile; every run after that starts signed in.
The agent reuses the session and never sees the password. Mention identities
for when a person should not have to come back.

## 4. Exploration

The agent maps the portal in the live view. Hero GIF.

## 5. Compilation

The flow becomes deterministic code: the Tasks API turns a prompt (and a
session) into Playwright steps. This is the Action Index story. Show a
segment: the instruction and the code under it.

## 6. The redesign

The button moves, the labels change, the dates are formatted differently. The
run fails, and self-heal finds the flow again and writes a new version, with
an explanation and a confidence score. Second GIF.

The draft goes out as a `task.healed` webhook. Link to Fly.io's post for what
picks it up: a Sprite that wakes, reviews it and opens a PR.

## 7. What made it work

- Persistent auth: profiles, and identities.
- A browser the portal treats like a person.
- Self-healing flows, with a human-reviewable draft rather than a silent change.

## 8. Try it

> The flow ran in Anchor. **Read Fly.io's post** for the computers around it:
> the Sprite that wrote it and comes back to fix it, and the Machine that
> serves it.
>
> Then run the lab: _repo link_.

## Assets

- Live view GIF of exploration.
- Live view GIF of the heal on the redesigned portal.
- The compiled workflow, a segment of it, before and after the heal.
- The `task.healed` payload.
