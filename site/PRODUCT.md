# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Effect developers evaluating it.** Developers who use Effect v4 and call
  a backend they don't control (their company's REST API, a third-party
  service), one call at a time. They'd otherwise choose between Effect's
  `HttpClient`, which is low level (build the URL, check the status, decode
  the body by hand), and `HttpApi`, which is contract first and suits
  teams that own both ends. They need to see quickly what Effetch does and
  whether it fits.
- **Developers coming from axios or ky.** Developers moving a codebase to
  Effect, who want calls that feel as short as axios or ky but typed end to
  end. The docs have a migration page for them.
- **Developers wiring it up.** Reading the guides and the reference with
  their editor open.
- **AI coding assistants.** Agents that read `llms.txt`, `llms-full.txt`
  and each page's Markdown route.

## Product Purpose

The site is the documentation and landing page for `@monarcode/effetch`, a
thin layer over Effect v4's `HttpClient` for calling REST and JSON APIs. You
give it a path and a schema. It fills in the path, builds the query, sends
the request, checks the status and decodes the response. What you get back
is an Effect that's typed end to end, errors included.

Success: an evaluator understands within the first screen that Effetch gives
each call a contract's types and errors without writing a contract, and a
developer goes from install to a working typed call by following Getting
started.

## Positioning

Effetch sits between `HttpClient` and `HttpApi`: each call gets the types
and error handling of a contract, without you writing one. A call fails with
`NetworkError`, `HttpError` or `DecodeError` rather than
`HttpClientError | SchemaError`, path params are checked at compile time,
the API's error body is decoded onto `HttpError`, and the client's plugins
(auth, retries, timeouts, logging) run on every call.

## Operating Context

- Developers arrive from the npm page, the GitHub README (whose banner and
  guide links point here) and search.
- The other documentation surface is the editor: the package's JSDoc, shown
  in hovers and on "Go to Definition". The site's reference pages are
  generated from it, and the docs' code blocks carry Twoslash hovers read
  from the built package.
- One docs version per release line. The current line is at `/docs/…`;
  older lines are snapshots at `/docs/<line>/…`. The live site
  (https://effetch.pages.dev) deploys from the `site` branch at each
  release; `main` deploys as a preview.

## Capabilities and Constraints

- Fumadocs 16 on TanStack Start, prerendered to static files and hosted on
  Cloudflare Pages. Search, per-version search, `llms.txt`, Markdown per
  page.
- Every `ts` block on a page is compiled by the docs check, and the site's
  build fails on a type error in one. Code shown on the site compiles.
- Reference pages are generated from the JSDoc and not edited by hand.
- Runtimes: browsers, React Native (Hermes, Metro, Expo), Node.js 20+, Bun
  and Deno.
- Entry points: `@monarcode/effetch` (`Fetch`), `@monarcode/effetch/plugins`
  and `@monarcode/effetch/test` (`FetchTest`, a fake backend for tests).
- Terminology: the product is **Effetch** in prose; `effetch` only as an
  identifier (npm name, repo, URLs).
- Undecided: a custom domain. `https://effetch.pages.dev` until then.

## Brand Commitments

- **Pitch:** "Typed HTTP calls for Effect, without the boilerplate." The
  banner's line: "Schema-driven HTTP calls on Effect v4's HttpClient, typed
  end to end."
- **Logo:** monarcode's lime brace-and-dot mark with the "Effetch"
  wordmark, as in `banner.png` at the repo root. It is the logo in the nav
  and the favicon.
- **Brand colours:** lime `#D5F70D` and ink `#16171D`, shared with
  Session kit (monarcode's palette). The lime is used at its exact value,
  never tinted, faded, blurred or glowing. The design itself must not copy
  Session kit's site (its code-buffer world, line-number gutter, `//`
  headings and timeline lanes).
- **Dark only.** No light mode and no theme switch.
- **The docs get the new look too:** the redesign carries into the docs
  frame (sidebar, TOC, code theme) after the landing page.
- **Voice:** plain and direct, written for developers. Short sentences, one
  idea each. Says what Effetch doesn't do as clearly as what it does.

## Evidence on Hand

- Checked code: every example in the site's pages, the README and the JSDoc
  compiles against the package (`scripts/check-docs.mjs`); 955 tests and
  246 checked examples at the time of writing.
- Runtime support, as above.
- Release status: `0.1.0` release candidate, API settled; the changelog
  lists anything that needs a change in your code.
- Runnable programs in `examples/`.

Absent, and not to be invented: users, adopters or company logos,
testimonials, download or adoption numbers, benchmarks, and claims of
production readiness before `0.1.0`. The landing page doesn't use npm
provenance or the bundle size.

## Product Principles

1. **Show the call, not the claim.** The product is a few lines of code;
   the page proves it by showing them and what they're typed as.
2. **Shown code compiles.** Never put code on the site that the docs check
   doesn't check.
3. **Honest scope.** Say when to use `HttpClient` or `HttpApi` instead.
4. **One home per fact.** A behaviour is explained in one place; other
   pages link to it.
5. **Readable by people and agents.** Every page also exists as Markdown.
