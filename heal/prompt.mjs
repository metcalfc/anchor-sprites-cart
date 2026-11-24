// What the agent on the Sprite is told when something breaks. One prompt per
// kind of breakage. CLAUDE.md has the rest: how to look, the contract, the
// rules.

const facts = (event) =>
  Object.entries(event)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `- ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
    .join('\n');

const START = (branch) => `You are in a fresh git worktree on branch ${branch}, made from origin/main.
Run \`npm ci\` first.`;

const FINISH = `Open a pull request with \`gh pr create\`. In the body, say what changed on
Hangar Supply, what you changed and why, the output of your last two
\`npm run call\` runs, and the run and session ids above so a reviewer can find
the recording in the Anchor dashboard. Do not merge it. Merging is what
promotes the fix.`;

export function healPrompt(event, branch) {
  if (event.kind === 'healed') {
    return `Anchor's self-heal fixed the Hangar Supply invoices task after a failed run.
The fix is a draft task version. Your job is to review it and propose it.

${facts(event.details)}

${START(branch)}

Then:
1. \`npm run pull -- --draft\` and read \`git diff tasks/\`. That is the healed code.
2. \`npm run look -- /\` and follow the portal to the invoices yourself. Check the
   healed steps match what the page shows now, and that the output still meets
   the contract in integration/invoices.mjs (ISO dates, plain amounts, status
   paid | open | overdue).
3. If the healed code is wrong or only half right, fix the prompt in
   tasks/invoices.json instead, \`npm run compile\`, and \`npm run call\` twice,
   a few minutes apart.

${FINISH}`;
  }

  if (event.kind === 'drift') {
    return `The Hangar Supply invoices API still works, but its last run needed Anchor's
AI fallback: the compiled steps no longer match the portal, so a model finished
the job. Every run is now slow and uses a model, until the task is recompiled.
Anchor will not heal it, because nothing failed. Your job is to recompile it.

${facts(event.details)}

${START(branch)}

Then:
1. \`npm run call\` to see it for yourself. It exits 3 when the run drifted.
2. \`npm run look -- /\` and follow the portal to the invoices, the way a person
   would. Hangar Supply has probably moved or renamed things.
3. Update the prompt in tasks/invoices.json to describe the portal as it is now.
   Keep the output contract in integration/invoices.mjs exactly as it is: the
   API's callers depend on it.
4. \`npm run compile\`, then \`npm run call\` twice, a few minutes apart. Both
   must pass without the AI fallback.

${FINISH}`;
  }

  return `The Hangar Supply invoices integration is failing and nothing has fixed it.

${facts(event.details)}

${START(branch)}

Then:
1. \`npm run call\` to see the failure for yourself.
2. \`npm run look -- /\` and follow the portal to the invoices, the way a person
   would. Hangar Supply may have moved or renamed things.
3. Update the prompt in tasks/invoices.json to describe the portal as it is now.
   Keep the output contract in integration/invoices.mjs exactly as it is: the
   API's callers depend on it.
4. \`npm run compile\`, then \`npm run call\` twice, a few minutes apart.

${FINISH}`;
}
