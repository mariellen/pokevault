/**
 * Tests for the CloudFront viewer-request redirect function that sends any
 * request under the stale `/pokevault-refactor/` prefix to the live site root.
 *
 * Brief: refactor-redirect-cleanup (v3.5.46 infra)
 *
 * These are the *automated* expression of the Opus "Required Tests" gates 1-5.
 * The CloudFront Function file is the production artifact; we load its source
 * and evaluate the `handler` in a sandbox so the deployable file stays pure
 * (no module.exports — CloudFront's cloudfront-js-2.0 runtime forbids it).
 *
 * The *live* gates (curl 301/200, dry-run capture, post-delete `aws s3 ls`)
 * are operational and run via infra/cloudfront/verify-gates.sh against prod,
 * not in jest.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FN_PATH = path.join(REPO_ROOT, 'infra', 'cloudfront', 'redirect-refactor.js');
const DEPLOY_YML = path.join(REPO_ROOT, '.github', 'workflows', 'deploy.yml');

const LIVE_ROOT = 'https://pokevault.mariellen.com.au/';

/** Load the CloudFront `handler` from the pristine production file. */
function loadHandler() {
  const src = fs.readFileSync(FN_PATH, 'utf8');
  const sandbox = {};
  vm.createContext(sandbox);
  // Evaluate the function declaration, then expose handler out of the context.
  vm.runInContext(src + '\n;this.handler = handler;', sandbox);
  return sandbox.handler;
}

/** Build a minimal CloudFront viewer-request event for a given URI. */
function reqEvent(uri) {
  return { request: { uri, method: 'GET', headers: {}, querystring: {} } };
}

describe('CloudFront redirect function file', () => {
  test('the production function file exists', () => {
    expect(fs.existsSync(FN_PATH)).toBe(true);
  });

  test('exposes a callable handler(event)', () => {
    const handler = loadHandler();
    expect(typeof handler).toBe('function');
  });
});

describe('Gate 1 — /pokevault-refactor/* redirects 301 to live root', () => {
  let handler;
  beforeAll(() => { handler = loadHandler(); });

  test('exact file under the prefix → 301 to live root', () => {
    const res = handler(reqEvent('/pokevault-refactor/index.html'));
    expect(res.statusCode).toBe(301);
    expect(res.statusDescription).toBe('Moved Permanently');
    expect(res.headers.location.value).toBe(LIVE_ROOT);
  });

  test('bare prefix without trailing slash → 301 to live root', () => {
    const res = handler(reqEvent('/pokevault-refactor'));
    expect(res.statusCode).toBe(301);
    expect(res.headers.location.value).toBe(LIVE_ROOT);
  });
});

describe('Gate 2 — deep subpaths under the prefix also redirect 301', () => {
  let handler;
  beforeAll(() => { handler = loadHandler(); });

  test('deep nested path → 301', () => {
    const res = handler(reqEvent('/pokevault-refactor/anything/deep/path'));
    expect(res.statusCode).toBe(301);
    expect(res.headers.location.value).toBe(LIVE_ROOT);
  });

  test('asset under the prefix → 301', () => {
    const res = handler(reqEvent('/pokevault-refactor/js/app.js'));
    expect(res.statusCode).toBe(301);
  });
});

describe('Gate 3 & 4 — no over-match: real routes pass through untouched', () => {
  let handler;
  beforeAll(() => { handler = loadHandler(); });

  // Gate 3: the root must NOT be redirected (no loop).
  test('root "/" passes through (returns the request)', () => {
    const ev = reqEvent('/');
    const res = handler(ev);
    expect(res).toBe(ev.request);
    expect(res.statusCode).toBeUndefined();
  });

  // Gate 4: real app routes return 200 / pass through.
  test.each([
    '/index.html',
    '/js/app.js',
    '/js/analyse.js',
    '/css/styles.css',
    '/favicon.ico',
  ])('app route %s passes through', (uri) => {
    const ev = reqEvent(uri);
    expect(handler(ev)).toBe(ev.request);
  });

  // Anchored-match guard: a similarly-named sibling prefix must NOT match.
  test.each([
    '/pokevault-refactored/index.html',
    '/pokevault-refactor-v2/app.js',
    '/other/pokevault-refactor/x.html', // substring not at start → must pass
  ])('look-alike path %s is NOT redirected', (uri) => {
    const ev = reqEvent(uri);
    expect(handler(ev)).toBe(ev.request);
  });
});

describe('Gate 5 — deploy.yml never targets the /pokevault-refactor/ S3 prefix', () => {
  // NOTE (deviation from Opus literal grep): deploy.yml legitimately uses
  // `pokevault-refactor/` as the LOCAL source directory that syncs to the
  // bucket ROOT. A literal `grep pokevault-refactor` therefore cannot be
  // empty. The meaningful invariant is that no S3 *destination* points at the
  // `pokevault-refactor/` prefix. We assert that intent.
  const yml = fs.readFileSync(DEPLOY_YML, 'utf8');

  test('no s3:// destination under the pokevault-refactor/ prefix', () => {
    // Matches `s3://<bucket-or-var>/pokevault-refactor/` as a sync/cp target.
    const badTarget = /s3:\/\/[^\s'"]*\/pokevault-refactor\//;
    expect(badTarget.test(yml)).toBe(false);
  });

  test('deploy still syncs the local source dir to the bucket root', () => {
    // Sanity: the legitimate local-source reference is present and targets root.
    expect(/aws s3 sync pokevault-refactor\//.test(yml)).toBe(true);
    expect(/s3:\/\/\$\{\{ secrets\.S3_BUCKET \}\}\//.test(yml)).toBe(true);
  });
});
