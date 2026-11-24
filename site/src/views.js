// Hangar Supply has two designs, and both are in production.
//
// "classic" is the portal as it has looked since 2009: a blue header, tabs, and
// grey tables. "new" is the redesign: a sidebar, cards, and different words for
// everything. Each account picks one under Settings, so the redesign lands on
// whoever flips the switch, and nobody else.
//
// Neither design has ids, test hooks or an API. That is the point.

export const PORTAL = 'Hangar Supply';

const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2026-03-04" -> "03/04/2026"
const usDate = (iso) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
// "2026-03-04" -> "4 Mar 2026"
const longDate = (iso) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
// "1234.50" -> "1,234.50"
const grouped = (amount) => {
  const [whole, cents] = amount.split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${cents}`;
};

const errorList = (errors = []) =>
  errors.length ? `<ul class="errors">${errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : '';

// ---------------------------------------------------------------- classic --

const CLASSIC_STATUS = { paid: 'Paid', open: 'Open', overdue: 'OVERDUE' };

function classicPage({ title, user, tab, body }) {
  const tabs = user
    ? [
        ['/dashboard', 'Home'],
        ['/invoices', 'Invoices'],
        ['/settings', 'My Account'],
      ]
        .map(
          ([href, label]) =>
            `<a href="${href}"${tab === label ? ' class="on"' : ''}>${label}</a>`,
        )
        .join('')
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(title)} - Hangar Supply Co. Vendor Portal</title>
<style>
body { margin: 0; background: #dfe4ea; font: 12px/1.4 Verdana, Geneva, sans-serif; color: #222; }
.top { background: linear-gradient(#2d5a8c, #1b3a5e); color: #fff; padding: 10px 16px; border-bottom: 3px solid #f2b705; }
.top b { font: bold 18px Georgia, serif; letter-spacing: .5px; }
.top span { float: right; font-size: 11px; padding-top: 4px; }
.top span a { color: #ffe68a; }
.tabs { background: #c8d1db; padding: 0 12px; border-bottom: 1px solid #8a99aa; }
.tabs a { display: inline-block; padding: 6px 14px; color: #1b3a5e; text-decoration: none; font-weight: bold; border: 1px solid transparent; border-bottom: 0; margin-top: 4px; }
.tabs a.on { background: #fff; border-color: #8a99aa; }
.wrap { background: #fff; margin: 12px; padding: 12px 16px 20px; border: 1px solid #8a99aa; max-width: 900px; }
h1 { font: bold 16px Georgia, serif; color: #1b3a5e; border-bottom: 1px dotted #8a99aa; padding-bottom: 4px; }
table.grid { border-collapse: collapse; width: 100%; }
table.grid th { background: #e8edf2; text-align: left; border: 1px solid #b8c3cf; padding: 4px 6px; }
table.grid td { border: 1px solid #d2d9e0; padding: 4px 6px; }
table.grid tr:nth-child(even) td { background: #f6f8fa; }
td.num { text-align: right; font-family: "Courier New", monospace; }
.overdue { color: #b00; font-weight: bold; }
.errors { color: #b00; }
.foot { color: #778; font-size: 10px; margin: 0 12px 20px; }
input[type=text], input[type=email], input[type=password] { width: 220px; }
</style>
</head>
<body>
<div class="top"><b>HANGAR SUPPLY CO.</b> &nbsp;Vendor Portal${
    user ? `<span>Logged in as ${esc(user.email)} | <a href="/logout">Log Out</a></span>` : ''
  }</div>
<div class="tabs">${tabs}&nbsp;</div>
<div class="wrap">
${body}
</div>
<div class="foot">&copy; 2009-2026 Hangar Supply Co. Best viewed in Internet Explorer 8 or later at 1024x768.</div>
</body>
</html>`;
}

const classic = {
  login: ({ email = '', errors }) =>
    classicPage({
      title: 'Log In',
      body: `<h1>Vendor Log In</h1>
${errorList(errors)}
<form method="post" action="/login">
<table>
<tr><td><label for="e">E-mail Address:</label></td><td><input id="e" type="email" name="email" value="${esc(email)}"></td></tr>
<tr><td><label for="p">Password:</label></td><td><input id="p" type="password" name="password"></td></tr>
<tr><td></td><td><input type="submit" value="Log In"></td></tr>
</table>
</form>
<p>New vendor? <a href="/signup">Register for portal access</a>.</p>`,
    }),

  verify: ({ errors }) =>
    classicPage({
      title: 'Security Check',
      body: `<h1>Security Check</h1>
<p>For your protection, we have sent a 6-digit security code to the e-mail address on file.
Check your <a href="/mail" target="_blank">Hangar Mail</a> inbox.</p>
${errorList(errors)}
<form method="post" action="/verify">
<label for="c">Security Code:</label> <input id="c" type="text" name="code" inputmode="numeric" autocomplete="one-time-code">
<input type="submit" value="Submit">
</form>`,
    }),

  signup: ({ name = '', company = '', email = '', errors }) =>
    classicPage({
      title: 'Register',
      body: `<h1>Vendor Registration</h1>
${errorList(errors)}
<form method="post" action="/signup">
<table>
<tr><td><label for="n">Contact Name:</label></td><td><input id="n" type="text" name="name" value="${esc(name)}"></td></tr>
<tr><td><label for="o">Company:</label></td><td><input id="o" type="text" name="company" value="${esc(company)}"></td></tr>
<tr><td><label for="e">E-mail Address:</label></td><td><input id="e" type="email" name="email" value="${esc(email)}"></td></tr>
<tr><td><label for="p">Password:</label></td><td><input id="p" type="password" name="password"> (8 characters minimum)</td></tr>
<tr><td></td><td><input type="submit" value="Register"></td></tr>
</table>
</form>`,
    }),

  dashboard: ({ user, invoices }) => {
    const open = invoices.filter((i) => i.status !== 'paid');
    return classicPage({
      title: 'Home',
      user,
      tab: 'Home',
      body: `<h1>Welcome, ${esc(user.name)}</h1>
<p>Account: <b>${esc(user.company)}</b></p>
<p>You have <b>${open.length}</b> unpaid invoice(s). <a href="/invoices">View all invoices</a>.</p>
<p><i>Notice: Online statements are now available. Paper statements will be discontinued after 12/31/2011.</i></p>`,
    });
  },

  invoices: ({ user, invoices }) =>
    classicPage({
      title: 'Invoices',
      user,
      tab: 'Invoices',
      body: `<h1>Invoices</h1>
<table class="grid">
<caption style="text-align:left;padding-bottom:6px">Showing ${invoices.length} invoices for ${esc(user.company)}</caption>
<tr><th>Invoice #</th><th>Invoice Date</th><th>Due Date</th><th>Description</th><th>Amount</th><th>Status</th></tr>
${invoices
  .map(
    (i) =>
      `<tr><td>${esc(i.number)}</td><td>${usDate(i.issued)}</td><td>${usDate(i.due)}</td><td>${esc(i.description)}</td><td class="num">$${grouped(i.amount)}</td><td${i.status === 'overdue' ? ' class="overdue"' : ''}>${CLASSIC_STATUS[i.status]}</td></tr>`,
  )
  .join('\n')}
</table>`,
    }),

  settings: ({ user }) =>
    classicPage({
      title: 'My Account',
      user,
      tab: 'My Account',
      body: `<h1>My Account</h1>
<p>Contact: ${esc(user.name)}<br>Company: ${esc(user.company)}<br>E-mail: ${esc(user.email)}</p>
<h1>Try the new Hangar Supply</h1>
<p>We have redesigned the portal. Try it today. You can switch back at any time.</p>
<form method="post" action="/settings/design"><input type="hidden" name="design" value="new"><input type="submit" value="Switch to the new design"></form>`,
    }),
};

// -------------------------------------------------------------------- new --

const NEW_STATUS = { paid: 'Settled', open: 'Due', overdue: 'Past due' };

function newPage({ title, user, section, body }) {
  const nav = user
    ? `<nav aria-label="Main">
  <a href="/home"${section === 'Overview' ? ' aria-current="page"' : ''}>Overview</a>
  <details open><summary>Billing</summary>
    <a href="/billing/documents"${section === 'Documents' ? ' aria-current="page"' : ''}>Documents</a>
    <a href="/billing/payments">Payments</a>
  </details>
  <a href="/account"${section === 'Account' ? ' aria-current="page"' : ''}>Account</a>
  <form method="post" action="/logout"><button>Sign out</button></form>
</nav>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Hangar</title>
<style>
:root { --ink: #14181f; --muted: #5d6675; --line: #e3e6eb; --accent: #ff5a1f; }
* { box-sizing: border-box; }
body { margin: 0; font: 15px/1.5 ui-sans-serif, system-ui, sans-serif; color: var(--ink); background: #f7f8fa; display: flex; min-height: 100vh; }
aside { width: 220px; background: #fff; border-right: 1px solid var(--line); padding: 20px 14px; }
aside .brand { font-weight: 800; letter-spacing: -.02em; font-size: 20px; margin: 0 8px 24px; }
aside .brand i { color: var(--accent); font-style: normal; }
nav a, nav summary { display: block; padding: 7px 8px; border-radius: 8px; color: var(--ink); text-decoration: none; cursor: pointer; }
nav details a { padding-left: 22px; }
nav a[aria-current] { background: #fff1eb; color: var(--accent); font-weight: 600; }
nav button { margin-top: 24px; background: none; border: 0; color: var(--muted); padding: 7px 8px; cursor: pointer; font: inherit; }
main { flex: 1; padding: 32px 40px; max-width: 920px; }
h1 { font-size: 26px; letter-spacing: -.02em; margin: 0 0 20px; }
.card { background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 18px 20px; }
ul.docs { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
ul.docs li { display: grid; grid-template-columns: 1fr auto; gap: 4px 16px; }
ul.docs .ref { font-weight: 600; }
ul.docs .meta { color: var(--muted); font-size: 13px; }
ul.docs .total { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
.pill { justify-self: end; font-size: 12px; padding: 2px 10px; border-radius: 99px; background: #eef0f3; }
.pill.due { background: #fff4d6; } .pill.past { background: #ffe1db; color: #a3200b; }
label { display: block; font-weight: 600; margin: 14px 0 4px; }
input[type=email], input[type=password], input[type=text] { width: 100%; max-width: 340px; padding: 9px 11px; border: 1px solid var(--line); border-radius: 8px; font: inherit; }
button.primary { margin-top: 18px; background: var(--ink); color: #fff; border: 0; border-radius: 8px; padding: 9px 18px; font: inherit; font-weight: 600; cursor: pointer; }
.errors { color: #a3200b; }
.solo { margin: 10vh auto; width: 420px; max-width: 92vw; }
</style>
</head>
<body>
${user ? `<aside><div class="brand">hangar<i>.</i></div>${nav}</aside>` : ''}
<main${user ? '' : ' class="solo"'}>
${user ? '' : '<div class="brand" style="font-weight:800;font-size:22px;margin-bottom:24px">hangar<i style="color:var(--accent);font-style:normal">.</i></div>'}
${body}
</main>
</body>
</html>`;
}

const fresh = {
  login: ({ email = '', errors }) =>
    newPage({
      title: 'Sign in',
      body: `<h1>Sign in</h1>
${errorList(errors)}
<form method="post" action="/login" class="card">
<label for="e">Work email</label><input id="e" type="email" name="email" value="${esc(email)}" autocomplete="username">
<label for="p">Password</label><input id="p" type="password" name="password" autocomplete="current-password">
<button class="primary">Continue</button>
</form>
<p>No account yet? <a href="/signup">Request access</a></p>`,
    }),

  verify: ({ errors }) =>
    newPage({
      title: 'Check your email',
      body: `<h1>Check your email</h1>
<p>We sent a verification code to your work email. <a href="/mail" target="_blank">Open Hangar Mail</a></p>
${errorList(errors)}
<form method="post" action="/verify" class="card">
<label for="c">Verification code</label><input id="c" type="text" name="code" inputmode="numeric" autocomplete="one-time-code">
<button class="primary">Verify</button>
</form>`,
    }),

  signup: ({ name = '', company = '', email = '', errors }) =>
    newPage({
      title: 'Request access',
      body: `<h1>Request access</h1>
${errorList(errors)}
<form method="post" action="/signup" class="card">
<label for="n">Your name</label><input id="n" type="text" name="name" value="${esc(name)}">
<label for="o">Company</label><input id="o" type="text" name="company" value="${esc(company)}">
<label for="e">Work email</label><input id="e" type="email" name="email" value="${esc(email)}">
<label for="p">Password</label><input id="p" type="password" name="password">
<button class="primary">Create account</button>
</form>`,
    }),

  dashboard: ({ user, invoices }) => {
    const owed = invoices
      .filter((i) => i.status !== 'paid')
      .reduce((sum, i) => sum + Number(i.amount), 0)
      .toFixed(2);
    return newPage({
      title: 'Overview',
      user,
      section: 'Overview',
      body: `<h1>Good to see you, ${esc(user.name.split(' ')[0])}</h1>
<div class="card"><p>Outstanding balance for ${esc(user.company)}</p><p style="font-size:28px;font-weight:700;margin:0">USD ${grouped(owed)}</p>
<p><a href="/billing/documents">See documents</a></p></div>`,
    });
  },

  invoices: ({ user, invoices }) =>
    newPage({
      title: 'Documents',
      user,
      section: 'Documents',
      body: `<h1>Documents</h1>
<ul class="docs" aria-label="Billing documents">
${invoices
  .map(
    (i) => `<li class="card">
  <span class="ref">${esc(i.number)}</span>
  <span class="total">USD ${grouped(i.amount)}</span>
  <span class="meta">${esc(i.description)} · Issued ${longDate(i.issued)} · Due ${longDate(i.due)}</span>
  <span class="pill${i.status === 'open' ? ' due' : i.status === 'overdue' ? ' past' : ''}">${NEW_STATUS[i.status]}</span>
</li>`,
  )
  .join('\n')}
</ul>`,
    }),

  payments: ({ user }) =>
    newPage({
      title: 'Payments',
      user,
      section: 'Payments',
      body: `<h1>Payments</h1><div class="card"><p>Online payments are coming soon.</p></div>`,
    }),

  // The old Invoices address, after the redesign.
  moved: ({ user }) =>
    newPage({
      title: 'This page has moved',
      user,
      body: `<h1>Invoices have a new home</h1>
<div class="card"><p>Invoices are now called documents, and they live under Billing.</p>
<p><a href="/billing/documents">Go to Billing → Documents</a></p></div>`,
    }),

  settings: ({ user }) =>
    newPage({
      title: 'Account',
      user,
      section: 'Account',
      body: `<h1>Account</h1>
<div class="card"><p>${esc(user.name)} · ${esc(user.company)}<br>${esc(user.email)}</p></div>
<h2>Design</h2>
<form method="post" action="/settings/design" class="card"><p>You are using the new Hangar.</p>
<input type="hidden" name="design" value="classic"><button class="primary">Switch back to classic</button></form>`,
    }),
};

export const designs = { classic, new: fresh };

// Hangar Mail is where the sign-in codes land. It looks the same in both designs.
export function mailPage({ email, messages }) {
  const items = messages.length
    ? messages
        .map(
          (m) =>
            `<article><h2>${esc(m.subject)}</h2><p class="at">${esc(m.at)}</p><p>${esc(m.body)}</p></article>`,
        )
        .join('\n')
    : '<p>No messages.</p>';
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Hangar Mail</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:640px;margin:2rem auto;padding:0 1rem}article{border:1px solid #ddd;border-radius:8px;padding:0 1rem;margin:1rem 0}.at{color:#777;font-size:13px}</style>
</head>
<body>
<h1>Hangar Mail</h1>
<p>Inbox for ${esc(email ?? 'nobody')}. This stands in for your email, so the lab needs no real inbox.</p>
${items}
</body>
</html>`;
}

export function notFoundPage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Not found</title></head>
<body style="font:15px system-ui,sans-serif;margin:3rem"><h1>Page not found</h1><p><a href="/">Hangar Supply</a></p></body></html>`;
}
