// CloudFront Function (viewer-request) — redirect-refactor
// Distribution: E2IMCPUABUXY1Y  (pokevault.mariellen.com.au)
//
// Purpose: any request under the stale `/pokevault-refactor/` prefix is 301
// permanently redirected to the live site root. This stops mobile browser
// history from resurfacing the old, unmaintained build of the app.
//
// Runtime: cloudfront-js-2.0. This file MUST stay pure (no module.exports,
// no require) so it deploys verbatim. The test suite loads `handler` via a vm
// sandbox, so do not add Node-specific exports here.
//
// Match precision (Opus watch points):
//   * `event.request.uri` is the decoded path only — it never includes the
//     query string — so anchoring on the leading slash cannot be defeated by
//     a `?...=pokevault-refactor` query.
//   * We use indexOf(...) === 0 (ES5.1-safe, anchored at start). A look-alike
//     sibling like `/pokevault-refactored/` or `/pokevault-refactor-v2/` does
//     NOT match because it lacks the exact `/pokevault-refactor/` boundary.
//   * The bare prefix `/pokevault-refactor` (no trailing slash) is matched by
//     exact equality so it redirects too, without catching `/pokevault-...`.
function handler(event) {
    var request = event.request;
    var uri = request.uri;

    var PREFIX = '/pokevault-refactor/';
    var BARE = '/pokevault-refactor';

    if (uri === BARE || uri.indexOf(PREFIX) === 0) {
        return {
            statusCode: 301,
            statusDescription: 'Moved Permanently',
            headers: {
                'location': { value: 'https://pokevault.mariellen.com.au/' }
            }
        };
    }

    // Not under the stale prefix — pass through unchanged.
    return request;
}
