// Moves code from Effetch's flat main entry (0.1.0-rc.3 and before) to the
// `Fetch` namespace (0.1.0-rc.4). Node only: this is the `effetch-migrate`
// CLI's transform, not part of the library.

/** The package whose main entry moved to the `Fetch` namespace. */
const PACKAGE = "@monarcode/effetch";

/** The flat subpath with the same exports, for re-exports. */
const SUBPATH = `${PACKAGE}/Fetch`;

/** Names tried, in order, for the namespace when `Fetch` is taken. */
const NAMES = ["Fetch", "Effetch", "EffetchFetch"];

const JS_FILE = /\.[cm]?jsx?$/;

/**
 * Rewrites `sources` from the flat main entry to the `Fetch` namespace.
 *
 * - `import * as X from "@monarcode/effetch"` becomes
 *   `import { Fetch as X } from "@monarcode/effetch"` (or `{ Fetch }`).
 * - Named imports, such as `import { HttpError, type Client }`, become
 *   `import { Fetch }`, and each use becomes `Fetch.HttpError` or
 *   `Fetch.Client`. A name the file re-exports with `export { … }` keeps a
 *   flat import from `@monarcode/effetch/Fetch`.
 * - `export … from "@monarcode/effetch"` re-exports from
 *   `@monarcode/effetch/Fetch`, which has the same exports as before,
 *   except for `Fetch` itself.
 * - `import("@monarcode/effetch").Client` types become
 *   `import("@monarcode/effetch").Fetch.Client`.
 *
 * What it can't rewrite, such as a dynamic `import()`, a
 * `vi.mock("@monarcode/effetch")` or a JSDoc type, it reports as a warning
 * with its line.
 *
 * @param {typeof import("typescript")} ts
 * @param {ReadonlyArray<{ readonly fileName: string; readonly text: string }>} sources
 */
export function migrateSources(ts, sources) {
	// TypeScript asks for files with `/`, also on Windows.
	const key = (/** @type {string} */ fileName) =>
		fileName.replaceAll("\\", "/");
	const texts = new Map(
		sources.map(({ fileName, text }) => [key(fileName), text]),
	);
	const options = {
		allowJs: true,
		noResolve: true,
		noLib: true,
		types: [],
		jsx: ts.JsxEmit.Preserve,
		target: ts.ScriptTarget.Latest,
	};
	const host = ts.createCompilerHost(options);
	const program = ts.createProgram({
		rootNames: [...texts.keys()],
		options,
		host: {
			...host,
			fileExists: (fileName) => texts.has(key(fileName)),
			readFile: (fileName) => texts.get(key(fileName)),
			getSourceFile: (fileName, languageVersion) => {
				const text = texts.get(key(fileName));
				return text === undefined
					? undefined
					: ts.createSourceFile(fileName, text, languageVersion, true);
			},
		},
	});
	const checker = program.getTypeChecker();
	return sources.map(({ fileName, text }) => {
		const sourceFile = program.getSourceFile(key(fileName));
		if (sourceFile === undefined) {
			return {
				fileName,
				text,
				changed: false,
				warnings: [
					{
						line: 1,
						message:
							"TypeScript couldn't read the file, so it's unchanged",
					},
				],
			};
		}
		const migrated = migrateFile(ts, checker, sourceFile);
		return {
			fileName,
			text: migrated.text,
			changed: migrated.text !== text,
			warnings: migrated.warnings,
		};
	});
}

/**
 * @typedef {import("typescript").Node} Node
 * @typedef {{ start: number; end: number; text: string }} Edit
 * @typedef {{ line: number; message: string }} Warning
 * @typedef {{ imported: string; flat: boolean; value: boolean }} Named
 * @typedef {{
 *   name: string;
 *   typeOnly: boolean;
 *   binding: Node;
 *   declaration: import("typescript").ImportDeclaration;
 * }} Provider
 */

/**
 * @param {typeof import("typescript")} ts
 * @param {import("typescript").TypeChecker} checker
 * @param {import("typescript").SourceFile} sourceFile
 */
