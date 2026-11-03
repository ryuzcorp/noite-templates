import { DurableObject, RpcTarget } from "cloudflare:workers";
import { AsyncLocalStorage } from "node:async_hooks";
import { constants } from "node:os";
// node_modules/void/dist/env-raw-e8qgqAzQ.mjs
/**
* Raw runtime env resolution — framework-internal only.
*
* This module is NOT exported in package.json, so it cannot be imported
* via "void/..." subpaths. Only framework modules can import it by relative path.
*/
/** Prefixes for platform-internal bindings that must be hidden from user code. */
var INTERNAL_BINDING_PREFIXES = ["__VOID_", "__PROJECT_"];
/**
* Framework bindings hidden from user code only while ISR is active, so a non-ISR
* app keeps its own `ISR_CACHE`. Shared with the generated `c.env` filter.
*/
var INTERNAL_BINDING_EXACT_NAMES = ["ISR_CACHE"];
/** Only ISR builds stamp the `__VOID_ISR_DEPLOYMENT_ID` binding onto the raw env. */
function isIsrActive(rawEnv) {
	return rawEnv.__VOID_ISR_DEPLOYMENT_ID != null;
}
/**
* One process or isolate can evaluate this module more than once: Vite's SSR module
* runner keeps its own copy beside a package it leaves external, and a dependency
* optimizer reload re-evaluates it while a request is in flight. Every copy must read
* the env of the current request, so the store lives on `globalThis`, like
* `authContext`. Two Void versions in one process share it: change the key when the
* store shape changes.
*/
var ENV_CONTEXT_SYMBOL = Symbol.for("void.envContext.v1");
var shared$1 = globalThis;
shared$1[ENV_CONTEXT_SYMBOL] ??= new AsyncLocalStorage();
var envContext = shared$1[ENV_CONTEXT_SYMBOL];
var cloudflareEnv;
if (typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers") import("cloudflare:workers").then((mod) => {
	cloudflareEnv = asEnv(mod.env) ?? void 0;
}).catch(() => {});
function asEnv(value) {
	if (typeof value !== "object" || value === null) return null;
	if ("then" in value && typeof value.then === "function") return null;
	return value;
}
function getNuxtEnv() {
	return asEnv(globalThis.__env__);
}
/** Resolve raw env from AsyncLocalStorage, Nuxt globals, or CF module env. */
function getRawRuntimeEnv() {
	return envContext.getStore() ?? getNuxtEnv() ?? cloudflareEnv ?? (() => {
		throw new Error("env: Cloudflare env is unavailable. Use void runtime bindings inside Nuxt/SvelteKit/Analog server request handlers or Worker handlers.");
	})();
}
// node_modules/@void/edge/dist/index.mjs
/** Upgrade public HTTP requests without involving assets or application code. */
function redirectToHttps(request) {
	const url = new URL(request.url);
	if (url.protocol !== "http:" || url.hostname === "localhost" || url.hostname.endsWith(".localhost") || isIpv4Loopback(url.hostname) || url.hostname === "[::1]" || url.pathname.startsWith("/.well-known/acme-challenge/") || url.pathname.startsWith("/.well-known/pki-validation/")) return;
	url.protocol = "https:";
	url.port = "";
	return Response.redirect(url.href, 308);
}
/**
* `URL` already rewrites every IPv4 form (`127.1`, `0x7f.0.0.1`) to four
* decimal parts and rejects parts above 255, so only the shape is checked.
*/
function isIpv4Loopback(hostname) {
	const parts = hostname.split(".");
	return parts.length === 4 && parts[0] === "127" && parts.every((part) => part !== "" && [...part].every((char) => char >= "0" && char <= "9"));
}
/**
* Path-pattern matchers shared by routing, header, and revalidate rules.
*
* Each pattern is parsed once into tokens, and matching walks those tokens
* over the pathname. No RegExp is built from pattern text, so a pattern cannot
* hit engine size limits or backtrack: a match costs at most
* (steps) x (path length - pattern minimum + 1).
*
* `compilePattern` syntax:
*   `:name`   — single path segment, captured as `name`
*   `:name*`  — zero or more path segments, captured as `name`
*   `*`       — zero or more path segments, captured as `splat` (legacy)
*
* When a legacy pattern contains multiple anonymous `*`, the first captures
* as `splat` and later wildcards are non-capturing.
*/
var MAX_CACHE = 256;
/** LRU read: re-inserting a hit moves it to the most-recently-used end of Map order. */
function lruGet(cache, key) {
	const value = cache.get(key);
	if (value !== void 0) {
		cache.delete(key);
		cache.set(key, value);
	}
	return value;
}
/** LRU write: evict the least-recently-used entry once the cache is full. */
function lruSet(cache, key, value) {
	if (cache.size >= MAX_CACHE) {
		const first = cache.keys().next();
		if (!first.done) cache.delete(first.value);
	}
	cache.set(key, value);
}
/** `[A-Za-z0-9_]` */
function isNameChar(code) {
	return code >= 48 && code <= 57 || code >= 65 && code <= 90 || code >= 97 && code <= 122 || code === 95;
}
/** Whether a wildcard of this kind may take the code unit. */
function accepts(kind, code) {
	if (kind === "seg") return code !== 47;
	return code !== 10 && code !== 13 && code !== 8232 && code !== 8233;
}
function pushText(tokens, text) {
	if (!text) return;
	const last = tokens[tokens.length - 1];
	if (last?.kind === "text") last.text += text;
	else tokens.push({
		kind: "text",
		text
	});
}
/** `compilePattern` syntax, read left to right. */
function parseCapture(source) {
	const tokens = [];
	const paramNames = [];
	let splatTaken = false;
	let index = 0;
	while (index < source.length) {
		const character = source[index];
		if (character === ":") {
			let end = index + 1;
			while (end < source.length && isNameChar(source.charCodeAt(end))) end++;
			if (end === index + 1) {
				pushText(tokens, ":");
				index++;
				continue;
			}
			const name = source.slice(index + 1, end);
			paramNames.push(name);
			const rest = source[end] === "*";
			tokens.push({
				kind: rest ? "any" : "seg",
				name
			});
			index = rest ? end + 1 : end;
		} else if (character === "*") {
			if (splatTaken) tokens.push({ kind: "any" });
			else {
				paramNames.push("splat");
				tokens.push({
					kind: "any",
					name: "splat"
				});
				splatTaken = true;
			}
			index++;
		} else {
			let end = index + 1;
			while (end < source.length && source[end] !== ":" && source[end] !== "*") end++;
			pushText(tokens, source.slice(index, end));
			index = end;
		}
	}
	return {
		tokens,
		paramNames
	};
}
/**
* Drop an `any` that directly follows another `any`: the first takes every
* unit the pair could take, so the second always matches ''. Every other step
* needs at least one unit, so a path of length m faces at most 2m + 1 steps.
*/
function prepare(tokens) {
	const steps = [];
	for (const token of tokens) if (!(token.kind === "any" && steps[steps.length - 1]?.kind === "any")) steps.push(token);
	const starts = new Int32Array(steps.length + 1);
	steps.forEach((step, i) => {
		const shortest = step.kind === "text" ? step.text.length : step.kind === "any" ? 0 : 1;
		starts[i + 1] = starts[i] + shortest;
	});
	return {
		steps,
		starts,
		minLength: starts[steps.length]
	};
}
function stepBack(step, path, start, next, row) {
	let found = 0;
	if (step.kind === "text") {
		for (let d = row.length - 1; d >= 0; d--) {
			const value = next[d] === 1 && path.startsWith(step.text, start + d) ? 1 : 0;
			row[d] = value;
			found |= value;
		}
		return found === 1;
	}
	const kind = step.kind;
	let after = 0;
	for (let d = row.length - 1; d >= 0; d--) {
		const value = kind === "any" ? next[d] === 1 || after === 1 && accepts(kind, path.charCodeAt(start + d)) : (next[d] === 1 || after === 1) && accepts(kind, path.charCodeAt(start + d));
		row[d] = value ? 1 : 0;
		after = row[d];
		found |= after;
	}
	return found === 1;
}
/** The row after the last step: only the end of the path (d = slack) finishes. */
function endRow(width) {
	const row = new Uint8Array(width);
	row[width - 1] = 1;
	return row;
}
/** Checks that reject most paths before any row is built. */
function quickReject({ steps, minLength }, path) {
	const first = steps[0];
	const last = steps[steps.length - 1];
	return path.length < minLength || first?.kind === "text" && !path.startsWith(first.text) || last?.kind === "text" && !path.endsWith(last.text);
}
/** Whether the steps match the whole path. Keeps two rows. */
function matches(prepared, path) {
	if (quickReject(prepared, path)) return false;
	const { steps, starts, minLength } = prepared;
	let next = endRow(path.length - minLength + 1);
	let row = new Uint8Array(next.length);
	const first = steps[0]?.kind === "text" ? 1 : 0;
	for (let i = steps.length - 1; i >= first; i--) {
		if (!stepBack(steps[i], path, starts[i], next, row)) return false;
		const done = next;
		next = row;
		row = done;
	}
	return next[0] === 1;
}
/**
* Where a step that begins at p (row index d) ends: the longest choice after
* which the rest still matches. `next` is the row of the following step.
*/
function greedyEnd(step, path, p, d, next) {
	if (step.kind === "text") return p + step.text.length;
	const shortest = step.kind === "any" ? 0 : 1;
	const longest = next.length - 1 - d + shortest;
	let k = 0;
	while (k < longest && accepts(step.kind, path.charCodeAt(p + k))) k++;
	while (k > shortest && next[d + k - shortest] !== 1) k--;
	return p + k;
}
/**
* End positions of steps 0..upTo in the match that JS backtracking returns
* (each wildcard, left to right, takes the longest run that still lets the
* rest match), or null. The backward pass keeps a copy of every `size`-th
* row; the forward pass rebuilds one block of rows at a time into a fixed
* pool. About 2 * sqrt(n) rows are alive at once, and each row is computed at
* most twice.
*/
function greedyEnds(prepared, path, upTo) {
	if (quickReject(prepared, path)) return null;
	const { steps, starts, minLength } = prepared;
	const n = steps.length;
	const width = path.length - minLength + 1;
	const size = n * width <= 65536 ? 1 : Math.ceil(Math.sqrt(n));
	const saved = /* @__PURE__ */ new Map([[n, endRow(width)]]);
	let next = endRow(width);
	let row = new Uint8Array(width);
	const first = steps[0]?.kind === "text" ? 1 : 0;
	for (let i = n - 1; i >= first; i--) {
		if (!stepBack(steps[i], path, starts[i], next, row)) return null;
		if (i % size === 0) saved.set(i, row.slice());
		const done = next;
		next = row;
		row = done;
	}
	if (next[0] !== 1) return null;
	const pool = Array.from({ length: size }, () => new Uint8Array(width));
	let top = 0;
	const rowAt = (r) => r === top ? saved.get(r) : pool[r % size];
	const ends = new Int32Array(upTo + 1);
	let p = 0;
	for (let i = 0; i <= upTo; i++) {
		if (i + 1 > top) {
			top = Math.min(n, Math.ceil((i + 1) / size) * size);
			for (let r = top - 1; r > i; r--) stepBack(steps[r], path, starts[r], rowAt(r + 1), pool[r % size]);
		}
		p = greedyEnd(steps[i], path, p, p - starts[i], rowAt(i + 1));
		ends[i] = p;
	}
	return ends;
}
/** The regex the earlier string-building compiler produced, for the deprecated `regex` view. */
function toRegExp(tokens) {
	let body = "";
	for (const token of tokens) if (token.kind === "text") body += token.text.replace(/[.+?^${}()|[\]\\:]/g, "\\$&");
	else if (token.kind === "seg") body += `(?<${token.name}>[^/]+)`;
	else body += token.name ? `(?<${token.name}>.*)` : ".*";
	return new RegExp(`^${body}$`);
}
var compileCache = /* @__PURE__ */ new Map();
function compile(source) {
	const cached = lruGet(compileCache, source);
	if (cached) return cached;
	const { tokens, paramNames } = parseCapture(source);
	let error;
	const seen = /* @__PURE__ */ new Set();
	for (const name of paramNames) {
		if (seen.has(name)) error ??= `Duplicate capture group name "${name}"`;
		else if (name.charCodeAt(0) >= 48 && name.charCodeAt(0) <= 57) error ??= `Invalid capture group name "${name}"`;
		seen.add(name);
	}
	const prepared = prepare(tokens);
	let lastNamed = -1;
	prepared.steps.forEach((step, i) => {
		if (step.kind !== "text" && step.name) lastNamed = i;
	});
	let regex;
	const compiled = {
		...prepared,
		paramNames,
		error,
		lastNamed,
		get regex() {
			return regex ??= toRegExp(parseCapture(source).tokens);
		}
	};
	lruSet(compileCache, source, compiled);
	return compiled;
}
/**
* Parse a capture pattern. Throws a SyntaxError for a malformed one: a repeated
* name (`/:id/:id`, `/:splat/*`) or a name that starts with a digit (`/:1`).
*/
function compilePattern(source) {
	const compiled = compile(source);
	if (compiled.error) throw new SyntaxError(compiled.error);
	return compiled;
}
/**
* Match a pattern against a pathname. Returns captured params, or null.
* A malformed pattern (e.g. a repeated name like `/:splat/*`) also returns
* null, so one bad rule cannot fail unrelated requests.
*/
function matchPatternCaptures(pattern, pathname) {
	const compiled = compile(pattern);
	if (compiled.error) return null;
	const { steps, lastNamed } = compiled;
	const ends = lastNamed === -1 ? void 0 : greedyEnds(compiled, pathname, lastNamed);
	if (ends === null || ends === void 0 && !matches(compiled, pathname)) return null;
	const params = Object.create(null);
	for (const name of compiled.paramNames) params[name] = "";
	for (let i = 0; ends && i <= lastNamed; i++) {
		const step = steps[i];
		if (step.kind !== "text" && step.name) params[step.name] = pathname.slice(i === 0 ? 0 : ends[i - 1], ends[i]);
	}
	return params;
}
/**
* Match a pattern against a pathname (boolean form). Malformed patterns yield
* `false` rather than throwing (see `matchPatternCaptures`).
*/
function matchPattern(pattern, pathname) {
	const compiled = compile(pattern);
	return compiled.error === void 0 && matches(compiled, pathname);
}
/**
* Substitute `:name` and `:name*` tokens in a destination string with the
* matching named captures from `params`. `:splat` works for legacy `*` patterns
* because `compilePattern` captures anonymous `*` as `splat`.
*/
function substituteParams(destination, params) {
	const result = destination.replace(/:([A-Za-z0-9_]+)\*?/g, (whole, name) => {
		return params[name] ?? whole;
	});
	if (/^[/\\]{2}/.test(result) && !/^[/\\]{2}/.test(destination)) return "/" + result.replace(/^[/\\]+/, "");
	return result;
}
/**
* Merge a request's query string into a redirect destination.
*
* If the destination already contains a `?`, its parameters take precedence
* over the request's. Otherwise the request's query is appended verbatim.
*
* A `#fragment` on the destination is stripped before the merge and
* re-appended afterwards, so `/new#faq` + `?utm=x` becomes `/new?utm=x#faq`
* rather than `/new#faq?utm=x` (which browsers treat as fragment text).
*/
function mergeQueryIntoLocation(destination, requestSearch) {
	if (!requestSearch || requestSearch === "?") return destination;
	const fragIdx = destination.indexOf("#");
	const base = fragIdx === -1 ? destination : destination.slice(0, fragIdx);
	const fragment = fragIdx === -1 ? "" : destination.slice(fragIdx);
	const destQueryIdx = base.indexOf("?");
	if (destQueryIdx === -1) return base + requestSearch + fragment;
	if (destQueryIdx === base.length - 1) return base.slice(0, destQueryIdx) + fragment;
	const reqParams = new URLSearchParams(requestSearch);
	const destParams = new URLSearchParams(base.slice(destQueryIdx + 1));
	for (const [key, value] of reqParams) if (!destParams.has(key)) destParams.append(key, value);
	return base.slice(0, destQueryIdx) + "?" + destParams.toString() + fragment;
}
function usageLimitResponse(limit) {
	const headers = new Headers({ "Cache-Control": "no-store" });
	if (limit.retryAt && Number.isFinite(Date.parse(limit.retryAt))) headers.set("Retry-After", String(Math.max(0, Math.ceil((Date.parse(limit.retryAt) - Date.now()) / 1e3))));
	return Response.json(limit, {
		status: 429,
		headers
	});
}
// node_modules/void/dist/limits-CrHLm5Tk.mjs
var UsageLimit = class extends Error {
	name = "UsageLimit";
	code = "usage_limit";
	resource;
	reason;
	retryAt;
	constructor(data) {
		super(data.message);
		this.resource = data.resource;
		this.reason = data.reason;
		this.retryAt = data.retryAt;
	}
	response(options = {}) {
		return usageLimitResponse({
			code: this.code,
			resource: this.resource,
			reason: this.reason,
			message: options.message ?? this.message,
			...this.retryAt ? { retryAt: this.retryAt } : {}
		});
	}
	getResponse() {
		return this.response();
	}
};
// node_modules/void/dist/env-DtKg5G26.mjs
/**
* Public runtime env API — exposed via "void/_env".
*
* All exports from this module are accessible to user code.
* Internal platform bindings (__VOID_*, __PROJECT_*) are filtered
* from getRuntimeEnv() and blocked in getRuntimeBinding().
*/
var REQUEST_SCOPE_SYMBOL = Symbol.for("void.runtimeRequestScope.v1");
var shared = globalThis;
shared[REQUEST_SCOPE_SYMBOL] ??= new AsyncLocalStorage();
var runtimeRequestContext = shared[REQUEST_SCOPE_SYMBOL];
function withRuntimeEnv(env, fn) {
	const resolved = asEnv(env);
	if (!resolved) return fn();
	if (runtimeRequestContext.getStore()) return envContext.run(resolved, fn);
	const scope = { resources: /* @__PURE__ */ new Map() };
	return envContext.run(resolved, () => runtimeRequestContext.run(scope, fn));
}
/** Whether `name` is a framework binding hidden from user code; `rawEnv` is the unfiltered env. */
function isInternalBinding(name, rawEnv) {
	if (INTERNAL_BINDING_PREFIXES.some((p) => name.startsWith(p))) return true;
	return isIsrActive(rawEnv) && INTERNAL_BINDING_EXACT_NAMES.includes(name);
}
function filterEnvProxy(env) {
	return new Proxy(env, {
		get(target, prop, receiver) {
			if (typeof prop === "string" && isInternalBinding(prop, target)) return;
			return Reflect.get(target, prop, receiver);
		},
		has(target, prop) {
			if (typeof prop === "string" && isInternalBinding(prop, target)) return false;
			return Reflect.has(target, prop);
		},
		ownKeys(target) {
			return Reflect.ownKeys(target).filter((key) => typeof key !== "string" || !isInternalBinding(key, target));
		},
		getOwnPropertyDescriptor(target, prop) {
			if (typeof prop === "string" && isInternalBinding(prop, target)) return;
			return Reflect.getOwnPropertyDescriptor(target, prop);
		}
	});
}
/** Returns the runtime env with internal platform bindings hidden. */
function getRuntimeEnv() {
	return filterEnvProxy(getRawRuntimeEnv());
}
function getRuntimeBinding(name) {
	const raw = getRawRuntimeEnv();
	if (isInternalBinding(name, raw)) return;
	return raw[name];
}
function requireRuntimeBinding(name) {
	const value = getRuntimeBinding(name);
	if (value !== void 0 && value !== null) return value;
	throw new Error(`env: Missing Cloudflare binding '${name}'.`);
}
// node_modules/@cloudflare/sandbox/node_modules/zod/v4/core/util.js
function jsonStringifyReplacer(_, value) {
	if (typeof value === "bigint") return value.toString();
	return value;
}
var Cached = class {
	constructor(getter) {
		this._getter = getter;
		this._value = void 0;
	}
	get value() {
		const getter = this._getter;
		if (getter !== void 0) {
			this._value = getter();
			this._getter = void 0;
		}
		return this._value;
	}
};
function cached(getter) {
	return new Cached(getter);
}
function nullish(input) {
	return input === null || input === void 0;
}
function assignProp(target, prop, value) {
	Object.defineProperty(target, prop, {
		value,
		writable: true,
		enumerable: true,
		configurable: true
	});
}
var captureStackTrace = "captureStackTrace" in Error ? Error.captureStackTrace : (..._args) => {};
function isObject(data) {
	return typeof data === "object" && data !== null && !Array.isArray(data);
}
function escapeRegex(str) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function clone(inst, def, params) {
	const cl = new inst._zod.constr(def ?? inst._zod.def);
	if (!def || params?.parent) cl._zod.parent = inst;
	return cl;
}
function normalizeParams(_params) {
	const params = _params;
	if (!params) return {};
	if (typeof params === "string") return { error: () => params };
	if (params?.message !== void 0) {
		if (params?.error !== void 0) throw new Error("Cannot specify both `message` and `error` params");
		params.error = params.message;
	}
	delete params.message;
	if (typeof params.error === "string") return {
		...params,
		error: () => params.error
	};
	return params;
}
function optionalKeys(shape) {
	return Object.keys(shape).filter((k) => {
		return shape[k]._zod.optin !== void 0 && shape[k]._zod.optout === "optional";
	});
}
var NUMBER_FORMAT_RANGES = /*@__PURE__*/ (() => ({
	safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
	int32: [-2147483648, 2147483647],
	uint32: [0, 4294967295],
	float32: [-34028234663852886e22, 34028234663852886e22],
	float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
}))();
function aborted(x, startIndex = 0) {
	if (x.aborted === true) return true;
	for (let i = startIndex; i < x.issues.length; i++) if (x.issues[i]?.continue !== true) return true;
	return false;
}
function explicitlyAborted(x, startIndex = 0) {
	if (x.aborted === true) return true;
	for (let i = startIndex; i < x.issues.length; i++) if (x.issues[i]?.continue === false) return true;
	return false;
}
function prefixIssues(path, issues) {
	return issues.map((iss) => {
		var _a;
		(_a = iss).path ?? (_a.path = []);
		iss.path.unshift(path);
		return iss;
	});
}
function unwrapMessage(message) {
	return typeof message === "string" ? message : message?.message;
}
/** The leading size checks of `defChecks` that set an upper bound, each paired with it. */
function sizeCaps(defChecks) {
	const caps = [];
	for (const ch of defChecks ?? []) {
		const d = ch._zod.def;
		if (!/_(length|size)$|_equals$/.test(d.check)) break;
		const max = d.maximum ?? d.length ?? d.size;
		if (max >= 0) caps.push([max, ch]);
	}
	return caps;
}
function attachSchema(issues, start, inst) {
	var _a;
	for (let i = start; i < issues.length; i++) (_a = issues[i]).schema ?? (_a.schema = inst);
}
function finalizeIssue(iss, ctx, config) {
	var _a;
	const traits = iss.inst?._zod?.traits;
	if (traits?.has("$ZodType")) {
		if (traits.has("$ZodCheck")) (_a = iss).schema ?? (_a.schema = iss.inst);
		else iss.schema = iss.inst;
	}
	const schemaError = iss.schema !== iss.inst ? iss.schema?._zod.def?.error : void 0;
	const message = iss.message ? iss.message : unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ?? unwrapMessage(schemaError?.(iss)) ?? unwrapMessage(ctx?.error?.(iss)) ?? unwrapMessage(config.customError?.(iss)) ?? unwrapMessage(config.localeError?.(iss)) ?? "Invalid input";
	const full = {};
	for (const k of Object.keys(iss)) {
		if (k === "inst" || k === "schema" || k === "continue" || k === "input" || k === "__proto__") continue;
		full[k] = iss[k];
	}
	full.path ?? (full.path = []);
	full.message = message;
	if (ctx?.reportInput) full.input = iss.input;
	return full;
}
var highSurrogate = /[\uD800-\uDBFF]/;
function codePointLength(str) {
	const units = str.length;
	if (!highSurrogate.test(str)) return units;
	let count = units;
	for (let i = 0; i < units - 1; i++) if ((str.charCodeAt(i) & 64512) === 55296 && (str.charCodeAt(i + 1) & 64512) === 56320) {
		count--;
		i++;
	}
	return count;
}
function getLengthableOrigin(input) {
	if (Array.isArray(input)) return "array";
	if (typeof input === "string") return "string";
	return "unknown";
}
function issue(...args) {
	const [iss, input, inst] = args;
	if (typeof iss === "string") return {
		message: iss,
		code: "custom",
		input,
		inst
	};
	return { ...iss };
}
/**
* Installs a trait's members on its prototype. Each value builds that member for the instance on first read; the built value shadows the accessor as an own property, so a detached `const { parse } = schema` keeps working.
*
* Call this from a `proto` initializer, which runs once per prototype — never per instance.
*/
function members(proto, table) {
	for (const key in table) {
		const desc = Object.getOwnPropertyDescriptor(table, key);
		if (desc.get) Object.defineProperty(proto, key, {
			...desc,
			enumerable: false
		});
		else defineBound(proto, key, desc.value);
	}
}
/** Shadows a prototype member with an own value, so a getter that builds from the instance runs once. */
function own(inst, key, value, enumerable = true) {
	Object.defineProperty(inst, key, {
		configurable: true,
		writable: true,
		enumerable,
		value
	});
	return value;
}
/** Like {@link own}, for a member that was never an own data property and has to stay out of `Object.keys`. */
function hide(inst, key, value) {
	return own(inst, key, value, false);
}
function defineBound(proto, key, fn) {
	Object.defineProperty(proto, key, {
		configurable: true,
		get() {
			return this == null ? fn : own(this, key, fn.bind(this));
		},
		set(value) {
			own(this, key, value);
		}
	});
}
/** Returns the prototype to install on, or `undefined` if this group is already installed on it. */
function claim(inst, sentinel) {
	const proto = Object.getPrototypeOf(inst);
	return sentinel in proto ? void 0 : proto;
}
var installing;
var broke = false;
var breaker = {
	configurable: true,
	get() {
		broke = true;
	}
};
/**
* Installs a lazily-derived internal on the `_zod` prototype of `inst`'s
* constructor, computed from the internals object itself and cached there on
* first read. One accessor per constructor rather than one per instance.
*/
function defineLazyInternal(inst, key, compute) {
	const proto = Object.getPrototypeOf(inst._zod);
	if (key in proto && installing !== inst._zod) {
		installing = void 0;
		return;
	}
	installing = inst._zod;
	Object.defineProperty(proto, key, {
		configurable: true,
		get() {
			Object.defineProperty(this, key, breaker);
			const outer = broke;
			broke = false;
			try {
				const value = compute(this);
				if (broke) delete this[key];
				else Object.defineProperty(this, key, {
					configurable: true,
					writable: true,
					value
				});
				broke = broke || outer;
				return value;
			} catch (err) {
				delete this[key];
				broke = broke || outer;
				throw err;
			}
		},
		set(value) {
			Object.defineProperty(this, key, {
				configurable: true,
				writable: true,
				value
			});
		}
	});
}
/**
* Installs `key` on `inst`'s prototype, computed by `make` on first read and cached there as an own
* data property. One accessor per constructor rather than one per instance, because an own accessor
* puts every instance after the first into v8 dictionary mode. The key doubles as the sentinel.
*/
function installLazyProp(inst, key, make, enumerable) {
	const proto = claim(inst, key);
	if (!proto) return;
	Object.defineProperty(proto, key, {
		configurable: true,
		get() {
			const desc = {
				configurable: true,
				writable: true,
				enumerable,
				value: void 0
			};
			Object.defineProperty(this, key, desc);
			desc.value = make(this);
			Object.defineProperty(this, key, desc);
			return desc.value;
		},
		set(value) {
			Object.defineProperty(this, key, {
				configurable: true,
				writable: true,
				enumerable,
				value
			});
		}
	});
}
// node_modules/@cloudflare/sandbox/node_modules/zod/v4/core/core.js
var _a;
var _zodDesc = {
	value: void 0,
	enumerable: false
};
var _E = "captureStackTrace" in Error ? Error : null;
function newError(Definition) {
	const E = _E;
	if (E) {
		const saved = E.stackTraceLimit;
		if (typeof saved === "number") {
			try {
				E.stackTraceLimit = 0;
			} catch {
				_E = null;
				return new Definition();
			}
			try {
				return new Definition();
			} finally {
				E.stackTraceLimit = saved;
			}
		}
	}
	return new Definition();
}
/* @__NO_SIDE_EFFECTS__ */
function $constructor(name, initializer, proto, params) {
	const zodProto = {};
	function Internals(def) {
		this.def = def;
		this.constr = _;
		this.traits = /* @__PURE__ */ new Set();
	}
	Internals.prototype = zodProto;
	const protoMembers = proto;
	const initialized = protoMembers && /* @__PURE__ */ new WeakSet();
	function init(inst, def) {
		if (!inst._zod) {
			_zodDesc.value = new Internals(def);
			try {
				Object.defineProperty(inst, "_zod", _zodDesc);
			} finally {
				_zodDesc.value = void 0;
			}
		} else if (inst._zod.traits.has(name)) return;
		inst._zod.traits.add(name);
		initializer(inst, def);
		if (initialized) {
			const own = Object.getPrototypeOf(inst);
			const ctorProto = inst._zod.constr.prototype;
			let up = own;
			while (up && up !== ctorProto) up = Object.getPrototypeOf(up);
			const target = up ?? own;
			if (!initialized.has(target)) {
				initialized.add(target);
				members(target, protoMembers);
			}
		}
		const proto = _.prototype;
		for (const k in proto) {
			if (!Object.prototype.hasOwnProperty.call(proto, k)) continue;
			if (!(k in inst)) inst[k] = proto[k].bind(inst);
		}
	}
	const Parent = params?.Parent ?? Object;
	class Definition extends Parent {}
	Object.defineProperty(Definition, "name", { value: name });
	function _(def) {
		const inst = params?.Parent ? newError(Definition) : this;
		init(inst, def);
		const deferred = inst._zod.deferred;
		if (deferred) {
			for (const fn of deferred) fn();
			inst._zod.deferred = void 0;
		}
		const pp = globalThis.__zod_globalConfig?.postProcessor;
		if (pp) pp(inst);
		return inst;
	}
	Object.defineProperty(_, "init", { value: init });
	Object.defineProperty(_, Symbol.hasInstance, { value: (inst) => {
		if (params?.Parent && inst instanceof params.Parent) return true;
		return inst?._zod?.traits?.has(name);
	} });
	Object.defineProperty(_, "name", { value: name });
	return _;
}
var $ZodAsyncError = class extends Error {
	constructor() {
		super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
	}
};
(_a = globalThis).__zod_globalConfig ?? (_a.__zod_globalConfig = {});
var globalConfig = globalThis.__zod_globalConfig;
function config(newConfig) {
	if (newConfig) Object.assign(globalConfig, newConfig);
	return globalConfig;
}
// node_modules/@cloudflare/sandbox/node_modules/zod/v4/core/errors.js
function _getMessage() {
	const internals = this._zod;
	internals.message ?? (internals.message = JSON.stringify(internals.def, jsonStringifyReplacer, 2));
	return internals.message;
}
function _setMessage(value) {
	this._zod.message = value;
}
var _messageDesc = {
	get: _getMessage,
	set: _setMessage,
	enumerable: true,
	configurable: true
};
var _issuesDesc = {
	value: void 0,
	enumerable: false
};
var _installedToString = /* @__PURE__ */ new WeakSet([Object.prototype, Error.prototype]);
var initializer = (inst, def) => {
	inst.name = "$ZodError";
	_issuesDesc.value = def;
	Object.defineProperty(inst, "issues", _issuesDesc);
	_issuesDesc.value = void 0;
	Object.defineProperty(inst, "message", _messageDesc);
	const proto = Object.getPrototypeOf(inst);
	if (!_installedToString.has(proto)) {
		_installedToString.add(proto);
		Object.defineProperty(proto, "toString", {
			configurable: true,
			enumerable: false,
			get() {
				const value = () => this.message;
				Object.defineProperty(this, "toString", {
					value,
					configurable: true,
					writable: true
				});
				return value;
			},
			set(value) {
				Object.defineProperty(this, "toString", {
					value,
					configurable: true,
					writable: true
				});
			}
		});
	}
};
var $ZodRealError = /* @__PURE__ */ $constructor("$ZodError", initializer, void 0, { Parent: Error });
// node_modules/@cloudflare/sandbox/node_modules/zod/v4/core/parse.js
var _parse = (_Err) => {
	const fn = (schema, value, _ctx, _params) => {
		const ctx = _ctx ? {
			..._ctx,
			async: false
		} : { async: false };
		const result = schema._zod.run({
			value,
			issues: []
		}, ctx);
		if (result instanceof Promise) throw new $ZodAsyncError();
		if (result.issues.length) {
			const e = new ((_params?.Err) ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
			captureStackTrace(e, _params?.callee ?? fn);
			throw e;
		}
		return result.value;
	};
	return fn;
};
var parse = /* @__PURE__*/ _parse($ZodRealError);
var _parseAsync = (_Err) => {
	const fn = async (schema, value, _ctx, params) => {
		const ctx = _ctx ? {
			..._ctx,
			async: true
		} : { async: true };
		let result = schema._zod.run({
			value,
			issues: []
		}, ctx);
		if (result instanceof Promise) result = await result;
		if (result.issues.length) {
			const e = new ((params?.Err) ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
			captureStackTrace(e, params?.callee ?? fn);
			throw e;
		}
		return result.value;
	};
	return fn;
};
var parseAsync = /* @__PURE__*/ _parseAsync($ZodRealError);
var _safeParse = (_Err) => (schema, value, _ctx) => {
	const ctx = _ctx ? {
		..._ctx,
		async: false
	} : { async: false };
	const result = schema._zod.run({
		value,
		issues: []
	}, ctx);
	if (result instanceof Promise) throw new $ZodAsyncError();
	return result.issues.length ? failure(_Err, result.issues, ctx) : {
		success: true,
		data: result.value
	};
};
var safeParse = /* @__PURE__*/ _safeParse($ZodRealError);
function failure(Err, issues, ctx) {
	let error;
	return {
		success: false,
		get error() {
			if (!error) {
				error = new Err(issues.map((iss) => finalizeIssue(iss, ctx, config())));
				issues = void 0;
				ctx = void 0;
			}
			return error;
		},
		set error(e) {
			error = e;
			issues = void 0;
			ctx = void 0;
		}
	};
}
var _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
	const ctx = _ctx ? {
		..._ctx,
		async: true
	} : { async: true };
	let result = schema._zod.run({
		value,
		issues: []
	}, ctx);
	if (result instanceof Promise) result = await result;
	return result.issues.length ? failure(_Err, result.issues, ctx) : {
		success: true,
		data: result.value
	};
};
var safeParseAsync = /* @__PURE__*/ _safeParseAsync($ZodRealError);
// node_modules/@cloudflare/sandbox/node_modules/zod/v4/core/regexes.js
var anyString = /^[\s\S]{0,}$/;
var number$1 = /^-?\d+(?:\.\d+)?$/;
var boolean$1 = /^(?:true|false)$/i;
// node_modules/@cloudflare/sandbox/node_modules/zod/v4/core/checks.js
var $ZodCheck = /*@__PURE__*/ $constructor("$ZodCheck", (inst, def) => {
	var _a;
	inst._zod ?? (inst._zod = {});
	inst._zod.def = def;
	(_a = inst._zod).onattach ?? (_a.onattach = []);
});
/** Default `when` for length-based checks: run only on non-nullish values with a `length`. */
var _whenHasLength = (payload) => {
	const val = payload.value;
	return !nullish(val) && val.length !== void 0;
};
var numericOriginMap = {
	number: "number",
	bigint: "bigint",
	object: "date"
};
var $ZodCheckGreaterThan = /*@__PURE__*/ $constructor("$ZodCheckGreaterThan", (inst, def) => {
	$ZodCheck.init(inst, def);
	const origin = numericOriginMap[typeof def.value];
	inst._zod.check = (payload) => {
		if (def.inclusive ? payload.value >= def.value : payload.value > def.value) return;
		payload.issues.push({
			origin: numericOriginMap[typeof payload.value] ?? origin,
			code: "too_small",
			minimum: typeof def.value === "object" ? def.value.getTime() : def.value,
			input: payload.value,
			inclusive: def.inclusive,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckNumberFormat = /*@__PURE__*/ $constructor("$ZodCheckNumberFormat", (inst, def) => {
	$ZodCheck.init(inst, def);
	def.format = def.format || "float64";
	const isInt = def.format?.includes("int");
	const origin = isInt ? "int" : "number";
	const [minimum, maximum] = NUMBER_FORMAT_RANGES[def.format];
	inst._zod.check = (payload) => {
		const input = payload.value;
		if (isInt) {
			if (!Number.isInteger(input)) {
				payload.issues.push({
					expected: origin,
					format: def.format,
					code: "invalid_type",
					continue: false,
					input,
					inst
				});
				return;
			}
			if (!Number.isSafeInteger(input)) {
				if (input > 0) payload.issues.push({
					input,
					code: "too_big",
					maximum: Number.MAX_SAFE_INTEGER,
					note: "Integers must be within the safe integer range.",
					inst,
					origin,
					inclusive: true,
					continue: !def.abort
				});
				else payload.issues.push({
					input,
					code: "too_small",
					minimum: Number.MIN_SAFE_INTEGER,
					note: "Integers must be within the safe integer range.",
					inst,
					origin,
					inclusive: true,
					continue: !def.abort
				});
				return;
			}
		}
		if (input < minimum) payload.issues.push({
			origin: "number",
			input,
			code: "too_small",
			minimum,
			inclusive: true,
			inst,
			continue: !def.abort
		});
		if (input > maximum) payload.issues.push({
			origin: "number",
			input,
			code: "too_big",
			maximum,
			inclusive: true,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckMinLength = /*@__PURE__*/ $constructor("$ZodCheckMinLength", (inst, def) => {
	var _a;
	$ZodCheck.init(inst, def);
	(_a = inst._zod.def).when ?? (_a.when = _whenHasLength);
	inst._zod.check = (payload) => {
		const input = payload.value;
		const units = input.length;
		if ((typeof input === "string" && units >= def.minimum && units < def.minimum * 2 ? codePointLength(input) : units) >= def.minimum) return;
		const origin = getLengthableOrigin(input);
		payload.issues.push({
			origin,
			code: "too_small",
			minimum: def.minimum,
			inclusive: true,
			input,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckStringFormat = /*@__PURE__*/ $constructor("$ZodCheckStringFormat", (inst, def) => {
	var _a, _b;
	$ZodCheck.init(inst, def);
	if (def.pattern) (_a = inst._zod).check ?? (_a.check = (payload) => {
		def.pattern.lastIndex = 0;
		if (def.pattern.test(payload.value)) return;
		payload.issues.push({
			origin: "string",
			code: "invalid_format",
			format: def.format,
			input: payload.value,
			...def.pattern ? { pattern: def.pattern.toString() } : {},
			inst,
			continue: !def.abort
		});
	});
	else (_b = inst._zod).check ?? (_b.check = () => {});
});
var $ZodCheckRegex = /*@__PURE__*/ $constructor("$ZodCheckRegex", (inst, def) => {
	$ZodCheckStringFormat.init(inst, def);
	inst._zod.check = (payload) => {
		def.pattern.lastIndex = 0;
		if (def.pattern.test(payload.value)) return;
		payload.issues.push({
			origin: "string",
			code: "invalid_format",
			format: "regex",
			input: payload.value,
			pattern: def.pattern.toString(),
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckStartsWith = /*@__PURE__*/ $constructor("$ZodCheckStartsWith", (inst, def) => {
	$ZodCheck.init(inst, def);
	const pattern = new RegExp(`^${escapeRegex(def.prefix)}.*`);
	def.pattern ?? (def.pattern = pattern);
	inst._zod.check = (payload) => {
		if (payload.value.startsWith(def.prefix)) return;
		payload.issues.push({
			origin: "string",
			code: "invalid_format",
			format: "starts_with",
			prefix: def.prefix,
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
// node_modules/@cloudflare/sandbox/node_modules/zod/v4/core/versions.js
var version = {
	major: 4,
	minor: 6,
	patch: 7
};
// node_modules/@cloudflare/sandbox/node_modules/zod/v4/core/schemas.js
var $ZodType = /*@__PURE__*/ $constructor("$ZodType", (inst, def) => {
	var _a;
	inst ?? (inst = {});
	inst._zod.def = def;
	inst._zod.bag = inst._zod.bag || {};
	inst._zod.version = version;
	const defChecks = inst._zod.def.checks;
	const checks = inst._zod.traits.has("$ZodCheck") ? [inst, ...defChecks ?? []] : defChecks?.length ? [...defChecks] : [];
	for (const ch of checks) for (const fn of ch._zod.onattach) fn(inst);
	if (checks.length === 0) {
		(_a = inst._zod).deferred ?? (_a.deferred = []);
		inst._zod.deferred?.push(() => {
			inst._zod.run = inst._zod.parse;
		});
	} else {
		const runChecks = (payload, checks, ctx) => {
			if (payload.memo) return payload;
			let isAborted = aborted(payload);
			let asyncResult;
			for (const ch of checks) {
				if (ch._zod.def.when) {
					if (explicitlyAborted(payload)) continue;
					if (!ch._zod.def.when(payload)) continue;
				} else if (isAborted) continue;
				const currLen = payload.issues.length;
				const _ = ch._zod.check(payload);
				if (_ instanceof Promise && ctx?.async === false) throw new $ZodAsyncError();
				if (asyncResult || _ instanceof Promise) asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
					await _;
					if (payload.issues.length === currLen) return;
					attachSchema(payload.issues, currLen, inst);
					if (!isAborted) isAborted = aborted(payload, currLen);
				});
				else {
					if (payload.issues.length === currLen) continue;
					attachSchema(payload.issues, currLen, inst);
					if (!isAborted) isAborted = aborted(payload, currLen);
				}
			}
			if (asyncResult) return asyncResult.then(() => {
				return payload;
			});
			return payload;
		};
		const handleCanaryResult = (canary, payload, ctx) => {
			if (aborted(canary)) {
				canary.aborted = true;
				return canary;
			}
			const checkResult = runChecks(payload, checks, ctx);
			if (checkResult instanceof Promise) {
				if (ctx.async === false) throw new $ZodAsyncError();
				return checkResult.then((checkResult) => inst._zod.parse(checkResult, ctx));
			}
			return inst._zod.parse(checkResult, ctx);
		};
		inst._zod.run = (payload, ctx) => {
			if (ctx.skipChecks) return inst._zod.parse(payload, ctx);
			if (ctx.direction === "backward") {
				const canary = inst._zod.parse({
					value: payload.value,
					issues: []
				}, {
					...ctx,
					skipChecks: true
				});
				if (canary instanceof Promise) return canary.then((canary) => {
					return handleCanaryResult(canary, payload, ctx);
				});
				return handleCanaryResult(canary, payload, ctx);
			}
			const result = inst._zod.parse(payload, ctx);
			if (result instanceof Promise) {
				if (ctx.async === false) throw new $ZodAsyncError();
				return result.then((result) => runChecks(result, checks, ctx));
			}
			return runChecks(result, checks, ctx);
		};
	}
}, {
	get "~standard"() {
		return hide(this, "~standard", standardProps(this));
	},
	set "~standard"(value) {
		own(this, "~standard", value);
	}
});
/** The Standard Schema surface for `inst`. Shared so wrappers can extend it without forcing it. */
var toStandardResult = (r, ctx) => r.issues.length ? { issues: r.issues.map((iss) => finalizeIssue(iss, ctx, config())) } : { value: r.value };
async function validateAsync(inst, value) {
	const ctx = { async: true };
	return toStandardResult(await inst._zod.run({
		value,
		issues: []
	}, ctx), ctx);
}
function standardProps(inst) {
	return {
		validate: (value) => {
			const ctx = { async: false };
			try {
				const r = inst._zod.run({
					value,
					issues: []
				}, ctx);
				if (!(r instanceof Promise)) return toStandardResult(r, ctx);
			} catch (_) {}
			return validateAsync(inst, value);
		},
		vendor: "zod",
		version: 1
	};
}
var $ZodString = /*@__PURE__*/ $constructor("$ZodString", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.pattern = def.pattern ?? anyString;
	inst._zod.parse = (payload, _) => {
		if (def.coerce) try {
			payload.value = String(payload.value);
		} catch (_) {}
		if (typeof payload.value === "string") return payload;
		payload.issues.push({
			expected: "string",
			code: "invalid_type",
			input: payload.value,
			inst
		});
		return payload;
	};
});
var $ZodNumber = /*@__PURE__*/ $constructor("$ZodNumber", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.pattern = number$1;
	inst._zod.parse = (payload, _ctx) => {
		if (def.coerce) try {
			payload.value = Number(payload.value);
		} catch (_) {}
		const input = payload.value;
		if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) return payload;
		const received = typeof input === "number" ? Number.isNaN(input) ? "NaN" : !Number.isFinite(input) ? String(input) : void 0 : void 0;
		payload.issues.push({
			expected: "number",
			code: "invalid_type",
			input,
			inst,
			...received ? { received } : {}
		});
		return payload;
	};
});
var $ZodNumberFormat = /*@__PURE__*/ $constructor("$ZodNumberFormat", (inst, def) => {
	$ZodCheckNumberFormat.init(inst, def);
	$ZodNumber.init(inst, def);
});
var $ZodBoolean = /*@__PURE__*/ $constructor("$ZodBoolean", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.pattern = boolean$1;
	inst._zod.parse = (payload, _ctx) => {
		if (def.coerce) try {
			payload.value = Boolean(payload.value);
		} catch (_) {}
		const input = payload.value;
		if (typeof input === "boolean") return payload;
		payload.issues.push({
			expected: "boolean",
			code: "invalid_type",
			input,
			inst
		});
		return payload;
	};
});
var $ZodNever = /*@__PURE__*/ $constructor("$ZodNever", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.parse = (payload, _ctx) => {
		payload.issues.push({
			expected: "never",
			code: "invalid_type",
			input: payload.value,
			inst
		});
		return payload;
	};
});
function capSize(inst, size) {
	const caps = sizeCaps(inst._zod.def.checks);
	if (!caps.length) return;
	const cap = Math.min(...caps.map((c) => c[0]));
	const parse = inst._zod.parse;
	inst._zod.parse = (payload, ctx) => {
		const n = size(payload.value);
		if (n > cap && !ctx?.skipChecks && ctx?.direction !== "backward") {
			for (const [max, ch] of sizeCaps(inst._zod.def.checks)) if (n > max && ch._zod.def.when(payload)) {
				const start = payload.issues.length;
				ch._zod.check(payload);
				payload.issues[start].continue = false;
				attachSchema(payload.issues, start, inst);
				return payload;
			}
		}
		return parse(payload, ctx);
	};
}
var arraySize = (input) => Array.isArray(input) ? input.length : -1;
function handleArrayResult(result, final, index) {
	if (result.issues.length) final.issues.push(...prefixIssues(index, result.issues));
	final.value[index] = result.value;
}
var $ZodArray = /*@__PURE__*/ $constructor("$ZodArray", (inst, def) => {
	$ZodType.init(inst, def);
	const memo = globalConfig.memoizer;
	memo?.attach(inst);
	inst._zod.parse = (payload, ctx) => {
		const input = payload.value;
		if (!Array.isArray(input)) {
			payload.issues.push({
				expected: "array",
				code: "invalid_type",
				input,
				inst
			});
			return payload;
		}
		payload.value = memo ? memo.alloc(inst, payload, Array(input.length), ctx) : Array(input.length);
		const proms = [];
		const abortEarly = ctx?.abortEarly;
		for (let i = 0; i < input.length; i++) {
			const item = input[i];
			const result = def.element._zod.run({
				value: item,
				issues: []
			}, ctx);
			if (result instanceof Promise) proms.push(result.then((result) => handleArrayResult(result, payload, i)));
			else {
				handleArrayResult(result, payload, i);
				if (abortEarly && result.issues.length !== 0 && aborted(result)) break;
			}
		}
		if (proms.length) return Promise.all(proms).then(() => payload);
		return payload;
	};
	capSize(inst, arraySize);
});
function handlePropertyResult(result, final, key, input, optin, optout) {
	const isPresent = key in input;
	const isOptionalOut = optout === "optional";
	if (!isPresent && isOptionalOut && optin === "optional") return;
	if (result.issues.length) {
		if (optin !== void 0 && isOptionalOut && !isPresent) return;
		final.issues.push(...prefixIssues(key, result.issues));
	}
	if (!isPresent && optin === void 0) {
		if (!result.issues.length) final.issues.push({
			code: "invalid_type",
			expected: "nonoptional",
			input: void 0,
			path: [key]
		});
		return;
	}
	if (result.value === void 0) {
		if (isPresent || optin === "defaulted" && !isOptionalOut) final.value[key] = void 0;
	} else final.value[key] = result.value;
}
var NO_SYMBOL_KEYS = [];
function normalizeDef(def) {
	const keys = Object.keys(def.shape);
	const ownSymbols = Object.getOwnPropertySymbols(def.shape);
	const symbolKeys = ownSymbols.length ? ownSymbols : NO_SYMBOL_KEYS;
	const allKeys = symbolKeys.length ? [...keys, ...symbolKeys] : keys;
	for (const k of allKeys) if (!def.shape?.[k]?._zod?.traits?.has("$ZodType")) throw new Error(`Invalid element at key "${String(k)}": expected a Zod schema`);
	const okeys = optionalKeys(def.shape);
	return {
		...def,
		allKeys,
		symbolKeys,
		keySet: new Set(keys),
		numKeys: keys.length,
		optionalKeys: new Set(okeys)
	};
}
function handleCatchall(proms, input, payload, ctx, def, inst, abortEarly) {
	const unrecognized = [];
	const keySet = def.keySet;
	const _catchall = def.catchall._zod;
	const t = _catchall.def.type;
	const optin = _catchall.optin;
	const optout = _catchall.optout;
	let seen = 0;
	for (const key in input) {
		if (abortEarly && payload.issues.length !== seen) {
			if (aborted(payload, seen)) break;
			seen = payload.issues.length;
		}
		if (keySet.has(key)) continue;
		if (key === "__proto__") {
			if (t === "never") unrecognized.push(key);
			continue;
		}
		if (t === "never") {
			unrecognized.push(key);
			continue;
		}
		const r = _catchall.run({
			value: input[key],
			issues: []
		}, ctx);
		if (r instanceof Promise) proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, optin, optout)));
		else handlePropertyResult(r, payload, key, input, optin, optout);
	}
	if (unrecognized.length) payload.issues.push({
		code: "unrecognized_keys",
		keys: unrecognized,
		input,
		inst,
		continue: true
	});
	if (!proms.length) return payload;
	return Promise.all(proms).then(() => {
		return payload;
	});
}
var $ZodObject = /*@__PURE__*/ $constructor("$ZodObject", (inst, def) => {
	$ZodType.init(inst, def);
	const desc = Object.getOwnPropertyDescriptor(def, "shape");
	const sh = desc?.get ? desc.get.raw : def.shape ?? {};
	if (sh) {
		const get = () => {
			const newSh = { ...sh };
			Object.defineProperty(def, "shape", { value: newSh });
			get.raw = newSh;
			return newSh;
		};
		get.raw = sh;
		Object.defineProperty(def, "shape", { get });
	}
	const _normalized = cached(() => normalizeDef(def));
	defineLazyInternal(inst, "propValues", (zod) => {
		const shape = zod.def.shape;
		const propValues = {};
		for (const key in shape) {
			const field = shape[key]._zod;
			if (field.values) {
				if (!Object.prototype.hasOwnProperty.call(propValues, key)) assignProp(propValues, key, /* @__PURE__ */ new Set());
				for (const v of field.values) propValues[key].add(v);
				if (field.optin !== void 0) propValues[key].add(void 0);
			}
		}
		return propValues;
	});
	const isObject$1 = isObject;
	const catchall = def.catchall;
	let value;
	const memo = globalConfig.memoizer;
	memo?.attach(inst);
	inst._zod.parse = (payload, ctx) => {
		value ?? (value = _normalized.value);
		const input = payload.value;
		if (!isObject$1(input)) {
			payload.issues.push({
				expected: "object",
				code: "invalid_type",
				input,
				inst
			});
			return payload;
		}
		payload.value = memo ? memo.alloc(inst, payload, {}, ctx) : {};
		const proms = [];
		const shape = value.shape;
		const abortEarly = ctx?.abortEarly;
		let seen = payload.issues.length;
		for (const key of value.allKeys) {
			if (abortEarly && payload.issues.length !== seen) {
				if (aborted(payload, seen)) break;
				seen = payload.issues.length;
			}
			if (key === "__proto__") continue;
			const el = shape[key];
			const optin = el._zod.optin;
			const optout = el._zod.optout;
			const r = el._zod.run({
				value: input[key],
				issues: []
			}, ctx);
			if (r instanceof Promise) proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, optin, optout)));
			else handlePropertyResult(r, payload, key, input, optin, optout);
		}
		if (!catchall) return proms.length ? Promise.all(proms).then(() => payload) : payload;
		return handleCatchall(proms, input, payload, ctx, _normalized.value, inst, abortEarly === true);
	};
});
var $ZodCustom = /*@__PURE__*/ $constructor("$ZodCustom", (inst, def) => {
	$ZodCheck.init(inst, def);
	$ZodType.init(inst, def);
	inst._zod.parse = (payload, _) => {
		return payload;
	};
	inst._zod.check = (payload) => {
		const input = payload.value;
		const r = def.fn(input);
		if (r instanceof Promise) return r.then((r) => handleRefineResult(r, payload, input, inst));
		handleRefineResult(r, payload, input, inst);
	};
});
function handleRefineResult(result, payload, input, inst) {
	if (!result) {
		const _iss = {
			code: "custom",
			input,
			inst,
			path: [...inst._zod.def.path ?? []],
			continue: !inst._zod.def.abort
		};
		if (inst._zod.def.params) _iss.params = inst._zod.def.params;
		payload.issues.push(issue(_iss));
	}
}
// node_modules/@cloudflare/sandbox/node_modules/zod/v4/core/api.js
function snapshotChecks(def) {
	if (def.checks) def.checks = [...def.checks];
	return def;
}
// @__NO_SIDE_EFFECTS__
function _string(Class, params) {
	return new Class(snapshotChecks({
		type: "string",
		...normalizeParams(params)
	}));
}
// @__NO_SIDE_EFFECTS__
function _number(Class, params) {
	return new Class(snapshotChecks({
		type: "number",
		checks: [],
		...normalizeParams(params)
	}));
}
// @__NO_SIDE_EFFECTS__
function _int(Class, params) {
	return new Class({
		type: "number",
		check: "number_format",
		abort: false,
		format: "safeint",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _boolean(Class, params) {
	return new Class({
		type: "boolean",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _never(Class, params) {
	return new Class({
		type: "never",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _gt(value, params) {
	return new $ZodCheckGreaterThan({
		check: "greater_than",
		...normalizeParams(params),
		value,
		inclusive: false
	});
}
// @__NO_SIDE_EFFECTS__
function _positive(params) {
	return /* @__PURE__ */ _gt(0, params);
}
// @__NO_SIDE_EFFECTS__
function _minLength(minimum, params) {
	return new $ZodCheckMinLength({
		check: "min_length",
		...normalizeParams(params),
		minimum
	});
}
// @__NO_SIDE_EFFECTS__
function _regex(pattern, params) {
	return new $ZodCheckRegex({
		check: "string_format",
		format: "regex",
		...normalizeParams(params),
		pattern
	});
}
// @__NO_SIDE_EFFECTS__
function _startsWith(prefix, params) {
	return new $ZodCheckStartsWith({
		check: "string_format",
		format: "starts_with",
		...normalizeParams(params),
		prefix
	});
}
// @__NO_SIDE_EFFECTS__
function _custom(Class, fn, _params) {
	const norm = normalizeParams(_params);
	norm.abort ?? (norm.abort = true);
	return new Class({
		type: "custom",
		check: "custom",
		fn,
		...norm
	});
}
// @__NO_SIDE_EFFECTS__
function _refine(Class, fn, _params) {
	return new Class({
		type: "custom",
		check: "custom",
		fn,
		...normalizeParams(_params)
	});
}
// node_modules/@cloudflare/sandbox/node_modules/zod/v4/mini/schemas.js
var ZodMiniType = /*@__PURE__*/ $constructor("ZodMiniType", (inst, def) => {
	if (!inst._zod) throw new Error("Uninitialized schema in ZodMiniType.");
	$ZodType.init(inst, def);
	inst.def = def;
	inst.type = def.type;
}, {
	get with() {
		return this.check;
	},
	set with(value) {
		own(this, "with", value);
	},
	parse(data, params) {
		return parse(this, data, params, { callee: this.parse });
	},
	parseAsync(data, params) {
		return parseAsync(this, data, params, { callee: this.parseAsync });
	},
	safeParse(data, params) {
		return safeParse(this, data, params);
	},
	safeParseAsync(data, params) {
		return safeParseAsync(this, data, params);
	},
	check(...checks) {
		const def = this.def;
		return this.clone({
			...def,
			checks: [...def.checks ?? [], ...checks.map((ch) => typeof ch === "function" ? { _zod: {
				check: ch,
				def: { check: "custom" },
				onattach: []
			} } : ch)]
		}, { parent: true });
	},
	clone(_def, params) {
		return clone(this, _def, params);
	},
	brand() {
		return this;
	},
	register(reg, meta) {
		reg.add(this, meta);
		return this;
	},
	apply(fn, ...args) {
		return args.length === 0 ? fn(this) : fn(this, ...args);
	}
});
var ZodMiniString = /*@__PURE__*/ $constructor("ZodMiniString", (inst, def) => {
	$ZodString.init(inst, def);
	ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function string(params) {
	return /* @__PURE__ */ _string(ZodMiniString, params);
}
var ZodMiniNumber = /*@__PURE__*/ $constructor("ZodMiniNumber", (inst, def) => {
	$ZodNumber.init(inst, def);
	ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function number(params) {
	return /* @__PURE__ */ _number(ZodMiniNumber, params);
}
var ZodMiniNumberFormat = /*@__PURE__*/ $constructor("ZodMiniNumberFormat", (inst, def) => {
	$ZodNumberFormat.init(inst, def);
	ZodMiniNumber.init(inst, def);
});
function int(params) {
	return /* @__PURE__ */ _int(ZodMiniNumberFormat, params);
}
var ZodMiniBoolean = /*@__PURE__*/ $constructor("ZodMiniBoolean", (inst, def) => {
	$ZodBoolean.init(inst, def);
	ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function boolean(params) {
	return /* @__PURE__ */ _boolean(ZodMiniBoolean, params);
}
var ZodMiniNever = /*@__PURE__*/ $constructor("ZodMiniNever", (inst, def) => {
	$ZodNever.init(inst, def);
	ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function never(params) {
	return /* @__PURE__ */ _never(ZodMiniNever, params);
}
var ZodMiniArray = /*@__PURE__*/ $constructor("ZodMiniArray", (inst, def) => {
	$ZodArray.init(inst, def);
	ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function array(element, params) {
	return new ZodMiniArray({
		type: "array",
		element,
		...normalizeParams(params)
	});
}
var ZodMiniObject = /*@__PURE__*/ $constructor("ZodMiniObject", (inst, def) => {
	$ZodObject.init(inst, def);
	ZodMiniType.init(inst, def);
	installLazyProp(inst, "shape", (self) => self._zod.def.shape, false);
});
// @__NO_SIDE_EFFECTS__
function object(shape, params) {
	return new ZodMiniObject({
		type: "object",
		shape: shape ?? {},
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function strictObject(shape, params) {
	return new ZodMiniObject({
		type: "object",
		shape,
		catchall: /* @__PURE__ */ never(),
		...normalizeParams(params)
	});
}
var ZodMiniCustom = /*@__PURE__*/ $constructor("ZodMiniCustom", (inst, def) => {
	$ZodCustom.init(inst, def);
	ZodMiniType.init(inst, def);
});
// @__NO_SIDE_EFFECTS__
function custom(fn, _params) {
	return /* @__PURE__ */ _custom(ZodMiniCustom, fn ?? (() => true), _params);
}
// @__NO_SIDE_EFFECTS__
function refine(fn, _params = {}) {
	return /* @__PURE__ */ _refine(ZodMiniCustom, fn, _params);
}
// @__NO_SIDE_EFFECTS__
function _instanceof(cls, params = {}) {
	const inst = /* @__PURE__ */ custom((data) => data instanceof cls, params);
	inst._zod.bag.Class = cls;
	inst._zod.check = (payload) => {
		if (!(payload.value instanceof cls)) payload.issues.push({
			code: "invalid_type",
			expected: cls.name,
			input: payload.value,
			inst,
			path: [...inst._zod.def.path ?? []]
		});
	};
	return inst;
}
/**
* @license MIT <https://opensource.org/licenses/MIT>
* @copyright Michael Hart 2024
*/
new TextEncoder();
var CANONICAL_ERRNO_NAMES = /* @__PURE__ */ new Map();
for (const [name, value] of Object.entries(constants.errno)) if (name.startsWith("E") && !CANONICAL_ERRNO_NAMES.has(value)) CANONICAL_ERRNO_NAMES.set(value, name);
for (const preferred of [
	"EAGAIN",
	"EDEADLK",
	"EOPNOTSUPP"
]) {
	const value = constants.errno[preferred];
	if (value !== void 0) CANONICAL_ERRNO_NAMES.set(value, preferred);
}
var FileError = class extends Error {
	name = "SandboxFileError";
	code;
	operation;
	path;
	destination;
	detail;
	constructor(context, code, detail) {
		const subject = context.destination === void 0 ? `'${context.path}'` : `'${context.path}' to '${context.destination}'`;
		super(`${context.operation} ${subject}: ${detail}`);
		this.code = code;
		this.operation = context.operation;
		this.path = context.path;
		if (context.destination !== void 0) this.destination = context.destination;
		this.detail = detail;
	}
};
var ProtocolError = class extends Error {
	name = "SandboxProtocolError";
	code = "SANDBOX_PROTOCOL_ERROR";
	detail;
	constructor(detail, cause) {
		super(detail, cause === void 0 ? void 0 : { cause });
		this.detail = detail;
	}
};
function protocolError(detail, cause) {
	return new ProtocolError(detail, cause);
}
function fileErrorFromErrno(context, errno, detail) {
	const code = CANONICAL_ERRNO_NAMES.get(errno) ?? "UNKNOWN";
	return new FileError(context, code, detail.length > 0 ? detail : code);
}
var optionsSchema = /* @__PURE__ */ object({});
function validateOptions(options, rules) {
	if (!optionsSchema.safeParse(options).success) throw new TypeError("options must be an object");
	for (const [name, value] of Object.entries(options)) {
		if (value === void 0) continue;
		if (!Object.hasOwn(rules, name)) throw new TypeError(`unknown option "${name}"`);
		const rule = rules[name];
		if (!rule.schema.safeParse(value).success) throw new TypeError(`${name} ${rule.requirement}`);
	}
}
var SHIM_PATH = "/usr/local/bin/sandbox-shim";
var MAGIC = new Uint8Array([
	83,
	66,
	88,
	70
]);
var PROTOCOL_VERSION = 1;
var HEADER_LENGTH = 10;
var ERROR_PREFIX_LENGTH = 4;
var FRAME_SUCCESS = 0;
var FRAME_FILE_ERROR = 1;
var FRAME_DATA = 2;
new TextDecoder("utf-8", { fatal: true });
var AbortMonitor = class {
	/**
	* The signal to pass to `exec()`, which follows the caller's until the shim settles. The
	* caller's signal can outlive the call, as AbortSignal.timeout() does, and signalling an exited
	* process logs a runtime error. Undefined when the process must not be signalled.
	*/
	signal;
	#promise;
	#dispose = () => void 0;
	constructor(signal, abort) {
		if (signal === void 0) return;
		const linked = new AbortController();
		if (abort === "kill") this.signal = linked.signal;
		this.#promise = new Promise((_, reject) => {
			if (signal.aborted) {
				linked.abort(signal.reason);
				reject(signal.reason);
				return;
			}
			const onAbort = () => {
				this.dispose();
				linked.abort(signal.reason);
				reject(signal.reason);
			};
			signal.addEventListener("abort", onAbort, { once: true });
			this.#dispose = () => signal.removeEventListener("abort", onAbort);
		});
		this.#promise.catch(() => void 0);
	}
	waitFor(operation) {
		if (this.#promise === void 0) return operation;
		return Promise.race([this.#promise, operation]);
	}
	dispose() {
		this.#dispose();
		this.#dispose = () => void 0;
	}
};
var ShimSession = class ShimSession {
	process;
	#abort;
	#settled = false;
	constructor(process, abort) {
		this.process = process;
		this.#abort = abort;
	}
	static async start(container, command, options, abort = "kill") {
		const monitor = new AbortMonitor(options.signal, abort);
		const starting = container.exec(command, {
			...options,
			signal: monitor.signal
		});
		try {
			return new ShimSession(await monitor.waitFor(starting), monitor);
		} catch (error) {
			monitor.dispose();
			if (abort === "stdin") starting.then(closeStdin$1, () => void 0);
			throw error;
		}
	}
	openStderrControl() {
		if (this.process.stderr === null) throw protocolError("sandbox-shim did not provide stderr");
		return new ShimControl(this.process.stderr.getReader(), this);
	}
	openStdoutControl() {
		if (this.process.stdout === null) throw protocolError("sandbox-shim did not provide stdout");
		return new ShimControl(this.process.stdout.getReader(), this);
	}
	openStdoutReader() {
		if (this.process.stdout === null) throw protocolError("sandbox-shim did not provide stdout");
		return this.process.stdout.getReader();
	}
	openStdinWriter() {
		if (this.process.stdin === null) throw protocolError("sandbox-shim did not provide stdin");
		return this.process.stdin.getWriter();
	}
	waitFor(operation) {
		return this.#abort.waitFor(operation);
	}
	/** Stops following the caller's signal: later waits no longer reject when it aborts. */
	stopFollowingSignal() {
		this.#abort.dispose();
	}
	finish() {
		if (this.#settled) return;
		this.#settled = true;
		this.#abort.dispose();
	}
	/**
	* Waits for a shim that already reported its outcome to exit, so cleanup does not signal an
	* exited process. Never throws: the reported outcome stays authoritative, and if the exit is
	* not observed, terminate() still cleans up.
	*/
	async settle() {
		try {
			await this.waitFor(this.process.exitCode);
			this.finish();
		} catch {}
	}
	terminate() {
		if (this.#settled) return;
		this.#settled = true;
		this.#abort.dispose();
		try {
			this.process.kill(9);
		} catch {}
	}
};
var ShimControl = class {
	#reader;
	#session;
	#pending = /* @__PURE__ */ new Uint8Array();
	constructor(reader, session) {
		this.#reader = reader;
		this.#session = session;
	}
	async readFrame() {
		const header = await this.#readExactly(HEADER_LENGTH);
		validateHeader(header);
		const frameKind = header[5];
		const payloadLength = new DataView(header.buffer, header.byteOffset + 6, 4).getUint32(0, true);
		if (frameKind === FRAME_SUCCESS) {
			if (payloadLength !== 0) throw protocolError("sandbox-shim returned invalid control data");
			return { kind: "success" };
		}
		if (frameKind === FRAME_DATA) return {
			kind: "data",
			payload: await this.#readExactly(payloadLength)
		};
		if (frameKind !== FRAME_FILE_ERROR) throw protocolError(`sandbox-shim returned unknown control status ${frameKind}`);
		if (payloadLength < ERROR_PREFIX_LENGTH) throw protocolError("sandbox-shim returned invalid control data");
		if (payloadLength > 65540) throw protocolError("sandbox-shim error message exceeded its size limit");
		const payload = await this.#readExactly(payloadLength);
		const errno = new DataView(payload.buffer, payload.byteOffset, ERROR_PREFIX_LENGTH).getInt32(0, true);
		if (errno <= 0) throw protocolError(`sandbox-shim returned invalid errno ${errno}`);
		return {
			kind: "fileError",
			errno,
			detail: decodeErrorDetail(payload.subarray(ERROR_PREFIX_LENGTH))
		};
	}
	async expectEnd() {
		if (!(this.#pending.length === 0 ? await this.#session.waitFor(this.#reader.read()) : {
			done: false,
			value: this.#pending
		}).done) throw protocolError("sandbox-shim returned trailing control data");
	}
	discard(reason) {
		this.#reader.cancel(reason).then(() => this.#reader.releaseLock(), () => this.#reader.releaseLock());
	}
	releaseLock() {
		this.#reader.releaseLock();
	}
	async #readExactly(length) {
		const result = new Uint8Array(length);
		let offset = 0;
		while (offset < length) {
			if (this.#pending.length === 0) {
				const next = await this.#session.waitFor(this.#reader.read());
				if (next.done) throw protocolError("sandbox-shim returned truncated control data");
				this.#pending = next.value;
			}
			const count = Math.min(length - offset, this.#pending.length);
			result.set(this.#pending.subarray(0, count), offset);
			this.#pending = this.#pending.subarray(count);
			offset += count;
		}
		return result;
	}
};
function closeStdin$1(process) {
	process.stdin?.close().catch(() => void 0);
}
function decodeErrorDetail(bytes) {
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch (cause) {
		throw protocolError("sandbox-shim returned a non-UTF-8 error message", cause);
	}
}
function validateHeader(header) {
	for (let index = 0; index < MAGIC.length; index += 1) if (header[index] !== MAGIC[index]) throw protocolError("sandbox-shim returned invalid protocol magic");
	if (header[4] !== PROTOCOL_VERSION) throw protocolError(`sandbox-shim protocol ${header[4]} is not supported`);
}
new Uint8Array([1]);
(/* @__PURE__ */ string()).check(/* @__PURE__ */ _startsWith("/"), /* @__PURE__ */ refine((value) => !value.includes("\0")));
(/* @__PURE__ */ string()).check(/* @__PURE__ */ _regex(/^[0-9a-f]{64}$/));
(/* @__PURE__ */ string()).check(/* @__PURE__ */ _regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)), (/* @__PURE__ */ number()).check(/* @__PURE__ */ refine((value) => Number.isSafeInteger(value) && value > 0));
(/* @__PURE__ */ number()).check(/* @__PURE__ */ refine((value) => Number.isSafeInteger(value) && value > 0)), (/* @__PURE__ */ array(/* @__PURE__ */ strictObject({
	partNumber: (/* @__PURE__ */ number()).check(int(), /* @__PURE__ */ _positive()),
	etag: /* @__PURE__ */ string()
}))).check(/* @__PURE__ */ _minLength(1));
/**
* Starts the shim for one file command. A relative path is joined onto `cwd`, so the shim always
* receives absolute paths and `exec()` never receives `cwd`: a missing `cwd` then fails the file
* operation with `ENOENT` instead of failing to start the process. Only `user` and `signal`
* reach `exec()`.
*/
function startFileCommand(container, command, stdio) {
	const { cwd, user, signal } = command.options;
	const execOptions = { ...stdio };
	if (user !== void 0) execOptions.user = user;
	if (signal !== void 0) execOptions.signal = signal;
	const paths = command.paths.map((path) => resolvePath(path, cwd));
	return ShimSession.start(container, [
		SHIM_PATH,
		command.name,
		...paths,
		...command.flags ?? []
	], execOptions);
}
function resolvePath(path, cwd) {
	return cwd === void 0 || path.startsWith("/") ? path : `${cwd}/${path}`;
}
async function runFileCommand(container, request) {
	const session = await startFileCommand(container, request, {
		stdout: "pipe",
		stderr: "ignore"
	});
	let control;
	try {
		control = session.openStdoutControl();
		const frame = await control.readFrame();
		await control.expectEnd();
		if (frame.kind === "fileError") {
			await session.settle();
			throw fileErrorFromErrno(request.error, frame.errno, frame.detail);
		}
		if (frame.kind !== request.expected) throw protocolError(request.expected === "data" ? "sandbox-shim did not return command data" : "sandbox-shim did not confirm command completion");
		const exitCode = await session.waitFor(session.process.exitCode);
		if (exitCode !== 0) throw protocolError(`sandbox-shim exited with code ${exitCode}`);
		control.releaseLock();
		session.finish();
		return frame.kind === "data" ? frame.payload : void 0;
	} catch (error) {
		session.terminate();
		control?.discard(error);
		throw error;
	}
}
function fileContentStream(content) {
	if (content instanceof ReadableStream) return content;
	if (content instanceof Blob) return content.stream();
	let bytes;
	if (typeof content === "string") bytes = new TextEncoder().encode(content);
	else if (content instanceof ArrayBuffer) bytes = new Uint8Array(content);
	else {
		bytes = new Uint8Array(content.byteLength);
		bytes.set(new Uint8Array(content.buffer, content.byteOffset, content.byteLength));
	}
	return new ReadableStream({ start(controller) {
		controller.enqueue(bytes);
		controller.close();
	} });
}
function decodeFileType(value) {
	switch (value) {
		case 0: return "file";
		case 1: return "directory";
		case 2: return "symlink";
		case 3: return "blockDevice";
		case 4: return "characterDevice";
		case 5: return "fifo";
		case 6: return "socket";
		default: throw protocolError("sandbox-shim returned an unknown file type");
	}
}
async function readDirectory(container, path, options) {
	return decodeEntries(await runFileCommand(container, {
		name: "read-directory",
		paths: [path],
		options,
		error: {
			operation: "readDirectory",
			path
		},
		expected: "data"
	}));
}
function decodeEntries(payload) {
	const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
	let offset = 0;
	const count = readUint32(view, offset);
	offset += 4;
	const entries = [];
	for (let index = 0; index < count; index += 1) {
		const type = decodeFileType(readByte(payload, offset));
		offset += 1;
		const nameLength = readUint16(view, offset);
		offset += 2;
		const name = decodeText(readBytes(payload, offset, nameLength));
		offset += nameLength;
		entries.push({
			name,
			type
		});
	}
	if (offset !== payload.length) throw protocolError("sandbox-shim returned trailing directory data");
	return entries;
}
function readByte(payload, offset) {
	const value = payload[offset];
	if (value === void 0) throw protocolError("sandbox-shim returned truncated directory data");
	return value;
}
function readUint16(view, offset) {
	if (offset + 2 > view.byteLength) throw protocolError("sandbox-shim returned truncated directory data");
	return view.getUint16(offset, true);
}
function readUint32(view, offset) {
	if (offset + 4 > view.byteLength) throw protocolError("sandbox-shim returned truncated directory data");
	return view.getUint32(offset, true);
}
function readBytes(payload, offset, length) {
	if (offset + length > payload.length) throw protocolError("sandbox-shim returned truncated directory data");
	return payload.subarray(offset, offset + length);
}
function decodeText(bytes) {
	try {
		return new TextDecoder("utf-8", {
			fatal: true,
			ignoreBOM: true
		}).decode(bytes);
	} catch (cause) {
		throw protocolError("sandbox-shim returned invalid UTF-8 in directory entry name", cause);
	}
}
async function readFile(container, path, options) {
	const session = await startFileCommand(container, {
		name: "read",
		paths: [path],
		options
	}, {
		stdout: "pipe",
		stderr: "pipe"
	});
	let control;
	let stdout;
	try {
		control = session.openStderrControl();
		stdout = new StdoutReader(session.openStdoutReader());
		const opening = await control.readFrame();
		stdout.stopReadingAhead();
		if (opening.kind === "fileError") {
			await control.expectEnd();
			await session.settle();
			throw fileErrorFromErrno({
				operation: "readFile",
				path
			}, opening.errno, opening.detail);
		}
		if (opening.kind !== "success") throw protocolError("sandbox-shim returned data before file bytes");
		const terminal = readTerminalControl(control);
		terminal.catch(() => void 0);
		return new Response(responseBody(session, control, stdout, terminal, path));
	} catch (error) {
		terminateRead(session, control, stdout, error);
		throw error;
	}
}
/**
* Reads the shim's stdout, reading ahead until `readFile` has the opening frame from stderr.
*
* A container transport can carry stdout and stderr over one connection with shared backpressure,
* and can deliver file bytes before the opening frame, or between its fragments. The rest of the
* frame then arrives only after something reads stdout. The shim writes the whole opening frame
* before any file byte, so the read-ahead stops once that frame is complete. After that, the
* response body reads stdout on demand, so the caller's pace applies backpressure again.
*
* The read-ahead has no size limit, because stopping before the frame is complete would bring the
* hang back. How much it holds depends on how far the transport lets stdout run ahead of stderr.
*/
var StdoutReader = class {
	#reader;
	#chunks = [];
	#pending;
	#readingAhead = true;
	constructor(reader) {
		this.#reader = reader;
		this.#readNext();
	}
	/** Stops reading ahead. Chunks already read stay queued for `read()`. */
	stopReadingAhead() {
		this.#readingAhead = false;
	}
	read() {
		const chunk = this.#chunks.shift();
		if (chunk !== void 0) return Promise.resolve({
			done: false,
			value: chunk
		});
		const pending = this.#pending ?? this.#reader.read();
		this.#pending = void 0;
		return pending;
	}
	discard(reason) {
		this.#reader.cancel(reason).then(() => this.#reader.releaseLock(), () => this.#reader.releaseLock());
	}
	releaseLock() {
		this.#reader.releaseLock();
	}
	#readNext() {
		const read = this.#reader.read();
		this.#pending = read;
		read.then((result) => {
			if (this.#pending !== read || result.done) return;
			this.#pending = void 0;
			this.#chunks.push(result.value);
			if (this.#readingAhead) this.#readNext();
		}, () => void 0);
	}
};
function responseBody(session, control, stdout, terminalFrame, path) {
	return new ReadableStream({
		pull: async (controller) => {
			try {
				const next = await session.waitFor(stdout.read());
				if (!next.done) {
					controller.enqueue(next.value);
					return;
				}
				const terminal = await session.waitFor(terminalFrame);
				if (terminal.kind === "fileError") {
					await session.settle();
					throw fileErrorFromErrno({
						operation: "readFile",
						path
					}, terminal.errno, terminal.detail);
				}
				if (terminal.kind !== "success") throw protocolError("sandbox-shim returned data after file bytes");
				stdout.releaseLock();
				control.releaseLock();
				session.finish();
				controller.close();
			} catch (error) {
				terminateRead(session, control, stdout, error);
				controller.error(error);
			}
		},
		cancel: (reason) => terminateRead(session, control, stdout, reason)
	});
}
async function readTerminalControl(control) {
	const frame = await control.readFrame();
	await control.expectEnd();
	return frame;
}
function terminateRead(session, control, stdout, reason) {
	session.terminate();
	control?.discard(reason);
	stdout?.discard(reason);
}
var STAT_PAYLOAD_LENGTH = 45;
async function statFile(container, path, options, operation) {
	const payload = await runFileCommand(container, {
		name: operation,
		paths: [path],
		options,
		error: {
			operation,
			path
		},
		expected: "data"
	});
	if (payload.length !== STAT_PAYLOAD_LENGTH) throw protocolError(`sandbox-shim returned invalid ${operation} data`);
	const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
	return {
		type: decodeFileType(payload[0]),
		size: view.getBigUint64(1, true),
		mode: view.getUint32(9, true),
		uid: view.getUint32(13, true),
		gid: view.getUint32(17, true),
		accessedAt: decodeDate(view.getBigInt64(21, true)),
		modifiedAt: decodeDate(view.getBigInt64(29, true)),
		changedAt: decodeDate(view.getBigInt64(37, true))
	};
}
function decodeDate(milliseconds) {
	const value = Number(milliseconds);
	if (!Number.isSafeInteger(value)) throw protocolError("sandbox-shim returned an out-of-range timestamp");
	const date = new Date(value);
	if (Number.isNaN(date.valueOf())) throw protocolError("sandbox-shim returned an out-of-range timestamp");
	return date;
}
async function writeFile(container, path, source, options) {
	let session;
	let control;
	let input;
	let sourceReader;
	try {
		session = await startFileCommand(container, {
			name: "write",
			paths: [path],
			options
		}, {
			stdin: "pipe",
			stdout: "pipe",
			stderr: "ignore"
		});
		control = session.openStdoutControl();
		input = session.openStdinWriter();
		const opening = await control.readFrame();
		if (opening.kind === "fileError") {
			await control.expectEnd();
			await session.settle();
		}
		expectSuccess(opening, path);
		sourceReader = source.getReader();
		const pumping = pumpSource(session, sourceReader, input);
		const terminal = terminalResult(session, control);
		const first = await Promise.race([pumping, terminal]);
		if (first.kind === "frame" || first.kind === "failure") {
			handleTerminal(first, path);
			handlePump(await pumping);
		} else if (first.kind === "sourceFailure") throw first.error;
		else if (first.kind === "inputFailure") {
			const result = await terminal;
			if (result.kind === "frame" && result.frame.kind === "fileError") expectSuccess(result.frame, path);
			if (result.kind === "failure") throw result.error;
			throw first.error;
		} else handleTerminal(await terminal, path);
		const exitCode = await session.waitFor(session.process.exitCode);
		if (exitCode !== 0) throw protocolError(`sandbox-shim exited with code ${exitCode}`);
		sourceReader.releaseLock();
		input.releaseLock();
		control.releaseLock();
		session.finish();
	} catch (error) {
		session?.terminate();
		if (input !== void 0) discardInput(input, error);
		control?.discard(error);
		if (sourceReader === void 0) source.cancel(error).catch(() => void 0);
		else discardSource(sourceReader, error);
		throw error;
	}
}
async function pumpSource(session, source, input) {
	while (true) {
		try {
			await session.waitFor(input.ready);
		} catch (error) {
			return {
				kind: "inputFailure",
				error
			};
		}
		let next;
		try {
			next = await session.waitFor(source.read());
		} catch (error) {
			return {
				kind: "sourceFailure",
				error
			};
		}
		if (next.done) try {
			await session.waitFor(input.close());
			return { kind: "complete" };
		} catch (error) {
			return {
				kind: "inputFailure",
				error
			};
		}
		if (!(next.value instanceof Uint8Array)) return {
			kind: "sourceFailure",
			error: /* @__PURE__ */ new TypeError("writeFile stream chunks must be Uint8Array values")
		};
		try {
			await session.waitFor(input.write(next.value));
		} catch (error) {
			return {
				kind: "inputFailure",
				error
			};
		}
	}
}
async function terminalResult(session, control) {
	try {
		const frame = await control.readFrame();
		await control.expectEnd();
		if (frame.kind === "fileError") await session.settle();
		return {
			kind: "frame",
			frame
		};
	} catch (error) {
		return {
			kind: "failure",
			error
		};
	}
}
function handleTerminal(result, path) {
	if (result.kind === "failure") throw result.error;
	expectSuccess(result.frame, path);
}
function handlePump(result) {
	if (result.kind !== "complete") throw result.error;
}
function expectSuccess(frame, path) {
	if (frame.kind === "fileError") throw fileErrorFromErrno({
		operation: "writeFile",
		path
	}, frame.errno, frame.detail);
	if (frame.kind !== "success") throw protocolError("sandbox-shim returned data while writing a file");
}
function discardInput(input, reason) {
	input.abort(reason).then(() => input.releaseLock(), () => input.releaseLock());
}
function discardSource(source, reason) {
	source.cancel(reason).then(() => source.releaseLock(), () => source.releaseLock());
}
var FLAG = {
	schema: /* @__PURE__ */ boolean(),
	requirement: "must be a boolean"
};
var FILE_OPTIONS = {
	cwd: {
		schema: (/* @__PURE__ */ string()).check(/* @__PURE__ */ _startsWith("/")),
		requirement: "must be an absolute path"
	},
	user: {
		schema: (/* @__PURE__ */ string()).check(/* @__PURE__ */ _regex(/^[0-9]+:[0-9]+$/)),
		requirement: "must be numeric user and group IDs, as \"uid:gid\""
	},
	signal: {
		schema: /* @__PURE__ */ _instanceof(AbortSignal),
		requirement: "must be an AbortSignal"
	}
};
var MKDIR_OPTIONS = {
	...FILE_OPTIONS,
	recursive: FLAG
};
var REMOVE_OPTIONS = {
	...FILE_OPTIONS,
	recursive: FLAG,
	force: FLAG
};
/**
* Structured file operations for a sandbox workspace.
*
* Operations run against the current native container execution. Its image must provide the matching shim at
* `/usr/local/bin/sandbox-shim`.
*/
var Files = class {
	#container;
	constructor(container) {
		this.#container = container;
	}
	/**
	* Streams bytes from a path in the running container using native Linux file semantics.
	*
	* Native container, transport, and abort failures propagate unchanged.
	*
	* @param path - Absolute path, or a relative path when `options.cwd` is provided.
	* @param options - Native execution options relevant to opening the file.
	* @returns A binary response whose body applies backpressure to the container process. A
	*   file-streaming or native transport failure can surface while the body is consumed.
	* @throws {TypeError} The path is empty, contains NUL, or is relative without `cwd`, or an
	*   option is unknown or invalid.
	* @throws {SandboxFileError} The container reports a filesystem failure before returning the
	*   response. A late file-streaming failure errors the response body with the same error type.
	* @throws {SandboxProtocolError} The package and `sandbox-shim` cannot complete their protocol.
	*/
	async readFile(path, options = {}) {
		validateOptions(options, FILE_OPTIONS);
		validatePath(path, options.cwd);
		return readFile(this.#container, path, options);
	}
	/**
	* Creates or truncates a file and streams content into it using native Linux semantics.
	*
	* The destination is opened before a caller-provided stream is consumed. Failures after that
	* point can leave a created, truncated, or partially written file. Native container, transport,
	* source-stream, and abort failures propagate unchanged.
	*
	* @throws {TypeError} The path is empty, contains NUL, or is relative without an absolute `cwd`,
	*   or an option is unknown or invalid.
	* @throws {SandboxFileError} The container reports a filesystem failure.
	* @throws {SandboxProtocolError} The package and `sandbox-shim` cannot complete their protocol.
	*/
	async writeFile(path, content, options = {}) {
		validateOptions(options, FILE_OPTIONS);
		validatePath(path, options.cwd);
		await writeFile(this.#container, path, fileContentStream(content), options);
	}
	/**
	* Returns metadata for a path using native Linux filesystem semantics.
	*
	* Native container, transport, and abort failures propagate unchanged.
	*
	* @throws {TypeError} The path is empty, contains NUL, or is relative without an absolute `cwd`,
	*   or an option is unknown or invalid.
	* @throws {SandboxFileError} The container reports a filesystem failure.
	* @throws {SandboxProtocolError} The package and `sandbox-shim` cannot complete their protocol.
	*/
	async stat(path, options = {}) {
		validateOptions(options, FILE_OPTIONS);
		validatePath(path, options.cwd);
		return statFile(this.#container, path, options, "stat");
	}
	/**
	* Returns metadata for a path without following its final symlink.
	*
	* Native container, transport, and abort failures propagate unchanged.
	*
	* @throws {TypeError} The path is empty, contains NUL, or is relative without an absolute `cwd`,
	*   or an option is unknown or invalid.
	* @throws {SandboxFileError} The container reports a filesystem failure.
	* @throws {SandboxProtocolError} The package and `sandbox-shim` cannot complete their protocol.
	*/
	async lstat(path, options = {}) {
		validateOptions(options, FILE_OPTIONS);
		validatePath(path, options.cwd);
		return statFile(this.#container, path, options, "lstat");
	}
	/**
	* Returns the immediate entries from a directory in native enumeration order.
	*
	* The directory path may resolve through a symlink, but entry types describe the entries
	* themselves and do not follow symlinks. The operation does not recurse or retrieve metadata
	* for each child.
	* Native container, transport, and abort failures propagate unchanged.
	*
	* @throws {TypeError} The path is empty, contains NUL, or is relative without an absolute `cwd`,
	*   or an option is unknown or invalid.
	* @throws {SandboxFileError} The container reports a filesystem failure.
	* @throws {SandboxProtocolError} The package and `sandbox-shim` cannot complete their protocol.
	*/
	async readDirectory(path, options = {}) {
		validateOptions(options, FILE_OPTIONS);
		validatePath(path, options.cwd);
		return readDirectory(this.#container, path, options);
	}
	/**
	* Creates a directory using native Linux filesystem semantics.
	*
	* By default only the final directory is created. With `recursive`, missing parents are
	* created and an existing target directory is accepted. Partial parent creation can remain
	* after failure or cancellation.
	* Native container, transport, and abort failures propagate unchanged.
	*
	* @throws {TypeError} The path is empty, contains NUL, or is relative without an absolute `cwd`,
	*   or an option is unknown or invalid.
	* @throws {SandboxFileError} The container reports a filesystem failure.
	* @throws {SandboxProtocolError} The package and `sandbox-shim` cannot complete their protocol.
	*/
	async mkdir(path, options = {}) {
		validateOptions(options, MKDIR_OPTIONS);
		validatePath(path, options.cwd);
		await runFileCommand(this.#container, {
			name: "mkdir",
			paths: [path],
			flags: options.recursive ? ["--recursive"] : [],
			options,
			error: {
				operation: "mkdir",
				path
			},
			expected: "success"
		});
	}
	/**
	* Renames a file, directory, or symlink using native Linux filesystem semantics.
	*
	* Existing destinations are replaced when Linux permits it. Cross-filesystem renames fail
	* with `EXDEV`; no copy-and-remove fallback is attempted.
	* Native container, transport, and abort failures propagate unchanged.
	*
	* @throws {TypeError} A path is empty, contains NUL, or is relative without an absolute `cwd`,
	*   or an option is unknown or invalid.
	* @throws {SandboxFileError} The container reports a filesystem failure.
	* @throws {SandboxProtocolError} The package and `sandbox-shim` cannot complete their protocol.
	*/
	async rename(source, destination, options = {}) {
		validateOptions(options, FILE_OPTIONS);
		validatePath(source, options.cwd);
		validatePath(destination, options.cwd);
		await runFileCommand(this.#container, {
			name: "rename",
			paths: [source, destination],
			options,
			error: {
				operation: "rename",
				path: source,
				destination
			},
			expected: "success"
		});
	}
	/**
	* Removes a file or symlink using native Linux filesystem semantics.
	*
	* Directories are rejected unless `recursive` is set. Recursive removal does not follow
	* symlinks and can leave partial effects after failure or cancellation. `force` ignores only
	* a missing target. Native container, transport, and abort failures propagate unchanged.
	*
	* @throws {TypeError} The path is empty, contains NUL, or is relative without an absolute `cwd`,
	*   or an option is unknown or invalid.
	* @throws {SandboxFileError} The container reports a filesystem failure.
	* @throws {SandboxProtocolError} The package and `sandbox-shim` cannot complete their protocol.
	*/
	async remove(path, options = {}) {
		validateOptions(options, REMOVE_OPTIONS);
		validatePath(path, options.cwd);
		const flags = [];
		if (options.recursive) flags.push("--recursive");
		if (options.force) flags.push("--force");
		await runFileCommand(this.#container, {
			name: "remove",
			paths: [path],
			flags,
			options,
			error: {
				operation: "remove",
				path
			},
			expected: "success"
		});
	}
};
function validatePath(path, cwd) {
	if (typeof path !== "string") throw new TypeError("path must be a string");
	if (path.length === 0) throw new TypeError("path must not be empty");
	if (path.includes("\0")) throw new TypeError("path cannot contain NUL characters");
	if (!path.startsWith("/") && cwd === void 0) throw new TypeError("cwd is required when path is relative");
}
new TextDecoder("utf-8", { fatal: true });
(/* @__PURE__ */ string()).check(/* @__PURE__ */ _minLength(1), /* @__PURE__ */ _regex(/^[^\0]+$/)), (/* @__PURE__ */ string()).check(/* @__PURE__ */ _minLength(1), /* @__PURE__ */ _regex(/^[^\0]+$/)), (/* @__PURE__ */ string()).check(/* @__PURE__ */ _minLength(1), /* @__PURE__ */ _regex(/^[^\0]+$/)), (/* @__PURE__ */ number()).check(int());
(/* @__PURE__ */ number()).check(/* @__PURE__ */ refine(Number.isFinite));
new Uint8Array([1]);
(/* @__PURE__ */ string()).check(/* @__PURE__ */ _regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,58}[A-Za-z0-9])?$/));
(/* @__PURE__ */ string()).check(/* @__PURE__ */ refine((value) => value.endsWith("/")));
(/* @__PURE__ */ number()).check(int());
// node_modules/void/dist/sandbox-container-BuxhwCgt.mjs
var SANDBOX_PORT_HEADER = "x-void-sandbox-port";
var OPTIONS = /* @__PURE__ */ new Set([
	"inactivityTimeoutMs",
	"enableInternet",
	"labels"
]);
var FILE_OPERATIONS = /* @__PURE__ */ new Set([
	"readFile",
	"writeFile",
	"stat",
	"lstat",
	"readDirectory",
	"mkdir",
	"rename",
	"remove"
]);
function validateSandboxOptions(options) {
	if (!options || typeof options !== "object" || Array.isArray(options)) throw new TypeError("Sandbox options must be an object.");
	for (const key of Object.keys(options)) if (!OPTIONS.has(key)) throw new TypeError(`Unsupported Sandbox option: ${key}`);
	if (options.inactivityTimeoutMs !== void 0 && (!Number.isInteger(options.inactivityTimeoutMs) || options.inactivityTimeoutMs < 1 || options.inactivityTimeoutMs > 216e5)) throw new TypeError("Sandbox inactivityTimeoutMs must be an integer between 1 and 21600000.");
	if (options.enableInternet !== void 0 && typeof options.enableInternet !== "boolean") throw new TypeError("Sandbox enableInternet must be a boolean.");
	if (options.labels !== void 0 && (!options.labels || typeof options.labels !== "object" || Array.isArray(options.labels) || Object.values(options.labels).some((value) => typeof value !== "string"))) throw new TypeError("Sandbox labels must be strings.");
}
var ProcessCapability = class extends RpcTarget {
	#process;
	#exited = false;
	#waitForExit;
	constructor(process, waitForExit) {
		super();
		this.#process = process;
		this.#waitForExit = waitForExit;
		process.exitCode.then(() => {
			this.#exited = true;
		}, () => {
			this.#exited = true;
		});
	}
	async invoke(operation, args) {
		if (!Array.isArray(args)) throw new TypeError("Sandbox arguments must be an array.");
		if (operation === "exitCode") return this.#waitForExit();
		if (operation === "kill") {
			if (this.#exited) return;
			return this.#process.kill(args[0]);
		}
		if (operation === "resize") return this.#process.resize(args[0], args[1]);
		throw new TypeError(`Unsupported Sandbox process operation: ${operation}`);
	}
};
/** Decode cancellation without trying to serialize an AbortSignal over Workers RPC. */
function operationOptions(value) {
	const { abort, ...options } = value ?? {};
	if (abort === void 0) return {
		options,
		finish() {}
	};
	if (!(abort instanceof ReadableStream)) throw new TypeError("Invalid Sandbox cancellation stream.");
	const controller = new AbortController();
	const reader = abort.getReader();
	let finished = false;
	reader.read().then(() => {
		if (!finished) controller.abort();
	}, () => {
		if (!finished) controller.abort();
	});
	return {
		options: {
			...options,
			signal: controller.signal
		},
		finish() {
			finished = true;
			reader.cancel().catch(() => {});
		}
	};
}
/** Shared native execution, used by local Workers and the trusted platform controller. */
var SandboxContainer = class extends DurableObject {
	instanceType = "lite";
	#setup;
	#options = {};
	#ready;
	starting = false;
	#epoch = 0;
	async fetch(request) {
		const value = request.headers.get(SANDBOX_PORT_HEADER);
		if (!value || !/^\d+$/.test(value)) return new Response("Invalid Sandbox TCP port.", { status: 400 });
		const port = Number(value);
		if (!Number.isInteger(port) || port < 1 || port > 65535) return new Response("Invalid Sandbox TCP port.", { status: 400 });
		const headers = new Headers(request.headers);
		headers.delete(SANDBOX_PORT_HEADER);
		await this.ensureRunning();
		return this.container.getTcpPort(port).fetch(new Request(request, { headers }));
	}
	constructor(ctx, env) {
		super(ctx, env);
		this.#ready = ctx.blockConcurrencyWhile(async () => {
			this.#options = await ctx.storage.get("__voidSandboxOptions") ?? {};
			if (this.container.running) await this.container.setInactivityTimeout(this.inactivityTimeoutMs);
		});
	}
	get container() {
		if (!this.ctx.container) throw new Error("Sandbox container binding is missing.");
		return this.ctx.container;
	}
	async configure(options) {
		validateSandboxOptions(options);
		await this.#ready;
		this.#options = { ...options };
		await this.ctx.storage.put("__voidSandboxOptions", this.#options);
		if (this.container.running) await this.container.setInactivityTimeout(this.inactivityTimeoutMs);
	}
	get inactivityTimeoutMs() {
		return this.#options.inactivityTimeoutMs ?? 6e5;
	}
	async beforeStart() {}
	async afterStart() {}
	async beforeUse() {}
	async stopped() {}
	processContext(_exitCode) {}
	async waitForProcessExit(exitCode, _context) {
		return exitCode;
	}
	/** Native abort listeners must be detached as soon as a process exits. */
	async execProcess(argv, options = {}) {
		const { signal, ...nativeOptions } = options;
		if (!signal) return this.container.exec(argv, nativeOptions);
		const controller = new AbortController();
		const abort = () => controller.abort();
		if (signal.aborted) abort();
		else signal.addEventListener("abort", abort, { once: true });
		const finish = () => signal.removeEventListener("abort", abort);
		try {
			const process = await this.container.exec(argv, {
				...nativeOptions,
				signal: controller.signal
			});
			process.exitCode.then(finish, finish);
			return process;
		} catch (error) {
			finish();
			throw error;
		}
	}
	async initializationOutput(argv, options, timeoutMs) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		const finish = () => clearTimeout(timer);
		try {
			const process = await this.execProcess(argv, {
				...options,
				signal: controller.signal
			});
			process.exitCode.then(finish, finish);
			return await process.output();
		} finally {
			finish();
		}
	}
	async initialize() {
		if ((await this.initializationOutput([
			"sh",
			"-c",
			"mkdir -p /workspace"
		], {}, 6e4)).exitCode !== 0) throw new Error("Sandbox workspace initialization failed.");
	}
	get entrypoint() {}
	get image() {
		return this.container.images.default;
	}
	async ensureRunning() {
		if (!this.#setup || !this.container.running && !this.starting) {
			this.starting = true;
			this.#setup = this.setup(this.#epoch).catch((error) => {
				this.#setup = void 0;
				throw error;
			}).finally(() => {
				this.starting = false;
			});
		}
		await this.#setup;
		await this.beforeUse();
	}
	async setup(epoch) {
		await this.#ready;
		try {
			await this.beforeStart();
			if (epoch !== this.#epoch) throw new Error("Sandbox startup was cancelled.");
			if (!this.container.running) this.container.start({
				image: this.image,
				instance: this.instanceType,
				enableInternet: this.#options.enableInternet ?? false,
				labels: this.#options.labels,
				...this.entrypoint ? { entrypoint: this.entrypoint } : {}
			});
			await this.container.setInactivityTimeout(this.inactivityTimeoutMs);
			await this.initialize();
			if (epoch !== this.#epoch) throw new Error("Sandbox startup was cancelled.");
			await this.afterStart();
		} catch (error) {
			await this.destroy().catch(() => {});
			throw error;
		}
	}
	async destroy() {
		this.#epoch++;
		if (this.container.running) await this.container.destroy();
		if (this.container.running) throw new Error("VOID_SANDBOX_unavailable");
		if (!this.starting) this.#setup = void 0;
		await this.stopped();
	}
	async invoke(operation, args) {
		if (!Array.isArray(args)) throw new TypeError("Sandbox arguments must be an array.");
		if (operation === "destroy") return this.destroy();
		if (operation === "running") return this.container.running;
		if (operation === "files") {
			const [method, ...parameters] = args;
			if (!FILE_OPERATIONS.has(method)) throw new TypeError(`Unsupported Sandbox file operation: ${String(method)}`);
			await this.ensureRunning();
			const index = method === "writeFile" || method === "rename" ? 2 : 1;
			const { options, finish } = operationOptions(parameters[index]);
			parameters[index] = options;
			try {
				const files = new Files({ exec: (argv, options) => this.execProcess(argv, options) });
				const result = await files[method].apply(files, parameters);
				if (result instanceof Response && result.body) {
					const reader = result.body.getReader();
					return new Response(new ReadableStream({
						async pull(controller) {
							try {
								const chunk = await reader.read();
								if (chunk.done) {
									finish();
									controller.close();
								} else controller.enqueue(chunk.value);
							} catch (error) {
								finish();
								controller.error(error);
							}
						},
						async cancel(reason) {
							finish();
							await reader.cancel(reason);
						}
					}), result);
				}
				finish();
				return result;
			} catch (error) {
				finish();
				throw error;
			}
		}
		if (operation === "exec") {
			const [argv, value] = args;
			if (!Array.isArray(argv) || argv.length === 0 || argv.some((arg) => typeof arg !== "string")) throw new TypeError("Sandbox exec requires an executable and arguments as an array of strings.");
			const { options, finish } = operationOptions(value);
			try {
				await this.ensureRunning();
				const process = await this.execProcess(argv, {
					cwd: "/workspace",
					...options
				});
				process.exitCode.then(finish, finish);
				const processContext = this.processContext(process.exitCode);
				return {
					capability: new ProcessCapability(process, () => this.waitForProcessExit(process.exitCode, processContext)),
					pid: process.pid,
					isPty: process.isPty ?? false,
					stdin: process.stdin ?? null,
					stdout: process.stdout ?? null,
					stderr: process.stderr ?? null
				};
			} catch (error) {
				finish();
				throw error;
			}
		}
		if (operation === "fetch") {
			const [port, request] = args;
			if (!Number.isInteger(port) || port < 1 || port > 65535) throw new TypeError("Invalid Sandbox TCP port.");
			await this.ensureRunning();
			return this.container.getTcpPort(port).fetch(request);
		}
		throw new TypeError(`Unsupported Sandbox operation: ${operation}`);
	}
};
// node_modules/void/dist/runtime/sandbox.mjs
var DEFAULT_SANDBOX_ID = "default";
var DEFAULT_SANDBOX_BINDING = "SANDBOX";
var SANDBOX_SERVICE_BINDING = "__VOID_SANDBOX";
var SandboxLimitError = class extends UsageLimit {
	name = "SandboxLimitError";
	constructor(reason, message) {
		super({
			resource: "sandbox",
			reason,
			message: message ?? `Sandbox limit reached: ${reason}`
		});
	}
};
var SandboxUnavailableError = class extends Error {
	name = "SandboxUnavailableError";
	constructor(message = "Managed Sandbox is unavailable on this Void platform.") {
		super(message);
	}
};
var sandboxBindingName = DEFAULT_SANDBOX_BINDING;
function __setSandboxBindingName(bindingName) {
	sandboxBindingName = bindingName;
}
function rethrowSandboxError(error) {
	const message = error instanceof Error ? error.message : String(error);
	for (const reason of ["concurrency", "runtime_budget"]) if (message.includes(`VOID_SANDBOX_${reason}`)) throw new SandboxLimitError(reason);
	if (message.includes("VOID_SANDBOX_unavailable")) throw new SandboxUnavailableError();
	throw error;
}
function encodeOptions(value) {
	if (!value || typeof value !== "object") return {
		options: value,
		finish() {}
	};
	const { signal, ...options } = value;
	if (!signal) return {
		options,
		finish() {}
	};
	signal.throwIfAborted();
	let closed = false;
	let remove;
	let finish;
	const abort = new ReadableStream({
		start(controller) {
			const listener = () => finish();
			remove = () => signal.removeEventListener("abort", listener);
			finish = () => {
				remove();
				if (!closed) {
					closed = true;
					controller.close();
				}
			};
			signal.addEventListener("abort", listener, { once: true });
		},
		cancel() {
			closed = true;
			remove();
		}
	});
	return {
		options: {
			...options,
			abort
		},
		finish
	};
}
function client(capability, nativeFetch) {
	const call = async (operation, args) => {
		try {
			return await capability.invoke(operation, args);
		} catch (error) {
			rethrowSandboxError(error);
		}
	};
	const callWithOptions = async (operation, args, index) => {
		const encoded = encodeOptions(args[index]);
		args[index] = encoded.options;
		try {
			return await call(operation, args);
		} catch (error) {
			encoded.finish();
			throw error;
		}
	};
	const files = new Proxy(Object.create(null), { get(_target, method) {
		if (typeof method !== "string" || method === "then") return;
		return (...args) => {
			const index = method === "writeFile" || method === "rename" ? 3 : 2;
			return callWithOptions("files", [method, ...args], index);
		};
	} });
	const execute = async (argv, options) => {
		const wire = await callWithOptions("exec", [argv, options], 1);
		let exitCode;
		let output;
		const process = {
			pid: wire.pid,
			isPty: wire.isPty,
			stdin: wire.stdin,
			stdout: wire.stdout,
			stderr: wire.stderr,
			get exitCode() {
				return exitCode ??= (async () => {
					try {
						return await wire.capability.invoke("exitCode", []);
					} catch (error) {
						rethrowSandboxError(error);
					}
				})();
			},
			output() {
				return output ??= (async () => {
					try {
						return await Promise.all([
							wire.stdout ? new Response(wire.stdout).arrayBuffer() : /* @__PURE__ */ new ArrayBuffer(0),
							wire.stderr ? new Response(wire.stderr).arrayBuffer() : /* @__PURE__ */ new ArrayBuffer(0),
							process.exitCode
						]).then(([stdout, stderr, exitCode]) => ({
							stdout,
							stderr,
							exitCode
						}));
					} catch (error) {
						rethrowSandboxError(error);
					}
				})();
			},
			kill: async (signal) => {
				await wire.capability.invoke("kill", [signal]);
			},
			resize: async (cols, rows) => {
				await wire.capability.invoke("resize", [cols, rows]);
			}
		};
		return process;
	};
	return {
		files,
		exec: execute,
		run: async (argv, options) => {
			return (await execute(argv, options)).output();
		},
		fetch: async (port, request) => {
			if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return await call("fetch", [port, request]);
			if (!Number.isInteger(port) || port < 1 || port > 65535) throw new TypeError("Invalid Sandbox TCP port.");
			if (!nativeFetch) throw new SandboxUnavailableError("Sandbox WebSockets require a native Cloudflare deployment.");
			const headers = new Headers(request.headers);
			headers.set(SANDBOX_PORT_HEADER, String(port));
			return nativeFetch(new Request(request, { headers }));
		},
		running: async () => await call("running", []),
		destroy: async () => {
			await call("destroy", []);
		}
	};
}
/** Generated local/native DO. Managed execution uses the trusted controller. */
var VoidPlatformSandbox = class extends SandboxContainer {
	async beforeStart() {
		const env = this.env;
		if (env.__PROJECT_ID !== void 0 || env.__VOID_PROXY !== void 0) throw new SandboxUnavailableError("Managed Sandboxes require the platform Sandbox controller. Redeploy this application.");
	}
};
/** Resolve a container by name. Starts on the first command, file or port operation. */
async function getSandbox(id = DEFAULT_SANDBOX_ID, options = {}) {
	const { binding = sandboxBindingName, normalizeId = true, ...sandboxOptions } = options;
	if (typeof normalizeId !== "boolean") throw new TypeError("Sandbox normalizeId must be a boolean.");
	validateSandboxOptions(sandboxOptions);
	if (typeof id !== "string" || id.length === 0 || id.length > 63) throw new TypeError("Sandbox id must contain between 1 and 63 characters.");
	if (normalizeId) id = id.toLowerCase();
	const env = getRawRuntimeEnv();
	const service = env[SANDBOX_SERVICE_BINDING];
	if (service) {
		if (binding !== sandboxBindingName) throw new SandboxUnavailableError(`Managed Sandbox binding ${binding} is unavailable.`);
		try {
			return client(await service.getSandbox(id, sandboxOptions));
		} catch (error) {
			rethrowSandboxError(error);
		}
	}
	if (env.__PROJECT_ID !== void 0 || env.__VOID_PROXY !== void 0) throw new SandboxUnavailableError("This deployment has no managed Sandbox controller. Redeploy this application.");
	const stub = requireRuntimeBinding(binding).getByName(id);
	await stub.configure(sandboxOptions);
	return client(stub, (request) => stub.fetch(request));
}
// node_modules/void/dist/response-HmNjB30w.mjs
/**
* Tracks responses created by convertReturnValue (as opposed to responses
* explicitly constructed by user code). Used by handlePageGet to decide
* whether a Response should be passed through or unwrapped as page props.
*/
var convertedResponses = /* @__PURE__ */ new WeakSet();
/**
* Convert a handler's return value to a Web Response.
*
* - Response → passthrough
* - null/undefined → 204 No Content
* - string → text/html
* - object/array → JSON
*/
function convertReturnValue(value) {
	if (value instanceof Response) return value;
	let response;
	if (value === null || value === void 0) response = new Response(null, { status: 204 });
	else if (typeof value === "string") response = new Response(value, { headers: { "Content-Type": "text/html; charset=utf-8" } });
	else response = Response.json(value);
	convertedResponses.add(response);
	return response;
}
// node_modules/void/dist/validator-CTfmzZYb.mjs
function flattenIssues(issues) {
	return Array.from(issues, (issue) => ({
		message: issue.message,
		path: issue.path?.map((p) => typeof p === "object" ? p.key : p).join(".")
	}));
}
async function validateSlot(schema, value) {
	const result = await schema["~standard"].validate(value);
	if (result.issues) return {
		ok: false,
		issues: result.issues
	};
	return {
		ok: true,
		value: result.value
	};
}
async function runValidation(validators, c) {
	const input = {};
	const allIssues = [];
	if (validators.params) {
		const raw = c.req.param();
		const result = await validateSlot(validators.params, raw);
		if (result.ok) input.params = result.value;
		else allIssues.push({
			slot: "params",
			issues: flattenIssues(result.issues)
		});
	}
	if (validators.query) {
		const raw = Object.fromEntries(Object.entries(c.req.queries()).map(([key, values]) => [key, values.length === 1 ? values[0] : values]));
		const result = await validateSlot(validators.query, raw);
		if (result.ok) input.query = result.value;
		else allIssues.push({
			slot: "query",
			issues: flattenIssues(result.issues)
		});
	}
	if (validators.body) {
		let raw;
		try {
			raw = await c.req.json();
		} catch {
			return {
				ok: false,
				response: Response.json({ error: "Invalid JSON body" }, { status: 400 })
			};
		}
		const result = await validateSlot(validators.body, raw);
		if (result.ok) input.body = result.value;
		else allIssues.push({
			slot: "body",
			issues: flattenIssues(result.issues)
		});
	}
	if (allIssues.length > 0) return {
		ok: false,
		response: Response.json({
			error: "Validation failed",
			issues: allIssues
		}, { status: 400 })
	};
	return {
		ok: true,
		input
	};
}
// node_modules/void/dist/handler-xmzz0U38.mjs
/**
* Thrown when `c.rewrite()` is called with a destination whose final path
* segment ends in a known static-asset extension (e.g. `/hero.png`,
* `/app.css`). Runtime rewrites only reach routes and SSR entries inside
* the worker — static asset handlers run in front of the worker, so a
* `c.rewrite()` into an asset path re-enters the Hono router, matches
* nothing, and returns a 404. Fail at the call site so users reach for
* static `routing.rewrites` instead of debugging a mystery 404.
*/
var VoidAssetRewriteError = class extends Error {
	name = "VoidAssetRewriteError";
	constructor(destination) {
		super(`c.rewrite() cannot re-dispatch to a static asset path (${JSON.stringify(destination)}). Runtime rewrites only reach routes and SSR entries inside the worker — static asset handlers run in front of the worker. To rewrite into an asset, use a static \`routing.rewrites\` rule in void.json or a \`200!\` entry in _redirects. See https://void.dev/guide/edge/rewrites#runtime-rewrites-cannot-reach-static-assets`);
	}
};
function defineHandler(...args) {
	if (args.length === 1) return args[0];
	const middlewares = args.slice(0, -1);
	const handler = args[args.length - 1];
	return (async (c) => {
		let index = 0;
		const dispatch = async () => {
			if (index < middlewares.length) {
				const middleware = middlewares[index++];
				const middlewareResponse = await middleware(c, dispatch);
				if (middlewareResponse instanceof Response) c.res = middlewareResponse;
			} else c.res = convertReturnValue(await handler(c));
		};
		await dispatch();
		return c.res;
	});
}
(function(_defineHandler) {
	function withValidator(validators) {
		return (handler) => {
			return (async (c) => {
				const result = await runValidation(validators, c);
				if (!result.ok) return result.response;
				return convertReturnValue(await handler(c, result.input));
			});
		};
	}
	_defineHandler.withValidator = withValidator;
})(defineHandler || (defineHandler = {}));
new TextEncoder();
new TextDecoder("utf-8", { fatal: true });
export { __setSandboxBindingName as a, isInternalBinding as c, matchPattern as d, matchPatternCaptures as f, getRawRuntimeEnv as g, substituteParams as h, VoidPlatformSandbox as i, withRuntimeEnv as l, redirectToHttps as m, defineHandler as n, getSandbox as o, mergeQueryIntoLocation as p, convertReturnValue as r, getRuntimeEnv as s, VoidAssetRewriteError as t, compilePattern as u };

//# sourceMappingURL=handler-xmzz0U38-DCBPwY1C.js.map