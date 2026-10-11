#!/usr/bin/env bash
# Packs the package the way npm would publish it, installs the tarball into a
# throwaway consumer project, then typechecks (NodeNext + Bundler) and runs it.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
smoke="$root/.smoke"
consumer="$smoke/consumer"

cd "$root"
rm -rf "$smoke"
mkdir -p "$smoke"

echo "› Building"
pnpm run build >/dev/null

echo "› Packing"
# Ignore scripts so prepublishOnly and other hooks never recurse into check.
pnpm --config.ignore-scripts=true pack --pack-destination "$smoke" >/dev/null
tarballs=("$smoke"/monarcode-effetch-*.tgz)
if [ "${#tarballs[@]}" -ne 1 ] || [ ! -f "${tarballs[0]}" ]; then
	echo "✗ Expected exactly one tarball in $smoke" >&2
	exit 1
fi
tarball="${tarballs[0]}"

echo "› Checking tarball contents"
contents="$(tar -tzf "$tarball")"
for required in \
	package/package.json \
	package/dist/index.js \
	package/dist/index.d.ts \
	package/dist/plugins/index.js \
	package/dist/plugins/index.d.ts; do
	if ! grep -qx "$required" <<<"$contents"; then
		echo "✗ Missing from tarball: $required" >&2
		exit 1
	fi
done
forbidden="$(grep -E '^package/src/|\.map$|\.test\.|\.test-d\.' <<<"$contents" || true)"
if [ -n "$forbidden" ]; then
	echo "✗ Unexpected files in tarball:" >&2
	echo "$forbidden" >&2
	exit 1
fi

effect_version="$(node -p 'require("./package.json").devDependencies.effect')"
typescript_version="$(node -p 'require("./package.json").devDependencies.typescript')"

echo "› Installing tarball into consumer (effect@$effect_version, typescript@$typescript_version)"
mkdir -p "$consumer"
cd "$consumer"
cat >package.json <<'JSON'
{ "name": "effetch-smoke-consumer", "private": true, "type": "module" }
JSON
npm install --silent --no-audit --no-fund --no-package-lock \
	"$tarball" "effect@$effect_version" "typescript@$typescript_version"

cat >consumer.ts <<'TS'
import * as Fetch from "@monarcode/effetch";
import * as Plugins from "@monarcode/effetch/plugins";

const placeholder: true = Fetch.VERSION_PLACEHOLDER;

// The published types must still reject bad usage.
// @ts-expect-error VERSION_PLACEHOLDER is the literal `true`
const wrong: false = Fetch.VERSION_PLACEHOLDER;
void wrong;

if (placeholder !== true) {
	throw new Error("Unexpected VERSION_PLACEHOLDER value");
}
if (typeof Plugins !== "object") {
	throw new Error("@monarcode/effetch/plugins did not load");
}

console.log("smoke: ok");
TS

common_options='
		"target": "ES2022",
		"lib": ["ES2022", "DOM", "ESNext.Disposable"],
		"strict": true,
		"noEmit": true,
		"skipLibCheck": false,
		"allowImportingTsExtensions": true'

cat >tsconfig.nodenext.json <<JSON
{
	"compilerOptions": {$common_options,
		"module": "NodeNext",
		"moduleResolution": "NodeNext"
	},
	"files": ["consumer.ts"]
}
JSON

cat >tsconfig.bundler.json <<JSON
{
	"compilerOptions": {$common_options,
		"module": "ESNext",
		"moduleResolution": "Bundler"
	},
	"files": ["consumer.ts"]
}
JSON

echo "› Typechecking consumer (NodeNext)"
./node_modules/.bin/tsc -p tsconfig.nodenext.json

echo "› Typechecking consumer (Bundler)"
./node_modules/.bin/tsc -p tsconfig.bundler.json

echo "› Running consumer"
node consumer.ts

echo "✓ Smoke test passed"
