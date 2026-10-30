# Agent instructions

`@monarcode/effetch`: typed, schema-driven HTTP calls on Effect v4's
`HttpClient`. Consumers import it as `import * as Fetch from "@monarcode/effetch"`.

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
   `#private` class fields.
5. **Never run `git commit`, `git push`, `git tag`**, or anything else that
   writes git history, unless the maintainer explicitly asks. Stop with the
   working tree ready, a summary of the changes, and a suggested Conventional
   Commit message. Never commit `dist/`.
6. Never run `npm publish` (except `--dry-run`), `npm login`, `npm trust`,
   `gh secret`, `gh workflow run`, `gh release`, or change repo settings. Those
   are maintainer steps.

## Before declaring any work done

Run `pnpm run check` and make sure it passes. It runs lint, format check,
typecheck, the docs check (every public export has a description, `@example`
and `@since`, and every `ts` example in the JSDoc and the README compiles),
tests (including type tests), build, publint, attw and the tarball smoke test
(which also checks go-to-definition, hovers and completions in the installed
package).

Source imports use explicit `.js` extensions. Because
`exactOptionalPropertyTypes` is on, write optional props as
`readonly foo?: T | undefined`.
