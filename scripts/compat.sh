#!/usr/bin/env bash
# Checks the packed package against a TypeScript version or a runtime that
# the smoke test doesn't use. It reuses the consumer program and tsconfigs
# that `pnpm run smoke` writes to `.smoke/consumer`, so run that first.
#
#   bash scripts/compat.sh typescript 5.7   typecheck under NodeNext and Bundler
#   bash scripts/compat.sh runtime node     run the consumer with `node`
#   bash scripts/compat.sh runtime bun      … with `bun`
#   bash scripts/compat.sh runtime deno     … with `deno`
#
# A runtime runs the consumer compiled to JavaScript, so Node.js versions
# without type stripping can run it too. The runtime must be on PATH.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mode="${1:-}"
target="${2:-}"
smoke="$root/.smoke"
source="$smoke/consumer"

if [ -z "$mode" ] || [ -z "$target" ]; then
	echo "Usage: bash scripts/compat.sh typescript <version> | runtime <node|bun|deno>" >&2
	exit 2
fi
tarballs=("$smoke"/monarcode-effetch-*.tgz)
if [ ! -f "$source/consumer.ts" ] || [ "${#tarballs[@]}" -ne 1 ] || [ ! -f "${tarballs[0]}" ]; then
	echo "✗ No smoke consumer in $source: run \`pnpm run smoke\` first" >&2
	exit 1
fi
tarball="${tarballs[0]}"

cd "$root"
# The tarball must be packed from the current source.
newer="$(find src package.json -newer "$tarball" -print -quit)"
if [ -n "$newer" ]; then
	echo "✗ $newer changed after the smoke test packed $tarball: run \`pnpm run smoke\` again" >&2
	exit 1
fi
effect_version="$(node -p 'require("./package.json").devDependencies.effect')"
typescript_version="$(node -p 'require("./package.json").devDependencies.typescript')"

# Outside the repository: Bun applies the nearest tsconfig.json's `paths`,
# and the repository's tsconfig.json points `@monarcode/effetch` at `src`.
dir="$(mktemp -d "${TMPDIR:-/tmp}/effetch-compat.XXXXXX")"
trap 'rm -rf "$dir"' EXIT
cp "$source/consumer.ts" "$source/tsconfig.nodenext.json" "$source/tsconfig.bundler.json" "$dir/"
cd "$dir"
echo '{ "name": "effetch-compat-consumer", "private": true, "type": "module" }' >package.json

case "$mode" in
typescript)
	echo "› Installing the tarball (effect@$effect_version, typescript@$target)"
	npm install --loglevel=error --no-audit --no-fund \
		"$tarball" "effect@$effect_version" "typescript@$target" >/dev/null
	echo "› Typechecking with TypeScript $(./node_modules/.bin/tsc -v | sed 's/^Version //')"
	./node_modules/.bin/tsc -p tsconfig.nodenext.json
	./node_modules/.bin/tsc -p tsconfig.bundler.json
	;;
runtime)
	case "$target" in
	node | bun | deno) ;;
	*)
		echo "✗ Unknown runtime: $target (node, bun or deno)" >&2
		exit 2
		;;
	esac
	echo "› Installing the tarball (effect@$effect_version)"
	npm install --loglevel=error --no-audit --no-fund \
		"$tarball" "effect@$effect_version" "typescript@$typescript_version" >/dev/null
	# Plain JavaScript, so the runtime's own TypeScript support isn't tested.
	cat >tsconfig.emit.json <<'JSON'
{
	"extends": "./tsconfig.nodenext.json",
	"compilerOptions": {
		"noEmit": false,
		"allowImportingTsExtensions": false,
		"outDir": "out"
	}
}
JSON
	./node_modules/.bin/tsc -p tsconfig.emit.json
	case "$target" in
	node)
		echo "› Running the consumer with Node.js $(node --version)"
		node out/consumer.js
		;;
	bun)
		echo "› Running the consumer with Bun $(bun --version)"
		bun out/consumer.js
		;;
	deno)
		echo "› Running the consumer with $(deno --version | head -1)"
		# Only reads: the package and its dependencies from node_modules.
		deno run --allow-read out/consumer.js
		;;
	esac
	;;
*)
	echo "✗ Unknown mode: $mode (typescript or runtime)" >&2
	exit 2
	;;
esac

echo "✓ Compatibility check passed: $mode $target"
