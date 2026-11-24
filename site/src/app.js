import express from 'express';
import {
  PENDING_TTL_MS,
  SESSION_TTL_MS,
  hashPassword,
  readToken,
  signToken,
  verifyPassword,
} from './auth.js';
import { invoicesFor } from './invoices.js';
import { MAX_USERS, createStore } from './store.js';
import { designs, mailPage, notFoundPage } from './views.js';

const SESSION_COOKIE = 'hs_session';
const PENDING_COOKIE = 'hs_pending';

// Each account has its own design, switched under Settings. SITE_DESIGN=classic
// or SITE_DESIGN=new pins every account to one, for working on the site.
export function designFor(user, pinned = process.env.SITE_DESIGN) {
  if (pinned === 'classic' || pinned === 'new') return pinned;
  return user?.design === 'new' ? 'new' : 'classic';
}

export const homePath = (design) => (design === 'new' ? '/home' : '/dashboard');

function readCookie(req, name) {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return undefined;
}

const field = (req, name, max = 200) =>
  String(req.body?.[name] ?? '')
    .trim()
    .slice(0, max);

export function createApp({ dataDir = process.env.SITE_DATA_DIR ?? 'data/site' } = {}) {
  const store = createStore(dataDir);
  const app = express();
  app.disable('x-powered-by');
  // The site sits behind a TLS-terminating proxy.
  app.set('trust proxy', true);
  app.use(express.urlencoded({ extended: false }));

  app.use((req, res, next) => {
    req.user = store.getUser(readToken(store.secret, 'session', readCookie(req, SESSION_COOKIE)));
    req.pendingUser = store.getUser(
      readToken(store.secret, 'pending', readCookie(req, PENDING_COOKIE)),
    );
    req.design = designFor(req.user);
    req.views = designs[req.design];
    next();
  });

  const cookie = (req, res, name, value, maxAge) =>
    res.cookie(name, value, { httpOnly: true, sameSite: 'lax', path: '/', secure: req.secure, maxAge });

  const requireUser = (req, res, next) => {
    if (req.user) return next();
    res.redirect(303, '/login');
  };
  // A page that only exists in one design. In the other it is not there at all.
  const onlyIn = (design) => (req, res, next) => {
    if (req.design === design) return next();
    res.status(404).send(notFoundPage());
  };

  app.get('/healthz', (req, res) => res.type('text').send('ok'));

  app.get('/', (req, res) => res.redirect(302, req.user ? homePath(req.design) : '/login'));

  // Sign in is two steps: the password, then a code sent to Hangar Mail.
  app.get('/login', (req, res) => {
    if (req.user) return res.redirect(303, homePath(req.design));
    res.send(req.views.login({}));
  });

  app.post('/login', (req, res) => {
    const email = field(req, 'email');
    const user = store.findUserByEmail(email);
    if (!user || !verifyPassword(field(req, 'password'), user.password)) {
      return res
        .status(401)
        .send(req.views.login({ email, errors: ['That email and password do not match an account.'] }));
    }
    store.issueCode(user.id);
    cookie(req, res, PENDING_COOKIE, signToken(store.secret, 'pending', user.id, PENDING_TTL_MS), PENDING_TTL_MS);
    res.redirect(303, '/verify');
  });

  app.get('/verify', (req, res) => {
    if (!req.pendingUser) return res.redirect(303, '/login');
    res.send(designs[designFor(req.pendingUser)].verify({}));
  });

  app.post('/verify', (req, res) => {
    const user = req.pendingUser;
    if (!user) return res.redirect(303, '/login');
    const views = designs[designFor(user)];
    if (!store.checkCode(user.id, field(req, 'code', 12))) {
      return res.status(401).send(views.verify({ errors: ['That code is not right, or it has expired.'] }));
    }
    res.clearCookie(PENDING_COOKIE, { path: '/' });
    cookie(req, res, SESSION_COOKIE, signToken(store.secret, 'session', user.id, SESSION_TTL_MS), SESSION_TTL_MS);
    res.redirect(303, homePath(designFor(user)));
  });

  // The inbox for whoever is halfway through signing in, in this browser.
  app.get('/mail', (req, res) => {
    const user = req.pendingUser ?? req.user;
    res.send(mailPage({ email: user?.email, messages: user ? store.inbox(user.id) : [] }));
  });

  const logout = (req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.redirect(303, '/login');
  };
  app.get('/logout', logout);
  app.post('/logout', logout);

  app.get('/signup', (req, res) => {
    if (req.user) return res.redirect(303, homePath(req.design));
    res.send(req.views.signup({}));
  });

  app.post('/signup', (req, res) => {
    const name = field(req, 'name', 60);
    const company = field(req, 'company', 80);
    const email = field(req, 'email');
    const password = field(req, 'password');
    const errors = [];
    if (!name) errors.push('Enter your name.');
    if (!company) errors.push('Enter your company.');
    if (!/^\S+@\S+\.\S+$/.test(email)) errors.push('That does not look like an email address.');
    if (password.length < 8) errors.push('Your password needs 8 or more characters.');
    if (errors.length === 0 && store.findUserByEmail(email)) {
      errors.push('That email already has an account.');
    }
    if (errors.length === 0 && store.userCount() >= MAX_USERS) {
      errors.push('Registration is closed right now. Try again later.');
    }
    if (errors.length > 0) {
      return res.status(400).send(req.views.signup({ name, company, email, errors }));
    }
    const user = store.createUser({ name, company, email, password: hashPassword(password) });
    cookie(req, res, SESSION_COOKIE, signToken(store.secret, 'session', user.id, SESSION_TTL_MS), SESSION_TTL_MS);
    res.redirect(303, homePath(designFor(user)));
  });

  const page = (view) => (req, res) =>
    res.send(req.views[view]({ user: req.user, invoices: invoicesFor() }));

  // Classic
  app.get('/dashboard', requireUser, onlyIn('classic'), page('dashboard'));
  app.get('/settings', requireUser, onlyIn('classic'), page('settings'));
  app.get('/invoices', requireUser, (req, res, next) =>
    req.design === 'new' ? res.send(req.views.moved({ user: req.user })) : next(),
  page('invoices'));

  // New
  app.get('/home', requireUser, onlyIn('new'), page('dashboard'));
  app.get('/billing/documents', requireUser, onlyIn('new'), page('invoices'));
  app.get('/billing/payments', requireUser, onlyIn('new'), page('payments'));
  app.get('/account', requireUser, onlyIn('new'), page('settings'));

  app.post('/settings/design', requireUser, (req, res) => {
    const design = field(req, 'design') === 'new' ? 'new' : 'classic';
    store.updateUser(req.user.id, { design });
    res.redirect(303, homePath(designFor(store.getUser(req.user.id))));
  });

  app.use((req, res) => {
    res.status(404).send(notFoundPage());
  });

  return app;
}
