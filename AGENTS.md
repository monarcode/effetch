# Agent instructions

`@monarcode/effetch`: typed, schema-driven HTTP calls on Effect v4's
`HttpClient`. Consumers import it as
`import { Fetch } from "@monarcode/effetch"`.

## Rules

1. **Effect v4 has changed — do not trust memory.** Effect 4.x reorganised
   modules and renamed APIs. Before using any Effect API, open its source in
   `node_modules/effect/src/` and read the signature + JSDoc. HTTP modules live
   at `effect/http/*` (e.g. `effect/http/HttpClient`,
   `effect/http/HttpClientRequest`, `effect/http/HttpClientResponse`,
   `effect/http/HttpBody`, `effect/http/UrlParams`, `effect/http/Headers`,
   `effect/http/HttpClientError`). Use deep namespace imports:
   `import * as Effect from "effect/Effect"`.
2. **Verify tool flags against current docs** (tsdown, vitest, attw, publint,
   GitHub Actions, npm). If a flag doesn't exist, find its current equivalent
   rather than guessing.
3. **The `.d.ts` files are the documentation.** Consumers' "Go to Definition"
   lands on `.d.ts` (no source, no declaration maps are shipped). Every public
   export needs JSDoc with a description, `@example`, and `@since 0.1.0`.
   Public types must be **named, exported interfaces/aliases**, not giant
   inline conditional types. One exception: `CallEffect` and the call
   signatures (`NoBodyMethod`, `BodyMethod`, `RequestMethod`, `Endpoint`)
   write out the members of `CallError` and `CallServices`, so hovers show
   the errors rather than the alias. Keep them in sync; the type tests check
   each one against the aliases.
4. **Runtime targets: browsers, React Native (Hermes/Metro), Node ≥ 20, Bun,
   Deno.** No `node:` imports, no Node globals, **no `new URL()`** (React
   Native's URL support is incomplete) — join URLs with string operations. No
   `#private` class fields. This applies to `src/`: `bin/` is the
   `effetch-migrate` CLI, which runs on Node only, and `site/` is the docs
   site, which isn't shipped.
5. **Never run `git commit`, `git push`, `git tag`**, or anything else that
   writes git history, unless the maintainer explicitly asks. Stop with the
   working tree ready, a summary of the changes, and a suggested Conventional
   Commit message. Never commit `dist/`.
6. Never run `npm publish` (except `--dry-run`), `npm login`, `npm trust`,
   `gh secret`, `gh workflow run`, `gh release`, or change repo settings. Those
   are maintainer steps.

## The docs site

`site/` is the documentation site: Fumadocs on TanStack Start, prerendered
to static files. It's a package in the pnpm workspace and isn't published.

- Fumadocs and TanStack Start change between versions too. Before using one
  of their APIs, read its `.d.ts` in `site/node_modules`.
- Pages live in `site/content/docs/(latest)/`, and each folder's `meta.json`
  orders the sidebar. Every ` ```ts ` block in a page is an example, which
  the docs check compiles like the README's. Fence TypeScript as `ts`: the
  check fails on `typescript`, `tsx`, `mts` and `cts` fences, so no example
  skips it. It compiles `ts` only, so a JSX example needs the check
  extended first.
- Pages are `.mdx` only: the site and the docs check read no other files.
- The guides live on the site, once. The README is an overview that links
  to them, so when a feature changes, update its page, and the README only
  if its quick start or links change. Link between pages with root-relative
  paths (`/docs/errors/status-errors`).
- Every `ts` block on a page gets Twoslash type hovers, read from the
  built package in `dist`, and a type error in one fails the site's build.
  `no-twoslash` in a block's meta turns its hovers off, but the docs check
  still compiles it, so use it only for an example whose hovers mislead.
- The API reference pages (`reference/fetch.mdx`, `plugins.mdx` and
  `fetch-test.mdx`) are generated from the JSDoc by
  `scripts/reference-docs.mjs`. Don't edit them: after changing a public
  export or its docs, run `pnpm run docs:reference`. A new export needs a
  group in that script, and the docs check fails until it has one and the
  pages match.
- Older release lines in `site/content/docs/<line>/` are snapshots of
  released docs, with that release's types in `site/versions/<line>/`.
  Don't edit them, and don't update them when the API changes: the docs
  check and Twoslash skip them. `pnpm run docs:snapshot <line>` writes one;
  its header comment says when and how.
- Each page is also served as Markdown (`/docs/<page>.md`), and
  `/llms.txt` and `/llms-full.txt` list the current line's pages. Link
  between pages with root-relative paths, which the Markdown turns into
  full URLs.
- Each docs page, and the landing page, has a link-preview image, drawn
  with Takumi by `site/src/lib/og-image.tsx` and served at `/og/docs/<page>.png`
  and `/og/home.png`. `vite.config.ts` lists them for the prerender, which
  saves responses as text, so it asks for each image as base64 and writes
  the bytes back. In dev, open an image's URL to see it.
- Pages prerender to flat files (`docs/calls/body.html`), which Cloudflare
  Pages serves at the URL every link uses, `/docs/calls/body`. A page's
  head comes from `pageHead` in `site/src/lib/shared.ts`: its canonical URL,
  link preview, Markdown alternate and structured data. `robots.txt` and
  `sitemap.xml` are routes too, and the sitemap lists the landing page and
  the current line's pages. `npx wrangler pages dev site/dist/client`
  serves a build the way Cloudflare does, redirects and headers included.
- The live docs deploy from the `site` branch, which the Release workflow
  moves to each released commit; `main` and pull requests deploy as
  previews. Don't push `site` yourself.
- `pnpm run check` doesn't build the site. After changing `site/`, run
  `pnpm run build:site`, which builds the package, then prerenders the site
  into `site/dist/client`. `pnpm --dir site run dev` serves it while you
  write, once `pnpm run build` has built `dist`.

## Before declaring any work done

Run `pnpm run check` and make sure it passes. It runs lint, format check,
typecheck, the docs check (every public export has a description, `@example`
and `@since`, and every `ts` example in the JSDoc, the README and the docs
site's pages compiles), tests (including type tests), build, publint, attw
and the tarball smoke test (which also checks go-to-definition, hovers and
completions in the installed package). After changing `site/`, also run
`pnpm run build:site`.

Source imports use explicit `.js` extensions. Because
`exactOptionalPropertyTypes` is on, write optional props as
`readonly foo?: T | undefined`.