function migrateFile(ts, checker, sourceFile) {
	const { text } = sourceFile;
	const newline = text.includes("\r\n") ? "\r\n" : "\n";
	/** @type {Array<Edit>} */
	const edits = [];
	/** @type {Array<Warning>} */
	const warnings = [];
	const lineAt = (/** @type {number} */ position) =>
		sourceFile.getLineAndCharacterOfPosition(position).line + 1;
	const warn = (/** @type {Node} */ node, /** @type {string} */ message) =>
		warnings.push({ line: lineAt(node.getStart(sourceFile)), message });
	const isPackage = (/** @type {Node | undefined} */ node) =>
		node !== undefined &&
		(ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
		node.text === PACKAGE;
	const isFetch = (
		/** @type {import("typescript").ImportSpecifier | import("typescript").ExportSpecifier} */ element,
	) => (element.propertyName ?? element.name).text === "Fetch";
	const replace = (/** @type {Node} */ node, /** @type {string} */ value) =>
		edits.push({
			start: node.getStart(sourceFile),
			end: node.end,
			text: value,
		});
	const warnComments = (/** @type {Node} */ declaration) => {
		const written = declaration.getText(sourceFile);
		if (written.includes("//") || written.includes("/*")) {
			warn(declaration, "comments inside this import were dropped");
		}
	};

	// The imports from the package, and the re-exports.
	/** @type {Array<Provider>} */
	const providers = [];
	/** @type {Array<import("typescript").ImportDeclaration>} */
	const namedImports = [];
	/** @type {Map<import("typescript").ImportSpecifier, Named>} */
	const named = new Map();
	for (const statement of sourceFile.statements) {
		if (
			ts.isImportDeclaration(statement) &&
			isPackage(statement.moduleSpecifier)
		) {
			const clause = statement.importClause;
			const bindings = clause?.namedBindings;
			if (clause?.name !== undefined) {
				warn(statement, `a default import of ${PACKAGE}, which has none`);
			}
			if (clause === undefined || bindings === undefined) {
				continue;
			}
			if (ts.isNamespaceImport(bindings)) {
				providers.push({
					name: bindings.name.text,
					typeOnly: clause.isTypeOnly,
					binding: bindings,
					declaration: statement,
				});
				continue;
			}
			let others = false;
			for (const element of bindings.elements) {
				if (isFetch(element)) {
					providers.push({
						name: element.name.text,
						typeOnly: clause.isTypeOnly || element.isTypeOnly,
						binding: element,
						declaration: statement,
					});
				} else {
					others = true;
					named.set(element, {
						imported: (element.propertyName ?? element.name).text,
						flat: false,
						value: !clause.isTypeOnly && !element.isTypeOnly,
					});
				}
			}
			if (others) {
				namedImports.push(statement);
			}
		} else if (
			ts.isExportDeclaration(statement) &&
			isPackage(statement.moduleSpecifier)
		) {
			migrateReexport(ts, statement, sourceFile, newline, edits, warn);
		}
	}

	/** The import specifier `identifier` refers to, if it's one of these. */
	const namedOf = (
		/** @type {import("typescript").Identifier} */ identifier,
	) => {
		const parent = identifier.parent;
		const symbol =
			ts.isShorthandPropertyAssignment(parent) && parent.name === identifier
				? checker.getShorthandAssignmentValueSymbol(parent)
				: ts.isExportSpecifier(parent)
					? checker.getExportSpecifierLocalTargetSymbol(parent)
					: checker.getSymbolAtLocation(identifier);
		const declaration = symbol?.declarations?.[0];
		return declaration !== undefined && ts.isImportSpecifier(declaration)
			? named.get(declaration)
			: undefined;
	};

	/** @type {Array<{ identifier: import("typescript").Identifier; entry: Named }>} */
	const references = [];
	/** @type {Set<string>} */
	const used = new Set();
	const visit = (/** @type {Node} */ node) => {
		if (
			(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
			isPackage(node.moduleSpecifier)
		) {
			if (node.parent !== sourceFile) {
				warn(
					node,
					"an import or export inside a `declare module` block, left as it is: change it by hand",
				);
			}
			return;
		}
		if (ts.isImportTypeNode(node)) {
			const argument = node.argument;
			if (ts.isLiteralTypeNode(argument) && isPackage(argument.literal)) {
				const qualifier = node.qualifier;
				if (qualifier === undefined) {
					const close = text.indexOf(")", argument.end) + 1;
					edits.push({ start: close, end: close, text: ".Fetch" });
				} else if (leftmost(ts, qualifier).text !== "Fetch") {
					const start = qualifier.getStart(sourceFile);
					edits.push({ start, end: start, text: "Fetch." });
				}
				node.typeArguments?.forEach(visit);
				return;
			}
		}
		if (
			ts.isCallExpression(node) &&
			node.expression.kind === ts.SyntaxKind.ImportKeyword &&
			isPackage(node.arguments[0])
		) {
			warn(
				node,
				`a dynamic import(), left as it is: use its \`Fetch\` member, as in \`(await import("${PACKAGE}")).Fetch\``,
			);
			return;
		}
		if (isPackage(node)) {
			warn(
				node,
				ts.isCallExpression(node.parent)
					? `"${PACKAGE}" passed to a call, such as a mock, left as it is: its module now exports only \`Fetch\``
					: `"${PACKAGE}" left as it is: check what uses it`,
			);
		}
		if (ts.isIdentifier(node)) {
			used.add(node.text);
			const entry = named.size > 0 ? namedOf(node) : undefined;
			if (entry !== undefined) {
				if (
					ts.isExportSpecifier(node.parent) &&
					node.parent.parent.parent.moduleSpecifier === undefined
				) {
					entry.flat = true;
				} else {
					references.push({ identifier: node, entry });
				}
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	for (const each of providers) {
		used.add(each.name);
	}

	const qualified = references.filter(({ entry }) => !entry.flat);
	const needsValue = qualified.some(({ entry }) => entry.value);

	// The name to qualify with: a value import of `Fetch` (or `* as X`)
	// already there, then a type-only one, made a value import if needed.
	// When one of the names is shadowed where it's used, a new import with
	// a free name.
	const resolvesTo = (/** @type {Provider} */ provider) =>
		qualified.every(({ identifier }) => {
			const symbol = checker.resolveName(
				provider.name,
				identifier,
				ts.SymbolFlags.Value |
					ts.SymbolFlags.Namespace |
					ts.SymbolFlags.Alias,
				false,
			);
			return symbol?.declarations?.[0] === provider.binding;
		});
	const usable = providers.filter(resolvesTo);
	/** @type {Provider | undefined} */
	const provider =
		(needsValue ? usable.find((each) => !each.typeOnly) : undefined) ??
		usable[0];
	const promote =
		provider !== undefined && provider.typeOnly && needsValue
			? provider
			: undefined;
	const local =
		provider?.name ??
		(qualified.length > 0 ? freeName(NAMES, used) : "Fetch");
	const needsImport = provider === undefined && qualified.length > 0;

	for (const { identifier, entry } of qualified) {
		const value = `${local}.${entry.imported}`;
		const parent = identifier.parent;
		replace(
			identifier,
			ts.isShorthandPropertyAssignment(parent) && parent.name === identifier
				? `${identifier.text}: ${value}`
				: value,
		);
	}

	// Each import declaration, rewritten once.
	const declarations = new Set([
		...providers.map((each) => each.declaration),
		...namedImports,
	]);
	let first = true;
	for (const declaration of [...declarations].sort(
		(a, b) => a.getStart(sourceFile) - b.getStart(sourceFile),
	)) {
		const clause = declaration.importClause;
		const bindings = clause?.namedBindings;
		if (clause === undefined || bindings === undefined) {
			continue;
		}
		/** @type {Array<string>} */
		const lines = [];
		if (ts.isNamespaceImport(bindings)) {
			const name = bindings.name.text;
			lines.push(
				importText(
					declaration,
					clause.isTypeOnly && promote?.binding !== bindings,
					name === "Fetch" ? "Fetch" : `Fetch as ${name}`,
					PACKAGE,
					sourceFile,
				),
			);
		} else {
			const elements = bindings.elements;
			if (first && needsImport && namedImports.includes(declaration)) {
				first = false;
				lines.push(
					importText(
						declaration,
						!needsValue,
						local === "Fetch" ? "Fetch" : `Fetch as ${local}`,
						PACKAGE,
						sourceFile,
					),
				);
			}
			const fetch = elements.filter(isFetch);
			if (fetch.length > 0) {
				const promoted = fetch.some(
					(element) => promote?.binding === element,
				);
				const unchanged = !promoted && !namedImports.includes(declaration);
				if (unchanged) {
					continue;
				}
				lines.push(
					importText(
						declaration,
						clause.isTypeOnly && !promoted,
						fetch
							.map((element) =>
								promoted && element === promote?.binding
									? element.getText(sourceFile).replace(/^type\s+/, "")
									: element.getText(sourceFile),
							)
							.join(", "),
						PACKAGE,
						sourceFile,
					),
				);
			}
			const flat = elements.filter(
				(element) => named.get(element)?.flat === true,
			);
			if (flat.length > 0) {
				lines.push(
					importText(
						declaration,
						clause.isTypeOnly,
						flat.map((element) => element.getText(sourceFile)).join(", "),
						SUBPATH,
						sourceFile,
					),
				);
			}
		}
		warnComments(declaration);
		if (lines.length > 0) {
			replace(declaration, lines.join(newline));
		} else {
			// Remove it, with the rest of its line when that's only a comment.
			const rest = /^[ \t]*(?:\/\/[^\r\n]*)?(?:\r?\n)?/.exec(
				text.slice(declaration.end),
			);
			edits.push({
				start: declaration.getStart(sourceFile),
				end: declaration.end + (rest?.[0].length ?? 0),
				text: "",
			});
		}
	}

	// JSDoc isn't rewritten: point at the comments that need it, once per
	// file.
	const migrated = new Set(qualified.map(({ identifier }) => identifier.text));
	/** @type {Array<number>} */
	const mentions = [];
	/** @type {Map<string, number>} */
	const uses = new Map();
	for (const match of text.matchAll(/\/\*\*[\s\S]*?\*\//g)) {
		const comment = match[0];
		if (comment.includes(PACKAGE)) {
			mentions.push(lineAt(match.index));
		} else if (JS_FILE.test(sourceFile.fileName)) {
			for (const name of migrated) {
				if (
					!uses.has(name) &&
					new RegExp(`(?<![\\w$.])${name}(?![\\w$])`).test(comment)
				) {
					uses.set(name, lineAt(match.index));
				}
			}
		}
	}
	if (mentions.length > 0) {
		warnings.push({
			line: mentions[0] ?? 1,
			message:
				mentions.length === 1
					? `a comment mentions ${PACKAGE}: update it by hand`
					: `${mentions.length} comments mention ${PACKAGE}, from this line on: update them by hand`,
		});
	}
	for (const [name, line] of uses) {
		warnings.push({
			line,
			message: `a JSDoc comment uses \`${name}\`: update it by hand`,
		});
	}

	return {
		text: applyEdits(text, edits),
		warnings: warnings.sort((a, b) => a.line - b.line),
	};
}

/**
 * Rewrites `export … from "@monarcode/effetch"`: from the flat subpath,
 * which has the exports the main entry had, except that a re-export of
 * `Fetch` itself stays on the main entry.
 *
 * @param {typeof import("typescript")} ts
 * @param {import("typescript").ExportDeclaration} declaration
 * @param {import("typescript").SourceFile} sourceFile
 * @param {string} newline
 * @param {Array<Edit>} edits
 * @param {(node: Node, message: string) => void} warn
 */
function migrateReexport(ts, declaration, sourceFile, newline, edits, warn) {
	const specifier = declaration.moduleSpecifier;
	if (specifier === undefined) {
		return;
	}
	const clause = declaration.exportClause;
	const quote = specifier.getText(sourceFile)[0] ?? '"';
	if (clause === undefined || !ts.isNamedExports(clause)) {
		edits.push({
			start: specifier.getStart(sourceFile),
			end: specifier.end,
			text: `${quote}${SUBPATH}${quote}`,
		});
		return;
	}
	const isFetch = (
		/** @type {import("typescript").ExportSpecifier} */ element,
	) => (element.propertyName ?? element.name).text === "Fetch";
	const fetch = clause.elements.filter(isFetch);
	const others = clause.elements.filter((element) => !isFetch(element));
	if (others.length === 0) {
		return;
	}
	if (fetch.length === 0) {
		edits.push({
			start: specifier.getStart(sourceFile),
			end: specifier.end,
			text: `${quote}${SUBPATH}${quote}`,
		});
		return;
	}
	const written = declaration.getText(sourceFile);
	if (written.includes("//") || written.includes("/*")) {
		warn(declaration, "comments inside this export were dropped");
	}
	const semicolon = written.trimEnd().endsWith(";") ? ";" : "";
	const attributes =
		declaration.attributes === undefined
			? ""
			: ` ${declaration.attributes.getText(sourceFile)}`;
	const type = declaration.isTypeOnly ? "type " : "";
	const exportOf = (
		/** @type {ReadonlyArray<import("typescript").ExportSpecifier>} */ elements,
		/** @type {string} */ module,
	) =>
		`export ${type}{ ${elements.map((element) => element.getText(sourceFile)).join(", ")} } from ${quote}${module}${quote}${attributes}${semicolon}`;
	edits.push({
		start: declaration.getStart(sourceFile),
		end: declaration.end,
		text: [exportOf(fetch, PACKAGE), exportOf(others, SUBPATH)].join(newline),
	});
}

/**
 * An import of `bindings` from `module`, written like `declaration`: its
 * quotes, its attributes and whether it ends with a semicolon.
 *
 * @param {import("typescript").ImportDeclaration} declaration
 * @param {boolean} typeOnly
 * @param {string} bindings
 * @param {string} module
 * @param {import("typescript").SourceFile} sourceFile
 */
function importText(declaration, typeOnly, bindings, module, sourceFile) {
	const written = declaration.getText(sourceFile);
	const quote = declaration.moduleSpecifier.getText(sourceFile)[0] ?? '"';
	const semicolon = written.trimEnd().endsWith(";") ? ";" : "";
	const attributes =
		declaration.attributes === undefined
			? ""
			: ` ${declaration.attributes.getText(sourceFile)}`;
	return `import ${typeOnly ? "type " : ""}{ ${bindings} } from ${quote}${module}${quote}${attributes}${semicolon}`;
}

/**
 * The first of `names` not in `used`, then `Fetch2`, `Fetch3` and so on.
 *
 * @param {ReadonlyArray<string>} names
 * @param {ReadonlySet<string>} used
 */
function freeName(names, used) {
	const free = names.find((name) => !used.has(name));
	if (free !== undefined) {
		return free;
	}
	let index = 2;
	while (used.has(`Fetch${index}`)) {
		index += 1;
	}
	return `Fetch${index}`;
}

/**
 * The leftmost identifier of `name`, such as `Fetch` in `Fetch.Client`.
 *
 * @param {typeof import("typescript")} ts
 * @param {import("typescript").EntityName} name
 * @returns {import("typescript").Identifier}
 */
function leftmost(ts, name) {
	return ts.isQualifiedName(name) ? leftmost(ts, name.left) : name;
}

/**
 * Applies `edits` to `text`, from the last to the first.
 *
 * @param {string} text
 * @param {ReadonlyArray<Edit>} edits
 */
function applyEdits(text, edits) {
	const sorted = [...edits].sort((a, b) => b.start - a.start || b.end - a.end);
	let result = text;
	let limit = Number.POSITIVE_INFINITY;
	for (const edit of sorted) {
		if (edit.end > limit) {
			throw new Error(
				`effetch-migrate: overlapping edits at ${edit.start}-${edit.end}`,
			);
		}
		result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
		limit = edit.start;
	}
	return result;
}
