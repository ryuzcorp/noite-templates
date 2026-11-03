import { a as __setSandboxBindingName, c as isInternalBinding, d as matchPattern, f as matchPatternCaptures, g as getRawRuntimeEnv, h as substituteParams, i as VoidPlatformSandbox, l as withRuntimeEnv, m as redirectToHttps, p as mergeQueryIntoLocation, r as convertReturnValue, s as getRuntimeEnv, t as VoidAssetRewriteError, u as compilePattern } from "./assets/handler-xmzz0U38-DCBPwY1C.js";
import { WorkerEntrypoint } from "cloudflare:workers";
import { AsyncLocalStorage } from "node:async_hooks";
// node_modules/unenv/dist/runtime/_internal/utils.mjs
/* @__NO_SIDE_EFFECTS__ */
function createNotImplementedError(name) {
	return /* @__PURE__ */ new Error(`[unenv] ${name} is not implemented yet!`);
}
// node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs
var _timeOrigin = globalThis.performance?.timeOrigin ?? Date.now();
var _performanceNow = globalThis.performance?.now ? globalThis.performance.now.bind(globalThis.performance) : () => Date.now() - _timeOrigin;
var nodeTiming = {
	name: "node",
	entryType: "node",
	startTime: 0,
	duration: 0,
	nodeStart: 0,
	v8Start: 0,
	bootstrapComplete: 0,
	environment: 0,
	loopStart: 0,
	loopExit: 0,
	idleTime: 0,
	uvMetricsInfo: {
		loopCount: 0,
		events: 0,
		eventsWaiting: 0
	},
	detail: void 0,
	toJSON() {
		return this;
	}
};
var PerformanceEntry = class {
	__unenv__ = true;
	detail;
	entryType = "event";
	name;
	startTime;
	constructor(name, options) {
		this.name = name;
		this.startTime = options?.startTime || _performanceNow();
		this.detail = options?.detail;
	}
	get duration() {
		return _performanceNow() - this.startTime;
	}
	toJSON() {
		return {
			name: this.name,
			entryType: this.entryType,
			startTime: this.startTime,
			duration: this.duration,
			detail: this.detail
		};
	}
};
var PerformanceMark = class PerformanceMark extends PerformanceEntry {
	entryType = "mark";
	constructor() {
		super(...arguments);
	}
	get duration() {
		return 0;
	}
};
var PerformanceMeasure = class extends PerformanceEntry {
	entryType = "measure";
};
var PerformanceResourceTiming = class extends PerformanceEntry {
	entryType = "resource";
	serverTiming = [];
	connectEnd = 0;
	connectStart = 0;
	decodedBodySize = 0;
	domainLookupEnd = 0;
	domainLookupStart = 0;
	encodedBodySize = 0;
	fetchStart = 0;
	initiatorType = "";
	name = "";
	nextHopProtocol = "";
	redirectEnd = 0;
	redirectStart = 0;
	requestStart = 0;
	responseEnd = 0;
	responseStart = 0;
	secureConnectionStart = 0;
	startTime = 0;
	transferSize = 0;
	workerStart = 0;
	responseStatus = 0;
};
var PerformanceObserverEntryList = class {
	__unenv__ = true;
	getEntries() {
		return [];
	}
	getEntriesByName(_name, _type) {
		return [];
	}
	getEntriesByType(type) {
		return [];
	}
};
var Performance = class {
	__unenv__ = true;
	timeOrigin = _timeOrigin;
	eventCounts = /* @__PURE__ */ new Map();
	_entries = [];
	_resourceTimingBufferSize = 0;
	navigation = void 0;
	timing = void 0;
	timerify(_fn, _options) {
		throw /* @__PURE__ */ createNotImplementedError("Performance.timerify");
	}
	get nodeTiming() {
		return nodeTiming;
	}
	eventLoopUtilization() {
		return {};
	}
	markResourceTiming() {
		return new PerformanceResourceTiming("");
	}
	onresourcetimingbufferfull = null;
	now() {
		if (this.timeOrigin === _timeOrigin) return _performanceNow();
		return Date.now() - this.timeOrigin;
	}
	clearMarks(markName) {
		this._entries = markName ? this._entries.filter((e) => e.name !== markName) : this._entries.filter((e) => e.entryType !== "mark");
	}
	clearMeasures(measureName) {
		this._entries = measureName ? this._entries.filter((e) => e.name !== measureName) : this._entries.filter((e) => e.entryType !== "measure");
	}
	clearResourceTimings() {
		this._entries = this._entries.filter((e) => e.entryType !== "resource" || e.entryType !== "navigation");
	}
	getEntries() {
		return this._entries;
	}
	getEntriesByName(name, type) {
		return this._entries.filter((e) => e.name === name && (!type || e.entryType === type));
	}
	getEntriesByType(type) {
		return this._entries.filter((e) => e.entryType === type);
	}
	mark(name, options) {
		const entry = new PerformanceMark(name, options);
		this._entries.push(entry);
		return entry;
	}
	measure(measureName, startOrMeasureOptions, endMark) {
		let start;
		let end;
		if (typeof startOrMeasureOptions === "string") {
			start = this.getEntriesByName(startOrMeasureOptions, "mark")[0]?.startTime;
			end = this.getEntriesByName(endMark, "mark")[0]?.startTime;
		} else {
			start = Number.parseFloat(startOrMeasureOptions?.start) || this.now();
			end = Number.parseFloat(startOrMeasureOptions?.end) || this.now();
		}
		const entry = new PerformanceMeasure(measureName, {
			startTime: start,
			detail: {
				start,
				end
			}
		});
		this._entries.push(entry);
		return entry;
	}
	setResourceTimingBufferSize(maxSize) {
		this._resourceTimingBufferSize = maxSize;
	}
	addEventListener(type, listener, options) {
		throw /* @__PURE__ */ createNotImplementedError("Performance.addEventListener");
	}
	removeEventListener(type, listener, options) {
		throw /* @__PURE__ */ createNotImplementedError("Performance.removeEventListener");
	}
	dispatchEvent(event) {
		throw /* @__PURE__ */ createNotImplementedError("Performance.dispatchEvent");
	}
	toJSON() {
		return this;
	}
};
var PerformanceObserver = class {
	__unenv__ = true;
	static supportedEntryTypes = [];
	_callback = null;
	constructor(callback) {
		this._callback = callback;
	}
	takeRecords() {
		return [];
	}
	disconnect() {
		throw /* @__PURE__ */ createNotImplementedError("PerformanceObserver.disconnect");
	}
	observe(options) {
		throw /* @__PURE__ */ createNotImplementedError("PerformanceObserver.observe");
	}
	bind(fn) {
		return fn;
	}
	runInAsyncScope(fn, thisArg, ...args) {
		return fn.call(thisArg, ...args);
	}
	asyncId() {
		return 0;
	}
	triggerAsyncId() {
		return 0;
	}
	emitDestroy() {
		return this;
	}
};
var performance = globalThis.performance && "addEventListener" in globalThis.performance ? globalThis.performance : new Performance();
// node_modules/@cloudflare/unenv-preset/dist/runtime/polyfill/performance.mjs
if (!("__unenv__" in performance)) {
	const proto = Performance.prototype;
	for (const key of Object.getOwnPropertyNames(proto)) if (key !== "constructor" && !(key in performance)) {
		const desc = Object.getOwnPropertyDescriptor(proto, key);
		if (desc) Object.defineProperty(performance, key, desc);
	}
}
globalThis.performance = performance;
globalThis.Performance = Performance;
globalThis.PerformanceEntry = PerformanceEntry;
globalThis.PerformanceMark = PerformanceMark;
globalThis.PerformanceMeasure = PerformanceMeasure;
globalThis.PerformanceObserver = PerformanceObserver;
globalThis.PerformanceObserverEntryList = PerformanceObserverEntryList;
globalThis.PerformanceResourceTiming = PerformanceResourceTiming;
// node_modules/hono/dist/request/constants.js
var GET_MATCH_RESULT = Symbol();
// node_modules/hono/dist/utils/buffer.js
var bufferToFormData = (arrayBuffer, contentType) => {
	return new Response(arrayBuffer, { headers: { "Content-Type": contentType.replace(/^[^;]+/, (mediaType) => mediaType.toLowerCase()) } }).formData();
};
// node_modules/hono/dist/utils/body.js
var MAX_NESTED_OBJECTS = 1e4;
var isRawRequest = (request) => "headers" in request;
var parseBody = async (request, options = Object.create(null)) => {
	const { all = false, dot = false } = options;
	const mediaType = (isRawRequest(request) ? request.headers : request.raw.headers).get("Content-Type")?.split(";")[0].trim().toLowerCase();
	if (mediaType === "multipart/form-data" || mediaType === "application/x-www-form-urlencoded") return parseFormData(request, {
		all,
		dot
	});
	return {};
};
/**
* Parses form data from a request.
*
* @template T - The type of the parsed body data.
* @param {HonoRequest | Request} request - The request object containing form data.
* @param {ParseBodyOptions} options - Options for parsing the form data.
* @returns {Promise<T>} The parsed body data.
*/
async function parseFormData(request, options) {
	if (!isRawRequest(request) && request.bodyCache.formData) return convertFormDataToBodyData(await request.bodyCache.formData, options);
	const headers = isRawRequest(request) ? request.headers : request.raw.headers;
	const formDataPromise = bufferToFormData(await request.arrayBuffer(), headers.get("Content-Type") || "");
	if (!isRawRequest(request)) request.bodyCache.formData = formDataPromise;
	const formData = await formDataPromise;
	if (formData) return convertFormDataToBodyData(formData, options);
	return {};
}
/**
* Converts form data to body data based on the provided options.
*
* @template T - The type of the parsed body data.
* @param {FormData} formData - The form data to convert.
* @param {ParseBodyOptions} options - Options for parsing the form data.
* @returns {T} The converted body data.
*/
function convertFormDataToBodyData(formData, options) {
	const form = Object.create(null);
	const nestingState = { count: 0 };
	formData.forEach((value, key) => {
		if (!(options.all || key.endsWith("[]"))) form[key] = value;
		else handleParsingAllValues(form, key, value);
	});
	if (options.dot) Object.entries(form).forEach(([key, value]) => {
		if (key.includes(".")) {
			handleParsingNestedValues(form, key, value, nestingState);
			delete form[key];
		}
	});
	return form;
}
/**
* Handles parsing all values for a given key, supporting multiple values as arrays.
*
* @param {BodyData} form - The form data object.
* @param {string} key - The key to parse.
* @param {FormDataEntryValue} value - The value to assign.
*/
var handleParsingAllValues = (form, key, value) => {
	if (form[key] !== void 0) {
		if (Array.isArray(form[key])) form[key].push(value);
		else form[key] = [form[key], value];
	} else if (!key.endsWith("[]")) form[key] = value;
	else form[key] = [value];
};
/**
* Handles parsing nested values using dot notation keys.
*
* @param {BodyData} form - The form data object.
* @param {string} key - The dot notation key.
* @param {BodyDataValue} value - The value to assign.
*/
var handleParsingNestedValues = (form, key, value, state) => {
	if (/(?:^|\.)__proto__\./.test(key)) return;
	let nestedForm = form;
	const keys = key.split(".", 34);
	if (keys.length > 33) throwNestingLimitExceeded();
	keys.forEach((key, index) => {
		if (index === keys.length - 1) nestedForm[key] = value;
		else {
			if (!nestedForm[key] || typeof nestedForm[key] !== "object" || Array.isArray(nestedForm[key]) || nestedForm[key] instanceof File) {
				if (state.count++ >= MAX_NESTED_OBJECTS) throwNestingLimitExceeded();
				nestedForm[key] = Object.create(null);
			}
			nestedForm = nestedForm[key];
		}
	});
};
var throwNestingLimitExceeded = () => {
	throw new Error("Nesting limit exceeded");
};
// node_modules/hono/dist/utils/url.js
var splitPath = (path) => {
	const paths = path.split("/");
	if (paths[0] === "") paths.shift();
	return paths;
};
var splitRoutingPath = (routePath) => {
	const { groups, path } = extractGroupsFromPath(routePath);
	return replaceGroupMarks(splitPath(path), groups);
};
var extractGroupsFromPath = (path) => {
	const groups = [];
	path = path.replace(/\{[^}]+\}/g, (match, index) => {
		const mark = `@${index}`;
		groups.push([mark, match]);
		return mark;
	});
	return {
		groups,
		path
	};
};
var replaceGroupMarks = (paths, groups) => {
	for (let i = groups.length - 1; i >= 0; i--) {
		const [mark] = groups[i];
		for (let j = paths.length - 1; j >= 0; j--) if (paths[j].includes(mark)) {
			paths[j] = paths[j].replace(mark, groups[i][1]);
			break;
		}
	}
	return paths;
};
var patternCache = {};
var getPattern = (label, next) => {
	if (label === "*") return "*";
	const match = label.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
	if (match) {
		const cacheKey = `${label}#${next}`;
		if (!patternCache[cacheKey]) {
			if (match[2]) patternCache[cacheKey] = next && next[0] !== ":" && next[0] !== "*" ? [
				cacheKey,
				match[1],
				new RegExp(`^${match[2]}(?=/${next})`)
			] : [
				label,
				match[1],
				new RegExp(`^${match[2]}$`)
			];
			else patternCache[cacheKey] = [
				label,
				match[1],
				true
			];
		}
		return patternCache[cacheKey];
	}
	return null;
};
var tryDecode = (str, decoder) => {
	try {
		return decoder(str);
	} catch {
		return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match) => {
			try {
				return decoder(match);
			} catch {
				return match;
			}
		});
	}
};
/**
* Try to apply decodeURI() to given string.
* If it fails, skip invalid percent encoding or invalid UTF-8 sequences, and apply decodeURI() to the rest as much as possible.
* @param str The string to decode.
* @returns The decoded string that sometimes contains undecodable percent encoding.
* @example
* tryDecodeURI('Hello%20World') // 'Hello World'
* tryDecodeURI('Hello%20World/%A4%A2') // 'Hello World/%A4%A2'
*/
var tryDecodeURI = (str) => tryDecode(str, decodeURI);
var getPath = (request) => {
	const url = request.url;
	const start = url.indexOf("/", url.indexOf(":") + 4);
	let i = start;
	for (; i < url.length; i++) {
		const charCode = url.charCodeAt(i);
		if (charCode === 37) {
			const queryIndex = url.indexOf("?", i);
			const hashIndex = url.indexOf("#", i);
			const end = queryIndex === -1 ? hashIndex === -1 ? void 0 : hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
			const path = url.slice(start, end);
			return tryDecodeURI(path.includes("%25") ? path.replace(/%25/g, "%2525") : path);
		} else if (charCode === 63 || charCode === 35) break;
	}
	return url.slice(start, i);
};
var getPathNoStrict = (request) => {
	const result = getPath(request);
	return result.length > 1 && result.at(-1) === "/" ? result.slice(0, -1) : result;
};
var stripPathPrefix = (rawPath, decodedPath, prefixLength) => {
	if (rawPath.at(-1) === "/" && decodedPath.at(-1) !== "/") rawPath = rawPath.slice(0, -1);
	let index = 0;
	for (let i = decodedPath.indexOf("/"); i !== -1 && i < prefixLength; i = decodedPath.indexOf("/", i + 1)) {
		index = rawPath.indexOf("/", index + 1);
		if (index === -1) return "/";
	}
	return rawPath.slice(index) || "/";
};
/**
* Merge paths.
* @param {string[]} ...paths - The paths to merge.
* @returns {string} The merged path.
* @example
* mergePath('/api', '/users') // '/api/users'
* mergePath('/api/', '/users') // '/api/users'
* mergePath('/api', '/') // '/api'
* mergePath('/api/', '/') // '/api/'
*/
var mergePath = (base, sub, ...rest) => {
	if (rest.length) sub = mergePath(sub, ...rest);
	return `${base?.[0] === "/" ? "" : "/"}${base}${sub === "/" ? "" : `${base?.at(-1) === "/" ? "" : "/"}${sub?.[0] === "/" ? sub.slice(1) : sub}`}`;
};
var checkOptionalParameter = (path) => {
	if (path.charCodeAt(path.length - 1) !== 63 || !path.includes(":")) return null;
	const segments = path.split("/");
	const results = [];
	let basePath = "";
	segments.forEach((segment) => {
		if (segment !== "" && !/\:/.test(segment)) basePath += "/" + segment;
		else if (/\:/.test(segment)) {
			if (segment.charCodeAt(segment.length - 1) === 63) {
				if (results.length === 0 && basePath === "") results.push("/");
				else results.push(basePath);
				const optionalSegment = segment.slice(0, -1);
				basePath += "/" + optionalSegment;
				results.push(basePath);
			} else basePath += "/" + segment;
		}
	});
	return results.filter((v, i, a) => a.indexOf(v) === i);
};
var tryDecodeURIComponent = (str) => str.indexOf("%") !== -1 ? tryDecode(str, decodeURIComponent_) : str;
var _decodeURI = (value) => {
	if (value.indexOf("+") !== -1) value = value.replace(/\+/g, " ");
	return tryDecodeURIComponent(value);
};
var _getQueryParam = (url, key, multiple) => {
	const hashIndex = url.indexOf("#", 8);
	if (hashIndex !== -1) url = url.slice(0, hashIndex);
	let encoded;
	if (!multiple && key && key.indexOf("%") === -1 && key.indexOf("+") === -1) {
		const queryIndex = url.indexOf("?", 8);
		let keyIndex = queryIndex;
		if (keyIndex === -1) return;
		if (!url.startsWith(key, keyIndex + 1)) keyIndex = url.indexOf(`&${key}`, keyIndex + 1);
		while (keyIndex !== -1) {
			const trailingKeyCode = url.charCodeAt(keyIndex + key.length + 1);
			if (trailingKeyCode === 61 || trailingKeyCode === 38 || isNaN(trailingKeyCode)) {
				if (keyIndex > queryIndex && /(?:^|&)[^=&]*[%+]/.test(url.slice(queryIndex + 1, keyIndex))) break;
				if (trailingKeyCode === 61) {
					const valueIndex = keyIndex + key.length + 2;
					const endIndex = url.indexOf("&", valueIndex);
					return _decodeURI(url.slice(valueIndex, endIndex === -1 ? void 0 : endIndex));
				}
				return "";
			}
			keyIndex = url.indexOf(`&${key}`, keyIndex + 1);
		}
		encoded = /[%+]/.test(url);
		if (!encoded) return;
	}
	const results = Object.create(null);
	encoded ??= /[%+]/.test(url);
	let keyIndex = url.indexOf("?", 8);
	while (keyIndex !== -1) {
		const nextKeyIndex = url.indexOf("&", keyIndex + 1);
		let valueIndex = url.indexOf("=", keyIndex);
		if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) valueIndex = -1;
		let name = url.slice(keyIndex + 1, valueIndex === -1 ? nextKeyIndex === -1 ? void 0 : nextKeyIndex : valueIndex);
		if (encoded) name = _decodeURI(name);
		keyIndex = nextKeyIndex;
		if (name === "") continue;
		let value;
		if (valueIndex === -1) value = "";
		else {
			value = url.slice(valueIndex + 1, nextKeyIndex === -1 ? void 0 : nextKeyIndex);
			if (encoded) value = _decodeURI(value);
		}
		if (multiple) {
			if (!(results[name] && Array.isArray(results[name]))) results[name] = [];
			results[name].push(value);
		} else results[name] ??= value;
	}
	return key ? results[key] : results;
};
var getQueryParam = _getQueryParam;
var getQueryParams = (url, key) => {
	return _getQueryParam(url, key, true);
};
var decodeURIComponent_ = decodeURIComponent;
// node_modules/hono/dist/request.js
var HonoRequest = class {
	/**
	* `.raw` can get the raw Request object.
	*
	* @see {@link https://hono.dev/docs/api/request#raw}
	*
	* @example
	* ```ts
	* // For Cloudflare Workers
	* app.post('/', async (c) => {
	*   const metadata = c.req.raw.cf?.hostMetadata?
	*   ...
	* })
	* ```
	*/
	raw;
	#validatedData;
	#matchResult;
	routeIndex = 0;
	/**
	* `.path` can get the pathname of the request.
	*
	* @see {@link https://hono.dev/docs/api/request#path}
	*
	* @example
	* ```ts
	* app.get('/about/me', (c) => {
	*   const pathname = c.req.path // `/about/me`
	* })
	* ```
	*/
	path;
	bodyCache = {};
	constructor(request, path = "/", matchResult = [[]]) {
		this.raw = request;
		this.path = path;
		this.#matchResult = matchResult;
	}
	param(key) {
		return key ? this.#getDecodedParam(key) : this.#getAllDecodedParams();
	}
	#getDecodedParam(key) {
		const paramKey = this.#matchResult[0][this.routeIndex]?.[1][key];
		const param = this.#getParamValue(paramKey);
		return param && tryDecodeURIComponent(param);
	}
	#getAllDecodedParams() {
		const decoded = {};
		const keys = Object.keys(this.#matchResult[0][this.routeIndex]?.[1] ?? {});
		for (const key of keys) {
			const value = this.#getParamValue(this.#matchResult[0][this.routeIndex][1][key]);
			if (value !== void 0) decoded[key] = tryDecodeURIComponent(value);
		}
		return decoded;
	}
	#getParamValue(paramKey) {
		return this.#matchResult[1] ? this.#matchResult[1][paramKey] : paramKey;
	}
	query(key) {
		return getQueryParam(this.url, key);
	}
	queries(key) {
		return getQueryParams(this.url, key);
	}
	header(name) {
		if (name) return this.raw.headers.get(name) ?? void 0;
		const headerData = Object.create(null);
		this.raw.headers.forEach((value, key) => {
			headerData[key] = value;
		});
		return headerData;
	}
	async parseBody(options) {
		return parseBody(this, options);
	}
	#cachedBody = (key) => {
		const { bodyCache, raw } = this;
		const cachedBody = bodyCache[key];
		if (cachedBody) return cachedBody;
		for (const anyCachedKey in bodyCache) return bodyCache[anyCachedKey].then((body) => {
			if (anyCachedKey === "json") body = JSON.stringify(body);
			const contentType = anyCachedKey === "formData" ? void 0 : raw.headers.get("content-type");
			return new Response(body, { headers: contentType ? { "Content-Type": contentType } : void 0 })[key]();
		});
		return bodyCache[key] = raw[key]();
	};
	/**
	* `.json()` can parse Request body of type `application/json`
	*
	* @see {@link https://hono.dev/docs/api/request#json}
	*
	* @example
	* ```ts
	* app.post('/entry', async (c) => {
	*   const body = await c.req.json()
	* })
	* ```
	*/
	json() {
		return this.#cachedBody("text").then((text) => JSON.parse(text));
	}
	/**
	* `.text()` can parse Request body of type `text/plain`
	*
	* @see {@link https://hono.dev/docs/api/request#text}
	*
	* @example
	* ```ts
	* app.post('/entry', async (c) => {
	*   const body = await c.req.text()
	* })
	* ```
	*/
	text() {
		return this.#cachedBody("text");
	}
	/**
	* `.arrayBuffer()` parse Request body as an `ArrayBuffer`
	*
	* @see {@link https://hono.dev/docs/api/request#arraybuffer}
	*
	* @example
	* ```ts
	* app.post('/entry', async (c) => {
	*   const body = await c.req.arrayBuffer()
	* })
	* ```
	*/
	arrayBuffer() {
		return this.#cachedBody("arrayBuffer");
	}
	/**
	* `.bytes()` parses the request body as a `Uint8Array`.
	*
	* @see {@link https://hono.dev/docs/api/request#bytes}
	*
	* @example
	* ```ts
	* app.post('/entry', async (c) => {
	*   const body = await c.req.bytes()
	* })
	* ```
	*/
	bytes() {
		return this.#cachedBody("arrayBuffer").then((buffer) => new Uint8Array(buffer));
	}
	/**
	* Parses the request body as a `Blob`.
	* @example
	* ```ts
	* app.post('/entry', async (c) => {
	*   const body = await c.req.blob();
	* });
	* ```
	* @see https://hono.dev/docs/api/request#blob
	*/
	blob() {
		return this.#cachedBody("blob");
	}
	/**
	* Parses the request body as `FormData`.
	* @example
	* ```ts
	* app.post('/entry', async (c) => {
	*   const body = await c.req.formData();
	* });
	* ```
	* @see https://hono.dev/docs/api/request#formdata
	*/
	formData() {
		return this.#cachedBody("formData");
	}
	/**
	* Adds validated data to the request.
	*
	* @param target - The target of the validation.
	* @param data - The validated data to add.
	*/
	addValidatedData(target, data) {
		(this.#validatedData ??= {})[target] = data;
	}
	valid(target) {
		return this.#validatedData?.[target];
	}
	/**
	* `.url` can get the request url strings.
	*
	* @see {@link https://hono.dev/docs/api/request#url}
	*
	* @example
	* ```ts
	* app.get('/about/me', (c) => {
	*   const url = c.req.url // `http://localhost:8787/about/me`
	*   ...
	* })
	* ```
	*/
	get url() {
		return this.raw.url;
	}
	/**
	* `.method` can get the method name of the request.
	*
	* @see {@link https://hono.dev/docs/api/request#method}
	*
	* @example
	* ```ts
	* app.get('/about/me', (c) => {
	*   const method = c.req.method // `GET`
	* })
	* ```
	*/
	get method() {
		return this.raw.method;
	}
	get [GET_MATCH_RESULT]() {
		return this.#matchResult;
	}
	/**
	* `.matchedRoutes` can return a matched route in the handler
	*
	* @deprecated
	*
	* Use matchedRoutes helper defined in "hono/route" instead.
	*
	* @see {@link https://hono.dev/docs/api/request#matchedroutes}
	*
	* @example
	* ```ts
	* app.use('*', async function logger(c, next) {
	*   await next()
	*   c.req.matchedRoutes.forEach(({ handler, method, path }, i) => {
	*     const name = handler.name || (handler.length < 2 ? '[handler]' : '[middleware]')
	*     console.log(
	*       method,
	*       ' ',
	*       path,
	*       ' '.repeat(Math.max(10 - path.length, 0)),
	*       name,
	*       i === c.req.routeIndex ? '<- respond from here' : ''
	*     )
	*   })
	* })
	* ```
	*/
	get matchedRoutes() {
		return this.#matchResult[0].map(([[, route]]) => route);
	}
	/**
	* `.routePath` can retrieve the path registered within the handler
	*
	* @deprecated
	*
	* Use routePath helper defined in "hono/route" instead.
	*
	* @see {@link https://hono.dev/docs/api/request#routepath}
	*
	* @example
	* ```ts
	* app.get('/posts/:id', (c) => {
	*   return c.json({ path: c.req.routePath })
	* })
	* ```
	*/
	get routePath() {
		return this.#matchResult[0].map(([[, route]]) => route)[this.routeIndex].path;
	}
};
// node_modules/hono/dist/utils/html.js
/**
* @module
* HTML utility.
*/
var HtmlEscapedCallbackPhase = {
	Stringify: 1,
	BeforeStream: 2,
	Stream: 3
};
var raw = (value, callbacks) => {
	const escapedString = new String(value);
	escapedString.isEscaped = true;
	escapedString.callbacks = callbacks;
	return escapedString;
};
var resolveCallback = async (str, phase, preserveCallbacks, context, buffer) => {
	if (typeof str === "object" && !(str instanceof String)) {
		if (!(str instanceof Promise)) str = str.toString();
		if (str instanceof Promise) str = await str;
	}
	const callbacks = str.callbacks;
	if (!callbacks?.length) return Promise.resolve(str);
	if (buffer) buffer[0] += str;
	else buffer = [str];
	const resStr = Promise.all(callbacks.map((c) => c({
		phase,
		buffer,
		context
	}))).then((res) => Promise.all(res.filter(Boolean).map((str) => resolveCallback(str, phase, false, context, buffer))).then(() => buffer[0]));
	if (preserveCallbacks) return raw(await resStr, callbacks);
	else return resStr;
};
// node_modules/hono/dist/context.js
var TEXT_PLAIN = "text/plain; charset=UTF-8";
var setDefaultContentType = (contentType, headers) => {
	return {
		"Content-Type": contentType,
		...headers
	};
};
var createResponseInstance = (body, init) => new Response(body, init);
var Context = class {
	#rawRequest;
	#req;
	/**
	* `.env` can get bindings (environment variables, secrets, KV namespaces, D1 database, R2 bucket etc.) in Cloudflare Workers.
	*
	* @see {@link https://hono.dev/docs/api/context#env}
	*
	* @example
	* ```ts
	* // Environment object for Cloudflare Workers
	* app.get('*', async c => {
	*   const counter = c.env.COUNTER
	* })
	* ```
	*/
	env = {};
	#var;
	finalized = false;
	/**
	* `.error` can get the error object from the middleware if the Handler throws an error.
	*
	* @see {@link https://hono.dev/docs/api/context#error}
	*
	* @example
	* ```ts
	* app.use('*', async (c, next) => {
	*   await next()
	*   if (c.error) {
	*     // do something...
	*   }
	* })
	* ```
	*/
	error;
	#status;
	#executionCtx;
	#res;
	#layout;
	#renderer;
	#notFoundHandler;
	#preparedHeaders;
	#matchResult;
	#path;
	/**
	* Creates an instance of the Context class.
	*
	* @param req - The Request object.
	* @param options - Optional configuration options for the context.
	*/
	constructor(req, options) {
		this.#rawRequest = req;
		if (options) {
			this.#executionCtx = options.executionCtx;
			this.env = options.env;
			this.#notFoundHandler = options.notFoundHandler;
			this.#path = options.path;
			this.#matchResult = options.matchResult;
		}
	}
	/**
	* `.req` is the instance of {@link HonoRequest}.
	*/
	get req() {
		this.#req ??= new HonoRequest(this.#rawRequest, this.#path, this.#matchResult);
		return this.#req;
	}
	/**
	* @see {@link https://hono.dev/docs/api/context#event}
	* The FetchEvent associated with the current request.
	*
	* @throws Will throw an error if the context does not have a FetchEvent.
	*/
	get event() {
		if (this.#executionCtx && "respondWith" in this.#executionCtx) return this.#executionCtx;
		else throw Error("This context has no FetchEvent");
	}
	/**
	* @see {@link https://hono.dev/docs/api/context#executionctx}
	* The ExecutionContext associated with the current request.
	*
	* @throws Will throw an error if the context does not have an ExecutionContext.
	*/
	get executionCtx() {
		if (this.#executionCtx) return this.#executionCtx;
		else throw Error("This context has no ExecutionContext");
	}
	/**
	* @see {@link https://hono.dev/docs/api/context#res}
	* The Response object for the current request.
	*/
	get res() {
		return this.#res ||= createResponseInstance(null, { headers: this.#preparedHeaders ??= new Headers() });
	}
	/**
	* Sets the Response object for the current request.
	*
	* @param _res - The Response object to set.
	*/
	set res(_res) {
		if (this.#res && _res) {
			_res = createResponseInstance(_res.body, _res);
			for (const [k, v] of this.#res.headers.entries()) {
				if (k === "content-type") continue;
				if (k === "set-cookie") {
					const cookies = this.#res.headers.getSetCookie();
					_res.headers.delete("set-cookie");
					for (const cookie of cookies) _res.headers.append("set-cookie", cookie);
				} else _res.headers.set(k, v);
			}
		}
		this.#res = _res;
		this.finalized = true;
	}
	/**
	* `.render()` can create a response within a layout.
	*
	* @see {@link https://hono.dev/docs/api/context#render-setrenderer}
	*
	* @example
	* ```ts
	* app.get('/', (c) => {
	*   return c.render('Hello!')
	* })
	* ```
	*/
	render = (...args) => {
		this.#renderer ??= (content) => this.html(content);
		return this.#renderer(...args);
	};
	/**
	* Sets the layout for the response.
	*
	* @param layout - The layout to set.
	* @returns The layout function.
	*/
	setLayout = (layout) => this.#layout = layout;
	/**
	* Gets the current layout for the response.
	*
	* @returns The current layout function.
	*/
	getLayout = () => this.#layout;
	/**
	* `.setRenderer()` can set the layout in the custom middleware.
	*
	* @see {@link https://hono.dev/docs/api/context#render-setrenderer}
	*
	* @example
	* ```tsx
	* app.use('*', async (c, next) => {
	*   c.setRenderer((content) => {
	*     return c.html(
	*       <html>
	*         <body>
	*           <p>{content}</p>
	*         </body>
	*       </html>
	*     )
	*   })
	*   await next()
	* })
	* ```
	*/
	setRenderer = (renderer) => {
		this.#renderer = renderer;
	};
	/**
	* `.header()` can set headers.
	*
	* @see {@link https://hono.dev/docs/api/context#header}
	*
	* @example
	* ```ts
	* app.get('/welcome', (c) => {
	*   // Set headers
	*   c.header('X-Message', 'Hello!')
	*   c.header('Content-Type', 'text/plain')
	*
	*   // Append multiple headers using the append option (e.g. Vary)
	*   c.header('Vary', 'Accept-Encoding', { append: true })
	*   c.header('Vary', 'User-Agent', { append: true })
	*
	*   return c.body('Thank you for coming')
	* })
	* ```
	*/
	header = (name, value, options) => {
		if (this.finalized && !this.#res.bodyUsed) this.#res = createResponseInstance(this.#res.body, this.#res);
		const headers = this.#res ? this.#res.headers : this.#preparedHeaders ??= new Headers();
		if (value === void 0) headers.delete(name);
		else if (options?.append) headers.append(name, value);
		else headers.set(name, value);
	};
	status = (status) => {
		this.#status = status;
	};
	/**
	* `.set()` can set the value specified by the key.
	*
	* @see {@link https://hono.dev/docs/api/context#set-get}
	*
	* @example
	* ```ts
	* app.use('*', async (c, next) => {
	*   c.set('message', 'Hono is hot!!')
	*   await next()
	* })
	* ```
	*/
	set = (key, value) => {
		this.#var ??= /* @__PURE__ */ new Map();
		this.#var.set(key, value);
	};
	/**
	* `.get()` can use the value specified by the key.
	*
	* @see {@link https://hono.dev/docs/api/context#set-get}
	*
	* @example
	* ```ts
	* app.get('/', (c) => {
	*   const message = c.get('message')
	*   return c.text(`The message is "${message}"`)
	* })
	* ```
	*/
	get = (key) => {
		return this.#var ? this.#var.get(key) : void 0;
	};
	/**
	* `.var` can access the value of a variable.
	*
	* @see {@link https://hono.dev/docs/api/context#var}
	*
	* @example
	* ```ts
	* const result = c.var.client.oneMethod()
	* ```
	*/
	get var() {
		if (!this.#var) return {};
		return Object.fromEntries(this.#var);
	}
	#newResponse(data, arg, headers) {
		let responseHeaders = this.#res ? new Headers(this.#res.headers) : this.#preparedHeaders;
		if (typeof arg === "object" && arg.headers) {
			responseHeaders ??= new Headers();
			for (const [key, value] of new Headers(arg.headers)) if (key === "set-cookie") responseHeaders.append(key, value);
			else responseHeaders.set(key, value);
		}
		if (headers) {
			if (!responseHeaders) {
				let count = 0;
				for (const k in headers) if (++count > 1 || typeof headers[k] !== "string") {
					responseHeaders = new Headers();
					break;
				}
			}
			if (responseHeaders) for (const k in headers) {
				const v = headers[k];
				if (typeof v === "string") responseHeaders.set(k, v);
				else {
					responseHeaders.delete(k);
					for (const v2 of v) responseHeaders.append(k, v2);
				}
			}
		}
		return createResponseInstance(data, {
			status: typeof arg === "number" ? arg : arg?.status ?? this.#status,
			headers: responseHeaders ?? headers
		});
	}
	newResponse = (...args) => this.#newResponse(...args);
	/**
	* `.body()` can return the HTTP response.
	* You can set headers with `.header()` and set HTTP status code with `.status`.
	* This can also be set in `.text()`, `.json()` and so on.
	*
	* @see {@link https://hono.dev/docs/api/context#body}
	*
	* @example
	* ```ts
	* app.get('/welcome', (c) => {
	*   // Set headers
	*   c.header('X-Message', 'Hello!')
	*   c.header('Content-Type', 'text/plain')
	*   // Set HTTP status code
	*   c.status(201)
	*
	*   // Return the response body
	*   return c.body('Thank you for coming')
	* })
	* ```
	*/
	body = (data, arg, headers) => this.#newResponse(data, arg, headers);
	/**
	* `.text()` can render text as `Content-Type:text/plain`.
	*
	* @see {@link https://hono.dev/docs/api/context#text}
	*
	* @example
	* ```ts
	* app.get('/say', (c) => {
	*   return c.text('Hello!')
	* })
	* ```
	*/
	text = (text, arg, headers) => {
		return !this.#preparedHeaders && !this.#status && !arg && !headers && !this.finalized ? new Response(text) : this.#newResponse(text, arg, setDefaultContentType(TEXT_PLAIN, headers));
	};
	/**
	* `.json()` can render JSON as `Content-Type:application/json`.
	*
	* @see {@link https://hono.dev/docs/api/context#json}
	*
	* @example
	* ```ts
	* app.get('/api', (c) => {
	*   return c.json({ message: 'Hello!' })
	* })
	* ```
	*/
	json = (object, arg, headers) => {
		return this.#newResponse(JSON.stringify(object), arg, setDefaultContentType("application/json", headers));
	};
	html = (html, arg, headers) => {
		const res = (html) => this.#newResponse(html, arg, setDefaultContentType("text/html; charset=UTF-8", headers));
		return typeof html === "object" ? resolveCallback(html, HtmlEscapedCallbackPhase.Stringify, false, {}).then(res) : res(html);
	};
	/**
	* `.redirect()` can Redirect, default status code is 302.
	*
	* @see {@link https://hono.dev/docs/api/context#redirect}
	*
	* @example
	* ```ts
	* app.get('/redirect', (c) => {
	*   return c.redirect('/')
	* })
	* app.get('/redirect-permanently', (c) => {
	*   return c.redirect('/', 301)
	* })
	* ```
	*/
	redirect = (location, status) => {
		const locationString = String(location);
		this.header("Location", !/[^\x00-\xFF]/.test(locationString) ? locationString : encodeURI(locationString));
		return this.newResponse(null, status ?? 302);
	};
	/**
	* `.notFound()` can return the Not Found Response.
	*
	* @see {@link https://hono.dev/docs/api/context#notfound}
	*
	* @example
	* ```ts
	* app.get('/notfound', (c) => {
	*   return c.notFound()
	* })
	* ```
	*/
	notFound = () => {
		this.#notFoundHandler ??= () => createResponseInstance();
		return this.#notFoundHandler(this);
	};
};
// node_modules/hono/dist/compose.js
/**
* Compose middleware functions into a single function based on `koa-compose` package.
*
* @template E - The environment type.
*
* @param {[[Function, unknown], unknown][] | [[Function]][]} middleware - An array of middleware functions and their corresponding parameters.
* @param {ErrorHandler<E>} [onError] - An optional error handler function.
* @param {NotFoundHandler<E>} [onNotFound] - An optional not-found handler function.
*
* @returns {(context: Context, next?: Next) => Promise<Context>} - A composed middleware function.
*/
var compose = (middleware, onError, onNotFound) => {
	return (context, next) => {
		let index = -1;
		return dispatch(0);
		/**
		* Dispatch the middleware functions.
		*
		* @param {number} i - The current index in the middleware array.
		*
		* @returns {Promise<Context>} - A promise that resolves to the context.
		*/
		async function dispatch(i) {
			if (i <= index) throw new Error("next() called multiple times");
			index = i;
			let res;
			let isError = false;
			let handler;
			if (middleware[i]) {
				handler = middleware[i][0][0];
				context.req.routeIndex = i;
			} else handler = i === middleware.length && next || void 0;
			if (handler) try {
				res = await handler(context, () => dispatch(i + 1));
			} catch (err) {
				if (err instanceof Error && onError) {
					context.error = err;
					res = await onError(err, context);
					isError = true;
				} else throw err;
			}
			else if (context.finalized === false && onNotFound) res = await onNotFound(context);
			if (res && (context.finalized === false || isError)) context.res = res;
			return context;
		}
	};
};
// node_modules/hono/dist/router.js
/**
* Array of supported HTTP methods.
*/
var METHODS = [
	"get",
	"post",
	"put",
	"delete",
	"options",
	"patch",
	"query"
];
/**
* Error message indicating that a route cannot be added because the matcher is already built.
*/
var MESSAGE_MATCHER_IS_ALREADY_BUILT = "Can not add a route since the matcher is already built.";
/**
* Error class representing an unsupported path error.
*/
var UnsupportedPathError = class extends Error {};
// node_modules/hono/dist/utils/constants.js
/**
* Constant used to mark a composed handler.
*/
var COMPOSED_HANDLER = "__COMPOSED_HANDLER";
// node_modules/hono/dist/utils/mount.js
var getPathPrefixLength = (c, pathPrefix, routePath) => {
	if (!/[:*]/.test(pathPrefix)) return pathPrefix.length;
	const path = c.req.path;
	const matchResult = c.req[GET_MATCH_RESULT];
	const paramNames = /* @__PURE__ */ new Set();
	let length = 0;
	for (const part of splitRoutingPath(pathPrefix)) {
		const pattern = getPattern(part);
		if (pattern && pattern !== "*") {
			const name = pattern[1];
			if (paramNames.has(name)) throw new Error(`mount(): Duplicate path parameter "${name}" in "${routePath}".`);
			paramNames.add(name);
		}
		if (pattern && pattern !== "*" && pattern[2] !== true) {
			const value = matchResult.length === 2 ? matchResult[1][matchResult[0][c.req.routeIndex][1][pattern[1]]] : matchResult[0][c.req.routeIndex][1][pattern[1]];
			length += value.length + 1;
		} else if (pattern || part.endsWith("*")) {
			const end = path.indexOf("/", length + 1);
			length = end === -1 ? path.length : end;
		} else length += part.length + 1;
	}
	return length;
};
var createMountedRequest = (c, pathPrefix, routePath) => {
	if (/[^/]\*$/.test(routePath)) throw new Error(`mount(): Wildcard must follow "/" in "${routePath}".`);
	const url = new URL(c.req.raw.url);
	url.pathname = stripPathPrefix(url.pathname, c.req.path, getPathPrefixLength(c, pathPrefix, routePath));
	return new Request(url, c.req.raw);
};
// node_modules/hono/dist/hono-base.js
/**
* @module
* This module is the base module for the Hono object.
*/
var notFoundHandler = (c) => {
	return c.text("404 Not Found", 404);
};
var errorHandler = (err, c) => {
	if ("getResponse" in err) {
		const res = err.getResponse();
		return c.newResponse(res.body, res);
	}
	console.error(err);
	return c.text("Internal Server Error", 500);
};
var Hono$1 = class Hono {
	get;
	post;
	put;
	delete;
	options;
	patch;
	query;
	all;
	on;
	use;
	router;
	getPath;
	_basePath = "/";
	#path = "/";
	routes = [];
	constructor(options = {}) {
		[...METHODS, "all"].forEach((method) => {
			this[method] = (args1, ...args) => {
				const methodName = method.toUpperCase();
				if (typeof args1 === "string") this.#path = args1;
				else this.#addRoute(methodName, this.#path, args1);
				args.forEach((handler) => {
					this.#addRoute(methodName, this.#path, handler);
				});
				return this;
			};
		});
		this.on = (method, path, ...handlers) => {
			for (const p of [path].flat()) {
				this.#path = p;
				for (const m of [method].flat()) {
					const methodName = m.toUpperCase();
					for (const handler of handlers) this.#addRoute(methodName, this.#path, handler);
				}
			}
			return this;
		};
		this.use = (arg1, ...handlers) => {
			if (typeof arg1 === "string") this.#path = arg1;
			else {
				this.#path = "*";
				handlers.unshift(arg1);
			}
			handlers.forEach((handler) => {
				this.#addRoute("ALL", this.#path, handler);
			});
			return this;
		};
		const { strict, ...optionsWithoutStrict } = options;
		Object.assign(this, optionsWithoutStrict);
		this.getPath = strict ?? true ? options.getPath ?? getPath : getPathNoStrict;
	}
	#clone() {
		const clone = new Hono({
			router: this.router,
			getPath: this.getPath
		});
		clone.errorHandler = this.errorHandler;
		clone.#notFoundHandler = this.#notFoundHandler;
		clone.routes = this.routes;
		return clone;
	}
	#notFoundHandler = notFoundHandler;
	errorHandler = errorHandler;
	/**
	* `.route()` allows grouping other Hono instance in routes.
	*
	* @see {@link https://hono.dev/docs/api/routing#grouping}
	*
	* @param {string} path - base Path
	* @param {Hono} app - other Hono instance
	* @returns {Hono} routed Hono instance
	*
	* @example
	* ```ts
	* const app = new Hono()
	* const app2 = new Hono()
	*
	* app2.get("/user", (c) => c.text("user"))
	* app.route("/api", app2) // GET /api/user
	* ```
	*/
	route(path, app) {
		const subApp = this.basePath(path);
		app.routes.map((r) => {
			let handler;
			if (app.errorHandler === errorHandler) handler = r.handler;
			else {
				handler = async (c, next) => (await compose([], app.errorHandler)(c, () => r.handler(c, next))).res;
				handler[COMPOSED_HANDLER] = r.handler;
			}
			subApp.#addRoute(r.method, r.path, handler, r.basePath);
		});
		return this;
	}
	/**
	* `.basePath()` allows base paths to be specified.
	*
	* @see {@link https://hono.dev/docs/api/routing#base-path}
	*
	* @param {string} path - base Path
	* @returns {Hono} changed Hono instance
	*
	* @example
	* ```ts
	* const api = new Hono().basePath('/api')
	* ```
	*/
	basePath(path) {
		const subApp = this.#clone();
		subApp._basePath = mergePath(this._basePath, path);
		return subApp;
	}
	/**
	* `.onError()` handles an error and returns a customized Response.
	*
	* @see {@link https://hono.dev/docs/api/hono#error-handling}
	*
	* @param {ErrorHandler} handler - request Handler for error
	* @returns {Hono} changed Hono instance
	*
	* @example
	* ```ts
	* app.onError((err, c) => {
	*   console.error(`${err}`)
	*   return c.text('Custom Error Message', 500)
	* })
	* ```
	*/
	onError = (handler) => {
		this.errorHandler = handler;
		return this;
	};
	/**
	* `.notFound()` allows you to customize a Not Found Response.
	*
	* @see {@link https://hono.dev/docs/api/hono#not-found}
	*
	* @param {NotFoundHandler} handler - request handler for not-found
	* @returns {Hono} changed Hono instance
	*
	* @example
	* ```ts
	* app.notFound((c) => {
	*   return c.text('Custom 404 Message', 404)
	* })
	* ```
	*/
	notFound = (handler) => {
		this.#notFoundHandler = handler;
		return this;
	};
	/**
	* `.mount()` allows you to mount applications built with other frameworks into your Hono application.
	*
	* @deprecated Use `mount()` from `hono/mount` instead. `.mount()` will be removed in v5.
	*
	* @see {@link https://hono.dev/docs/api/hono#mount}
	*
	* @param {string} path - base Path
	* @param {Function} applicationHandler - other Request Handler
	* @param {MountOptions} [options] - options of `.mount()`
	* @returns {Hono} mounted Hono instance
	*
	* @example
	* ```ts
	* import { Router as IttyRouter } from 'itty-router'
	* import { Hono } from 'hono'
	* // Create itty-router application
	* const ittyRouter = IttyRouter()
	* // GET /itty-router/hello
	* ittyRouter.get('/hello', () => new Response('Hello from itty-router'))
	*
	* const app = new Hono()
	* app.mount('/itty-router', ittyRouter.handle)
	* ```
	*
	* @example
	* ```ts
	* const app = new Hono()
	* // Send the request to another application without modification.
	* app.mount('/app', anotherApp, {
	*   replaceRequest: (req) => req,
	* })
	* ```
	*/
	mount(path, applicationHandler, options) {
		let replaceRequest;
		let optionHandler;
		if (options) {
			if (typeof options === "function") optionHandler = options;
			else {
				optionHandler = options.optionHandler;
				if (options.replaceRequest === false) replaceRequest = (request) => request;
				else replaceRequest = options.replaceRequest;
			}
		}
		const getOptions = optionHandler ? (c) => {
			const options = optionHandler(c);
			return Array.isArray(options) ? options : [options];
		} : (c) => {
			let executionContext = void 0;
			try {
				executionContext = c.executionCtx;
			} catch {}
			return [c.env, executionContext];
		};
		const mergedPath = mergePath(this._basePath, path);
		const defaultReplaceRequest = (c) => createMountedRequest(c, mergedPath.replace(/\/$/, ""), mergePath(mergedPath, "*"));
		const handler = async (c, next) => {
			const res = await applicationHandler(replaceRequest ? replaceRequest(c.req.raw) : defaultReplaceRequest(c), ...getOptions(c));
			if (res) return res;
			await next();
		};
		this.#addRoute("ALL", mergePath(path, "*"), handler);
		return this;
	}
	#addRoute(method, path, handler, baseRoutePath) {
		path = mergePath(this._basePath, path);
		const r = {
			basePath: baseRoutePath !== void 0 ? mergePath(this._basePath, baseRoutePath) : this._basePath,
			path,
			method,
			handler
		};
		this.router.add(method, path, [handler, r]);
		this.routes.push(r);
	}
	#handleError(err, c) {
		if (err instanceof Error) return this.errorHandler(err, c);
		throw err;
	}
	#dispatch(request, executionCtx, env, method) {
		if (method === "HEAD") return (async () => new Response(null, await this.#dispatch(request, executionCtx, env, "GET")))();
		const path = this.getPath(request, { env });
		const matchResult = this.router.match(method, path);
		const c = new Context(request, {
			path,
			matchResult,
			env,
			executionCtx,
			notFoundHandler: this.#notFoundHandler
		});
		if (matchResult[0].length === 1) {
			let res;
			try {
				res = matchResult[0][0][0][0](c, async () => {
					c.res = await this.#notFoundHandler(c);
				});
			} catch (err) {
				return this.#handleError(err, c);
			}
			return res instanceof Promise ? res.then((resolved) => resolved || (c.finalized ? c.res : this.#notFoundHandler(c))).catch((err) => this.#handleError(err, c)) : res ?? this.#notFoundHandler(c);
		}
		const composed = compose(matchResult[0], this.errorHandler, this.#notFoundHandler);
		return (async () => {
			try {
				const context = await composed(c);
				if (!context.finalized) throw new Error("Context is not finalized. Did you forget to return a Response object or `await next()`?");
				return context.res;
			} catch (err) {
				return this.#handleError(err, c);
			}
		})();
	}
	/**
	* `.fetch()` will be entry point of your app.
	*
	* @see {@link https://hono.dev/docs/api/hono#fetch}
	*
	* @param {Request} request - request Object of request
	* @param {Env} env - env Object
	* @param {ExecutionContext} executionCtx - context of execution
	* @returns {Response | Promise<Response>} response of request
	*
	*/
	fetch = (request, ...rest) => {
		return this.#dispatch(request, rest[1], rest[0], request.method);
	};
	/**
	* `.request()` is a useful method for testing.
	* You can pass a URL or pathname to send a GET request.
	* app will return a Response object.
	* ```ts
	* test('GET /hello is ok', async () => {
	*   const res = await app.request('/hello')
	*   expect(res.status).toBe(200)
	* })
	* ```
	* @see https://hono.dev/docs/api/hono#request
	*/
	request = (input, requestInit, Env, executionCtx) => {
		if (input instanceof Request) return this.fetch(requestInit ? new Request(input, requestInit) : input, Env, executionCtx);
		input = input.toString();
		return this.fetch(new Request(/^https?:\/\//.test(input) ? input : `http://localhost${mergePath("/", input)}`, requestInit), Env, executionCtx);
	};
	/**
	* `.fire()` automatically adds a global fetch event listener.
	* This can be useful for environments that adhere to the Service Worker API, such as non-ES module Cloudflare Workers.
	* @deprecated
	* Use `fire` from `hono/service-worker` instead.
	* ```ts
	* import { Hono } from 'hono'
	* import { fire } from 'hono/service-worker'
	*
	* const app = new Hono()
	* // ...
	* fire(app)
	* ```
	* @see https://hono.dev/docs/api/hono#fire
	* @see https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
	* @see https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/
	*/
	fire = () => {
		addEventListener("fetch", (event) => {
			event.respondWith(this.#dispatch(event.request, event, void 0, event.request.method));
		});
	};
};
// node_modules/hono/dist/router/utils.js
var createNullObject = () => Object.create(null);
// node_modules/hono/dist/router/reg-exp-router/matcher.js
var emptyParam = [];
function match(method, path) {
	const matchers = this.buildAllMatchers();
	const match = ((method, path) => {
		const matcher = matchers[method] || matchers["ALL"];
		const staticMatch = matcher[2][path];
		if (staticMatch) return staticMatch;
		const match = path.match(matcher[0]);
		if (!match) return [[], emptyParam];
		const index = match.indexOf("", 1);
		return [matcher[1][index], match];
	});
	this.match = match;
	return match(method, path);
}
// node_modules/hono/dist/router/reg-exp-router/node.js
var LABEL_REG_EXP_STR = "[^/]+";
var ONLY_WILDCARD_REG_EXP_STR = "[^]*";
var TAIL_WILDCARD_REG_EXP_STR = "(?:|/[^]*)";
var PATH_ERROR = Symbol();
var regExpMetaChars = /* @__PURE__ */ new Set(".\\+*[^]$()");
/**
* Sort order:
* 1. literal
* 2. special pattern (e.g. :label{[0-9]+})
* 3. common label pattern (e.g. :label)
* 4. wildcard
*/
function compareKey(a, b) {
	if (a.length === 1) return b.length === 1 ? a < b ? -1 : 1 : -1;
	if (b.length === 1) return 1;
	if (a === "[^]*" || a === "(?:|/[^]*)") return b === "[^]*" ? -1 : 1;
	else if (b === "[^]*" || b === "(?:|/[^]*)") return -1;
	if (a === "[^/]+") return 1;
	else if (b === "[^/]+") return -1;
	return a.length === b.length ? a < b ? -1 : 1 : b.length - a.length;
}
var Node$1 = class Node {
	#index;
	#varIndex;
	#children = createNullObject();
	insert(tokens, index, paramMap, context, keys) {
		let node = this;
		for (let i = 0, len = tokens.length; i < len; i++) {
			const token = tokens[i];
			const pattern = token.length === 1 ? token === "*" ? i === len - 1 ? [
				"",
				"",
				ONLY_WILDCARD_REG_EXP_STR
			] : [
				"",
				"",
				LABEL_REG_EXP_STR
			] : null : token === "/*" ? [
				"",
				"",
				TAIL_WILDCARD_REG_EXP_STR
			] : token.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
			let nextNode;
			if (pattern) {
				const name = pattern[1];
				let regexpStr = pattern[2] || "[^/]+";
				if (name && pattern[2]) {
					if (new RegExp(regexpStr).test("")) throw PATH_ERROR;
					regexpStr = regexpStr.replace(/^\((?!\?:)(?=[^)]+\)$)/, "(?:");
					if (/\((?!\?:)/.test(regexpStr)) throw PATH_ERROR;
					if (regexpStr.length === 1 && regExpMetaChars.has(regexpStr)) throw PATH_ERROR;
				}
				keys.push(regexpStr);
				nextNode = node.#children[regexpStr];
				if (!nextNode) {
					if (regexpStr !== "[^]*" && regexpStr !== "(?:|/[^]*)") {
						for (const k in node.#children) if ((regexpStr.length > 1 || k.length > 1) && k !== "[^]*" && k !== "(?:|/[^]*)") throw PATH_ERROR;
					}
					nextNode = node.#children[regexpStr] = new Node();
				}
				if (name !== "") {
					nextNode.#varIndex ??= context.varIndex++;
					paramMap.push([name, nextNode.#varIndex]);
				}
			} else {
				keys.push(token);
				nextNode = node.#children[token];
				if (!nextNode) {
					for (const k in node.#children) if (k.length > 1 && k !== "[^]*" && k !== "(?:|/[^]*)") throw PATH_ERROR;
					nextNode = node.#children[token] = new Node();
				}
			}
			node = nextNode;
		}
		if (node.#index !== void 0) throw PATH_ERROR;
		node.#index = index;
	}
	buildRegExpStr() {
		const strList = Object.keys(this.#children).sort(compareKey).map((k) => {
			const c = this.#children[k];
			const childStr = c.buildRegExpStr();
			return childStr === "" ? "" : (typeof c.#varIndex === "number" ? `(${k})@${c.#varIndex}` : regExpMetaChars.has(k) ? `\\${k}` : k) + childStr;
		}).filter(Boolean);
		if (typeof this.#index === "number" && this.#index !== -1) strList.unshift(`#${this.#index}`);
		if (strList.length === 0) return "";
		if (strList.length === 1) return strList[0];
		return "(?:" + strList.join("|") + ")";
	}
};
// node_modules/hono/dist/router/reg-exp-router/trie.js
var Trie = class {
	#context = { varIndex: 0 };
	#root = new Node$1();
	#index = 0;
	paths = createNullObject();
	insert(path, isStatic) {
		const keys = [];
		if (isStatic) {
			this.#root.insert(path.split(""), -1, [], this.#context, keys);
			this.paths[path] = [
				-1,
				[],
				keys
			];
			return;
		}
		const paramAssoc = [];
		const groups = [];
		let markedPath = path;
		for (let i = 0;;) {
			let replaced = false;
			markedPath = markedPath.replace(/\{(?:\{[\d,]+\}|[^}])+\}/g, (m) => {
				const mark = `@\\${i}`;
				groups[i] = [mark, m];
				i++;
				replaced = true;
				return mark;
			});
			if (!replaced) break;
		}
		/**
		*  - pattern (:label, :label{0-9]+}, ...)
		*  - /* wildcard
		*  - character
		*/
		const tokens = markedPath.match(/(?::[^\/]+)|(?:\/\*$)|./gs) || [];
		for (let i = groups.length - 1; i >= 0; i--) {
			const [mark] = groups[i];
			for (let j = tokens.length - 1; j >= 0; j--) if (tokens[j].indexOf(mark) !== -1) {
				tokens[j] = tokens[j].replace(mark, groups[i][1]);
				break;
			}
		}
		this.#root.insert(tokens, this.#index, paramAssoc, this.#context, keys);
		this.paths[path] = [
			this.#index++,
			paramAssoc,
			keys
		];
	}
	buildRegExp() {
		let regexp = this.#root.buildRegExpStr();
		if (regexp === "") return [
			/^$/,
			[],
			[]
		];
		let captureIndex = 0;
		const indexReplacementMap = [];
		const paramReplacementMap = [];
		regexp = regexp.replace(/#(\d+)|@(\d+)|\.\*\$/g, (_, handlerIndex, paramIndex) => {
			if (handlerIndex !== void 0) {
				indexReplacementMap[++captureIndex] = Number(handlerIndex);
				return "$()";
			}
			if (paramIndex !== void 0) {
				paramReplacementMap[Number(paramIndex)] = ++captureIndex;
				return "";
			}
			return "";
		});
		return [
			new RegExp(`^${regexp}`),
			indexReplacementMap,
			paramReplacementMap
		];
	}
};
// node_modules/hono/dist/router/reg-exp-router/router.js
function endsWithWildcard(keys) {
	const tail = keys[keys.length - 1];
	return tail === "[^]*" || tail === "(?:|/[^]*)";
}
function covers(wildcard, target) {
	const last = wildcard.length - 1;
	for (let i = 0; i < last; i++) if (wildcard[i] !== target[i]) return false;
	return wildcard[last] === "[^]*" || target.length === last || target[last] === "/";
}
var RegExpRouter = class {
	name = "RegExpRouter";
	#handlers;
	#tries;
	constructor() {
		this.#handlers = { ["ALL"]: [] };
		this.#tries = { ["ALL"]: new Trie() };
	}
	#insertPath(method, path) {
		try {
			this.#tries[method].insert(path, !/\*|\/:/.test(path));
		} catch (e) {
			throw e === PATH_ERROR ? new UnsupportedPathError(path) : e;
		}
	}
	add(method, path, handler) {
		const handlers = this.#handlers;
		if (!handlers) throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
		const tries = this.#tries;
		if (!handlers[method]) {
			tries[method] = new Trie();
			handlers[method] = [...handlers["ALL"]];
			for (const p in tries["ALL"].paths) this.#insertPath(method, p);
		}
		if (path === "/*") path = "*";
		const methods = method === "ALL" ? Object.keys(handlers) : [method];
		const paths = checkOptionalParameter(path) || [path];
		for (const path of paths) for (const m of methods) {
			if (!tries[m].paths[path]) this.#insertPath(m, path);
			handlers[m].push([handler, path]);
		}
	}
	match = match;
	buildAllMatchers() {
		const matchers = createNullObject();
		for (const method of Object.keys(this.#handlers)) matchers[method] = this.#buildMatcher(method);
		this.#handlers = this.#tries = void 0;
		return matchers;
	}
	#buildMatcher(method) {
		const handlers = this.#handlers[method];
		const trie = this.#tries[method];
		const staticMap = createNullObject();
		const handlerData = [];
		const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
		const own = createNullObject();
		const entries = handlers.map(([h, p], i) => {
			(own[p] ??= []).push(i);
			return [h, trie.paths[p][1].reduceRight((map, [key, varIndex]) => {
				map[key] = paramReplacementMap[varIndex];
				return map;
			}, createNullObject())];
		});
		const wildcards = Object.keys(own).filter((p) => endsWithWildcard(trie.paths[p][2]));
		for (const path in trie.paths) {
			const [index, , keys] = trie.paths[path];
			const indexes = [...own[path]];
			for (const p of wildcards) if (p !== path && covers(trie.paths[p][2], keys)) indexes.push(...own[p]);
			const data = indexes.sort((a, b) => a - b).map((i) => entries[i]);
			if (index === -1) {
				const last = Math.max(-1, ...data.flatMap(([, map]) => Object.values(map)));
				staticMap[path] = [data, last === -1 ? emptyParam : path.match(regexp).slice(0, last + 1)];
			} else handlerData[index] = data;
		}
		return [
			regexp,
			indexReplacementMap.map((i) => handlerData[i]),
			staticMap
		];
	}
};
// node_modules/hono/dist/router/smart-router/router.js
var SmartRouter = class {
	name = "SmartRouter";
	#routers = [];
	#routes = [];
	constructor(init) {
		this.#routers = init.routers;
	}
	add(method, path, handler) {
		if (!this.#routes) throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
		this.#routes.push([
			method,
			path,
			handler
		]);
	}
	match(method, path) {
		if (!this.#routes) throw new Error("Fatal error");
		const routers = this.#routers;
		const routes = this.#routes;
		const len = routers.length;
		let i = 0;
		let res;
		for (; i < len; i++) {
			const router = routers[i];
			try {
				for (let i = 0, len = routes.length; i < len; i++) router.add(...routes[i]);
				res = router.match(method, path);
			} catch (e) {
				if (e instanceof UnsupportedPathError) continue;
				throw e;
			}
			this.match = router.match.bind(router);
			this.#routers = [router];
			this.#routes = void 0;
			break;
		}
		if (i === len) throw new Error("Fatal error");
		this.name = `SmartRouter + ${this.activeRouter.name}`;
		return res;
	}
	get activeRouter() {
		if (this.#routes || this.#routers.length !== 1) throw new Error("No active router has been determined yet.");
		return this.#routers[0];
	}
};
// node_modules/hono/dist/router/trie-router/node.js
var emptyParams = createNullObject();
var order = 0;
var Node = class Node {
	#methods = [];
	#children = createNullObject();
	#patterns = [];
	#pattern;
	#params = emptyParams;
	insert(method, path, handler) {
		let curNode = this;
		const parts = splitRoutingPath(path);
		const possibleKeys = /* @__PURE__ */ new Set();
		let i = 0;
		for (const p of parts) {
			const nextP = parts[++i];
			const pattern = getPattern(p, nextP) || (nextP === void 0 && p && p.indexOf("*") === p.length - 1 ? p : null);
			const isParam = Array.isArray(pattern);
			const key = isParam ? pattern[0] : pattern || p;
			const child = curNode.#children[key] ||= new Node();
			if (pattern && !child.#pattern) {
				child.#pattern = pattern;
				curNode.#patterns.push(child);
			}
			curNode = child;
			if (isParam) possibleKeys.add(pattern[1]);
		}
		curNode.#methods.push({ [method]: {
			handler,
			possibleKeys: [...possibleKeys],
			score: ++order
		} });
	}
	#pushHandlerSets(handlerSets, node, method, nodeParams, params) {
		for (let i = 0, len = node.#methods.length; i < len; i++) {
			const m = node.#methods[i];
			const handlerSet = m[method] || m["ALL"];
			if (handlerSet) {
				handlerSet.params = createNullObject();
				handlerSets.push(handlerSet);
				for (let i = 0, len = handlerSet.possibleKeys.length; i < len; i++) {
					const key = handlerSet.possibleKeys[i];
					handlerSet.params[key] = params?.[key] && !i ? params[key] : nodeParams[key] ?? params?.[key];
				}
			}
		}
	}
	search(method, path) {
		const handlerSets = [];
		this.#params = emptyParams;
		let curNodes = [this];
		const parts = splitPath(path);
		const curNodesQueue = [];
		const len = parts.length;
		let partOffsets = null;
		for (let i = 0; i < len; i++) {
			const part = parts[i];
			const isLast = i === len - 1;
			const tempNodes = [];
			for (let j = 0, len2 = curNodes.length; j < len2; j++) {
				const node = curNodes[j];
				const nextNode = node.#children[part];
				if (nextNode) {
					nextNode.#params = node.#params;
					if (isLast) {
						if (nextNode.#children["*"]) this.#pushHandlerSets(handlerSets, nextNode.#children["*"], method, node.#params);
						this.#pushHandlerSets(handlerSets, nextNode, method, node.#params);
					} else tempNodes.push(nextNode);
				}
				for (const child of node.#patterns) {
					const pattern = child.#pattern;
					const params = node.#params === emptyParams ? {} : { ...node.#params };
					if (typeof pattern === "string") {
						if (pattern === "*" || part.startsWith(pattern.slice(0, -1))) {
							this.#pushHandlerSets(handlerSets, child, method, node.#params);
							if (pattern === "*") {
								child.#params = params;
								tempNodes.push(child);
							}
						}
						continue;
					}
					const [, name, matcher] = pattern;
					if (!part && matcher === true) continue;
					if (matcher !== true) {
						if (!partOffsets) {
							partOffsets = [];
							let offset = path[0] === "/" ? 1 : 0;
							for (let p = 0; p < len; p++) {
								partOffsets[p] = offset;
								offset += parts[p].length + 1;
							}
						}
						const restPathString = path.slice(partOffsets[i]);
						const m = matcher.exec(restPathString);
						if (m) {
							if (!Object.hasOwn(params, name)) params[name] = m[0];
							this.#pushHandlerSets(handlerSets, child, method, node.#params, params);
							if (m[0].length === restPathString.length && child.#children["*"]) this.#pushHandlerSets(handlerSets, child.#children["*"], method, node.#params, params);
							for (const _ in child.#children) {
								child.#params = params;
								const componentCount = m[0].match(/\//g)?.length ?? 0;
								(curNodesQueue[componentCount] ||= []).push(child);
								break;
							}
							continue;
						}
					}
					if (matcher === true || matcher.test(part)) {
						if (!Object.hasOwn(params, name)) params[name] = part;
						if (isLast) {
							this.#pushHandlerSets(handlerSets, child, method, params, node.#params);
							if (child.#children["*"]) this.#pushHandlerSets(handlerSets, child.#children["*"], method, params, node.#params);
						} else {
							child.#params = params;
							tempNodes.push(child);
						}
					}
				}
			}
			const shifted = curNodesQueue.shift();
			curNodes = shifted ? tempNodes.concat(shifted) : tempNodes;
		}
		if (handlerSets[1]) handlerSets.sort((a, b) => {
			return a.score - b.score;
		});
		return [handlerSets.map(({ handler, params }) => [handler, params])];
	}
};
// node_modules/hono/dist/router/trie-router/router.js
var TrieRouter = class {
	name = "TrieRouter";
	#node = new Node();
	add(method, path, handler) {
		for (const result of checkOptionalParameter(path) || [path]) this.#node.insert(method, result, handler);
	}
	match(method, path) {
		return this.#node.search(method, path);
	}
};
// node_modules/hono/dist/hono.js
/**
* The Hono class extends the functionality of the HonoBase class.
* It sets up routing and allows for custom options to be passed.
*
* @template E - The environment type.
* @template S - The schema type.
* @template BasePath - The base path type.
*/
var Hono = class extends Hono$1 {
	/**
	* Creates an instance of the Hono class.
	*
	* @param options - Optional configuration options for the Hono instance.
	*/
	constructor(options = {}) {
		super(options);
		this.router = options.router ?? new SmartRouter({ routers: [new RegExpRouter(), new TrieRouter()] });
	}
};
// node_modules/void/dist/routing-assets-DJIVOrCh.mjs
var ASSET_EXTENSIONS = [
	"png",
	"jpg",
	"jpeg",
	"gif",
	"webp",
	"avif",
	"svg",
	"ico",
	"css",
	"js",
	"mjs",
	"cjs",
	"woff",
	"woff2",
	"ttf",
	"otf",
	"eot",
	"mp4",
	"webm",
	"mp3",
	"wav",
	"pdf",
	"txt",
	"xml",
	"json",
	"wasm",
	"map"
];
function createManifestLoader() {
	let cached = null;
	let pending = null;
	return async (request, env) => {
		if (cached) return cached;
		const injected = globalThis.__VITE_MANIFEST__;
		if (typeof injected === "object" && injected) {
			cached = injected;
			return cached;
		}
		const assets = env?.ASSETS;
		if (!assets || typeof assets.fetch !== "function") return null;
		pending ??= (async () => {
			const response = await assets.fetch(new Request(new URL("/.vite/manifest.json", request.url).toString()));
			if (!response.ok) return null;
			cached = await response.json();
			return cached;
		})().finally(() => {
			pending = null;
		});
		return pending;
	};
}
// node_modules/void/dist/error-pages-COVBnzK7.mjs
var _404_default = "<!doctype html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"utf-8\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n    <title>404: Not Found</title>\n    <!-- inject:css -->\n    <!--\n      Do not add code here. At runtime, the file referenced by the tag below is\n      inlined, replacing this entire block (including this comment).\n      The tag is kept so you can preview this HTML file by opening it directly in a browser.\n    -->\n    <link rel=\"stylesheet\" href=\"./style.css\" />\n    <!-- endinject -->\n    <!-- inject:js -->\n    <!--\n      Do not add code here. At runtime, the file referenced by the tag below is\n      inlined, replacing this entire block (including this comment).\n      The tag is kept so you can preview this HTML file by opening it directly in a browser.\n    -->\n    <script src=\"./script.js\"><\/script>\n    <!-- endinject -->\n  </head>\n  <body>\n    <div class=\"error-page\">\n      <div class=\"grid-cell\" aria-hidden=\"true\"></div>\n      <div class=\"grid-cell\" aria-hidden=\"true\"></div>\n      <div class=\"grid-cell\" aria-hidden=\"true\"></div>\n      <div class=\"grid-cell\" aria-hidden=\"true\"></div>\n      <main class=\"error-content\">\n        <span class=\"grid-tick top left\" aria-hidden=\"true\"></span>\n        <span class=\"grid-tick top right\" aria-hidden=\"true\"></span>\n        <span class=\"grid-tick bottom left\" aria-hidden=\"true\"></span>\n        <span class=\"grid-tick bottom right\" aria-hidden=\"true\"></span>\n        <h1>\n          <span class=\"error-code\">404</span><span class=\"error-title\">Lost in the void</span>\n        </h1>\n        <p class=\"error-description\">This page doesn't exist</p>\n        <button class=\"error-action\" type=\"button\" id=\"void-error-back\" hidden>\n          <span class=\"error-arrow\" aria-hidden=\"true\">←</span>Go back\n        </button>\n      </main>\n      <div class=\"grid-cell\" aria-hidden=\"true\"></div>\n      <div class=\"grid-cell\" aria-hidden=\"true\"></div>\n      <div class=\"grid-cell\" aria-hidden=\"true\"></div>\n      <div class=\"grid-cell\" aria-hidden=\"true\"></div>\n      <canvas class=\"error-texture\" aria-hidden=\"true\"></canvas>\n    </div>\n  </body>\n</html>\n";
var _500_default = "<!doctype html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"utf-8\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n    <title>500: Internal Server Error</title>\n    <!-- inject:css -->\n    <!--\n      Do not add code here. At runtime, the file referenced by the tag below is\n      inlined, replacing this entire block (including this comment).\n      The tag is kept so you can preview this HTML file by opening it directly in a browser.\n    -->\n    <link rel=\"stylesheet\" href=\"./style.css\" />\n    <!-- endinject -->\n    <!-- inject:js -->\n    <!--\n      Do not add code here. At runtime, the file referenced by the tag below is\n      inlined, replacing this entire block (including this comment).\n      The tag is kept so you can preview this HTML file by opening it directly in a browser.\n    -->\n    <script src=\"./script.js\"><\/script>\n    <!-- endinject -->\n  </head>\n  <body>\n    <div class=\"error-page\">\n      <div class=\"grid-cell\" aria-hidden=\"true\"></div>\n      <div class=\"grid-cell\" aria-hidden=\"true\"></div>\n      <div class=\"grid-cell\" aria-hidden=\"true\"></div>\n      <div class=\"grid-cell\" aria-hidden=\"true\"></div>\n      <main class=\"error-content\">\n        <span class=\"grid-tick top left\" aria-hidden=\"true\"></span>\n        <span class=\"grid-tick top right\" aria-hidden=\"true\"></span>\n        <span class=\"grid-tick bottom left\" aria-hidden=\"true\"></span>\n        <span class=\"grid-tick bottom right\" aria-hidden=\"true\"></span>\n        <h1>\n          <span class=\"error-code\">500</span><span class=\"error-title\">Something went wrong</span>\n        </h1>\n        <p class=\"error-description\">Please try again in a moment</p>\n        <a class=\"error-action\" href=\"\"\n          ><span class=\"error-arrow\" aria-hidden=\"true\">↻</span>Reload page</a\n        >\n      </main>\n      <div class=\"grid-cell\" aria-hidden=\"true\"></div>\n      <div class=\"grid-cell\" aria-hidden=\"true\"></div>\n      <div class=\"grid-cell\" aria-hidden=\"true\"></div>\n      <div class=\"grid-cell\" aria-hidden=\"true\"></div>\n      <canvas class=\"error-texture\" aria-hidden=\"true\"></canvas>\n    </div>\n  </body>\n</html>\n";
var closing = "<!-- endinject -->";
function replaceAssetBlock(html, name, content) {
	const opening = `<!-- inject:${name} -->`;
	const start = html.indexOf(opening);
	const end = html.indexOf(closing, start + opening.length);
	if (start === -1 || end === -1 || html.lastIndexOf(opening) !== start) throw new Error(`Expected one complete ${name} block in the default error page.`);
	return html.slice(0, start) + content + html.slice(end + 18);
}
function inlineErrorPageAssets(html, stylesheet, script) {
	if (html.split(closing).length !== 3) throw new Error("Expected two endinject markers in the default error page.");
	for (const [name, content] of [["css", `<style>\n${stylesheet}</style>`], ["js", `<script>\n${script}<\/script>`]]) html = replaceAssetBlock(html, name, content);
	return html;
}
var script_default = "(() => {\n  const designs = ['signal', 'grid', 'fold'];\n  document.documentElement.dataset.design = designs[Math.floor(Math.random() * designs.length)];\n\n  function setup() {\n    const back = document.getElementById('void-error-back');\n    const canGoBack = window.navigation ? window.navigation.canGoBack : window.history.length > 1;\n    if (back && canGoBack) {\n      back.hidden = false;\n      back.addEventListener('click', () => window.history.back());\n    }\n\n    if (document.documentElement.dataset.design !== 'signal') {\n      return;\n    }\n    const canvas = document.querySelector('.error-texture');\n    const ctx = canvas.getContext('2d');\n    if (!ctx) {\n      return;\n    }\n\n    function draw() {\n      const { width, height } = canvas.getBoundingClientRect();\n      const ratio = Math.min(window.devicePixelRatio || 1, 2);\n      canvas.width = Math.round(width * ratio);\n      canvas.height = Math.round(height * ratio);\n      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);\n      const colors = getComputedStyle(canvas);\n      const chars = ['·', '/', '0', '1', '+', '[', ']', '—'];\n      ctx.font = '8px ui-monospace, monospace';\n      ctx.textAlign = 'center';\n      ctx.textBaseline = 'middle';\n      ctx.fillStyle = colors.color;\n\n      for (let y = 8, row = 0; y < height; y += 12, row++) {\n        for (let x = 8, col = 0; x < width; x += 9, col++) {\n          const distance = Math.hypot(\n            (x - width / 2) / (width * 0.47),\n            (y - height * 0.48) / (height * 0.55),\n          );\n          const seed = (Math.imul(row + 11, 61) ^ Math.imul(col + 7, 137)) >>> 0;\n          const core = Math.max(0, Math.min(1, (distance - 0.28) / 0.55));\n          const opacity = core * (0.15 + (seed % 7) * 0.025) * 0.75;\n          if (seed % 17 === 0 || opacity < 0.015) {\n            continue;\n          }\n          ctx.globalAlpha = opacity;\n          ctx.fillText(chars[(seed >>> 3) % chars.length], x, y);\n        }\n      }\n\n      ctx.globalAlpha = 1;\n      ctx.strokeStyle = colors.borderTopColor;\n      for (const [x, y] of [\n        [28, 28],\n        [width - 28, 28],\n        [28, height - 28],\n        [width - 28, height - 28],\n      ]) {\n        ctx.beginPath();\n        ctx.moveTo(x - 4, y);\n        ctx.lineTo(x + 4, y);\n        ctx.moveTo(x, y - 4);\n        ctx.lineTo(x, y + 4);\n        ctx.stroke();\n      }\n    }\n\n    new ResizeObserver(draw).observe(canvas);\n    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);\n    draw();\n  }\n\n  if (document.readyState === 'loading') {\n    document.addEventListener('DOMContentLoaded', setup, { once: true });\n  } else {\n    setup();\n  }\n})();\n";
var style_default = ":root {\n  color-scheme: light dark;\n  --background: light-dark(#fff, #16171d);\n  --foreground: light-dark(#16171d, #f6f5f8);\n  --muted: light-dark(#6e6874, #a8a2ae);\n  --line: light-dark(#e5e4e7, #36323c);\n  --ink: light-dark(#4e4856, #c3bdcd);\n  --corner: light-dark(#e5e4e7, #3b3440);\n  background: var(--background);\n  color: var(--foreground);\n  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;\n  -webkit-font-smoothing: antialiased;\n}\n\n* {\n  box-sizing: border-box;\n}\n\nbody {\n  margin: 0;\n}\n\n.error-page {\n  position: relative;\n  isolation: isolate;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  min-block-size: 100svh;\n  overflow: hidden;\n}\n\n.error-content {\n  min-inline-size: 0;\n  padding: 32px 24px;\n  text-align: center;\n}\n\n.error-content h1 {\n  display: flex;\n  flex-direction: column;\n  gap: 18px;\n  margin: 0;\n  font-weight: 500;\n}\n\n.error-code {\n  font-size: 64px;\n  line-height: 1;\n  letter-spacing: -0.045em;\n}\n\n.error-title {\n  font-size: 15px;\n  line-height: 1.4;\n  letter-spacing: -0.02em;\n  text-wrap: balance;\n}\n\n.error-description {\n  margin: 6px 0 0;\n  color: var(--muted);\n  font-size: 12px;\n  line-height: 1.5;\n  letter-spacing: -0.01em;\n}\n\n.error-action {\n  position: relative;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 7px;\n  min-block-size: 32px;\n  margin-block-start: 20px;\n  padding: 6px 12px;\n  border: 1px solid var(--line);\n  border-radius: 6px;\n  background: var(--background);\n  color: var(--foreground);\n  font:\n    500 12px/18px system-ui,\n    -apple-system,\n    BlinkMacSystemFont,\n    'Segoe UI',\n    sans-serif;\n  letter-spacing: -0.01em;\n  text-decoration: none;\n  white-space: nowrap;\n  cursor: pointer;\n}\n\n.error-action::after {\n  position: absolute;\n  inset: -6px -3px;\n  content: '';\n}\n\n.error-action:hover {\n  border-color: var(--foreground);\n  background: var(--foreground);\n  color: var(--background);\n}\n\n.error-action:focus-visible {\n  outline: 2px solid var(--foreground);\n  outline-offset: 4px;\n}\n\n.error-action[hidden] {\n  visibility: hidden;\n}\n\n.error-arrow {\n  font-size: 15px;\n  line-height: 14px;\n}\n\n.error-texture {\n  position: absolute;\n  z-index: -1;\n  inset: 0;\n  display: block;\n  inline-size: 100%;\n  block-size: 100%;\n  border-color: var(--line);\n  color: var(--ink);\n}\n\n.grid-cell,\n.grid-tick {\n  display: none;\n}\n\n.grid-tick {\n  position: absolute;\n  z-index: 1;\n  inline-size: 0;\n  block-size: 0;\n  border: 5px solid transparent;\n  pointer-events: none;\n}\n\n:root[data-design='grid'] .error-page {\n  display: grid;\n  grid-template-columns: minmax(24px, 1fr) minmax(0, 456px) minmax(24px, 1fr);\n  grid-template-rows: minmax(24px, 1fr) minmax(272px, auto) minmax(24px, 1fr);\n  align-items: stretch;\n}\n\n:root[data-design='grid'] .grid-cell,\n:root[data-design='grid'] .error-content {\n  min-inline-size: 0;\n  border-inline-end: 1px solid var(--line);\n  border-block-end: 1px solid var(--line);\n}\n\n:root[data-design='grid'] .grid-cell {\n  display: block;\n}\n\n:root[data-design='grid'] .grid-cell:nth-child(3n) {\n  border-inline-end: 0;\n}\n\n:root[data-design='grid'] .grid-cell:nth-child(n + 7) {\n  border-block-end: 0;\n}\n\n:root[data-design='grid'] .error-content {\n  position: relative;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  padding: 32px;\n}\n\n:root[data-design='grid'] .grid-tick {\n  display: block;\n}\n\n.grid-tick.left {\n  left: -1px;\n  border-left-color: var(--corner);\n}\n\n.grid-tick.right {\n  right: 0;\n  border-right-color: var(--corner);\n}\n\n.grid-tick.top {\n  top: -5px;\n}\n\n.grid-tick.bottom {\n  bottom: -5px;\n}\n\n:root[data-design='grid'] .error-texture,\n:root[data-design='fold'] .error-texture {\n  display: none;\n}\n\n:root[data-design='fold'] .error-page {\n  padding: 40px 42px;\n}\n\n:root[data-design='fold'] .error-content {\n  flex: 0 1 560px;\n  margin-inline-end: auto;\n  padding: 0;\n  text-align: start;\n}\n\n:root[data-design='fold'] h1 {\n  flex-direction: row;\n  align-items: baseline;\n  gap: 14px;\n}\n\n:root[data-design='fold'] .error-code,\n:root[data-design='fold'] .error-title {\n  font-size: 26px;\n  line-height: 1.2;\n  letter-spacing: -0.025em;\n}\n\n:root[data-design='fold'] .error-code {\n  flex: none;\n  color: var(--muted);\n  font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;\n  font-weight: 400;\n  letter-spacing: -0.045em;\n}\n\n:root[data-design='fold'] .error-description {\n  margin-block-start: 12px;\n  font-size: 14px;\n  line-height: 1.6;\n  text-wrap: pretty;\n}\n\n:root[data-design='fold'] .error-action {\n  margin-block-start: 24px;\n}\n\n@supports (corner-shape: squircle) {\n  .error-action {\n    border-radius: 12px;\n    corner-shape: squircle;\n  }\n}\n\n@media (pointer: coarse) {\n  .error-action {\n    min-block-size: 40px;\n  }\n}\n\n@media (max-width: 620px) {\n  :root[data-design='fold'] .error-page {\n    padding: 36px 30px;\n  }\n\n  :root[data-design='fold'] .error-code,\n  :root[data-design='fold'] .error-title {\n    font-size: 24px;\n  }\n}\n\n@media (max-width: 440px) {\n  .error-code {\n    font-size: 56px;\n  }\n\n  :root[data-design='grid'] .error-page {\n    grid-template-columns: 24px minmax(0, 1fr) 24px;\n  }\n\n  :root[data-design='grid'] .error-content {\n    padding: 24px;\n  }\n\n  :root[data-design='fold'] .error-code {\n    display: none;\n  }\n\n  :root[data-design='fold'] .error-action {\n    margin-block-start: 20px;\n  }\n}\n";
inlineErrorPageAssets(_404_default, style_default, script_default), inlineErrorPageAssets(_500_default, style_default, script_default);
// node_modules/void/dist/action-key-XtKKbbsi.mjs
var actionKeyRequests = /* @__PURE__ */ new WeakSet();
function markActionKey(request) {
	actionKeyRequests.add(request);
}
function hasActionKey(request) {
	return actionKeyRequests.has(request);
}
/** The first non-empty segment of `search` as sent: `delete` in `?delete&page=2`. */
function actionKeySegment(search) {
	let start = 1;
	while (search[start] === "&") start++;
	const end = search.indexOf("&", start);
	return search.slice(start, end === -1 ? search.length : end);
}
/** `search` without its first non-empty segment; the rest is kept as sent. */
function searchWithoutActionKey(search) {
	let start = 1;
	while (search[start] === "&") start++;
	let rest = search.indexOf("&", start);
	if (rest === -1) return "";
	while (search[rest] === "&") rest++;
	return rest < search.length ? "?" + search.slice(rest) : "";
}
// node_modules/void/dist/base64-ikl9yBy3.mjs
/** Throws on invalid input. */
function base64ToBytes(value) {
	const binary = atob(value);
	const out = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
	return out;
}
// node_modules/void/dist/route-url-CRDF-I0I.mjs
/**
* Encode one path segment of a route param. `encodeURIComponent` keeps dots, and
* URL parsing resolves `.`/`..` (even as `%2e`), so such a segment would move the
* request to another path instead of reaching this route.
*/
function encodeSegment(name, segment) {
	if (segment === "." || segment === "..") throw new TypeError(`Route param "${name}" cannot be "${segment}"; it would change the request path.`);
	return encodeURIComponent(segment);
}
/** Expand complete route tokens without changing query strings or fragments. */
function interpolateRouteParams(path, params, requireParams = false) {
	if (!params && !requireParams) return path;
	const suffixIndex = path.search(/[?#]/);
	const pathname = suffixIndex === -1 ? path : path.slice(0, suffixIndex);
	const suffix = suffixIndex === -1 ? "" : path.slice(suffixIndex);
	let leadingName;
	const replaced = pathname.replace(/(^|\/)(?::([^/{}]+)(\{\.\+\})?|\*)(?=\/|$)/g, (token, prefix, name, catchAll, offset) => {
		const anonymous = name === void 0;
		if (anonymous && !requireParams) return token;
		name ??= "*";
		if (!params || !Object.hasOwn(params, name)) {
			if (requireParams) throw new TypeError(`Missing route param "${name}".`);
			return token;
		}
		if (offset === 0) leadingName = name;
		const value = params[name];
		if (requireParams && !anonymous && value === "") throw new TypeError(`Route param "${name}" must not be empty.`);
		return prefix + (catchAll || anonymous ? value.split("/").map((segment) => encodeSegment(name, segment)).join("/") : encodeSegment(name, value));
	});
	if (replaced.startsWith("//") && !pathname.startsWith("//")) throw new TypeError(`Route param "${leadingName ?? ""}" would make the request path start with "//", which changes the request host.`);
	return replaced + suffix;
}
function toUrlString(value) {
	if (typeof value === "string") return value;
	if ("href" in value && typeof value.href === "string") return value.href;
	return buildRouteUrl(value.pathname, value);
}
function buildRouteUrl(path, options) {
	const params = Object.fromEntries(Object.entries(options?.params ?? {}).map(([name, value]) => {
		if (typeof value !== "string" && typeof value !== "number") throw new TypeError(`Route param "${name}" must be a string or number.`);
		return [name, String(value)];
	}));
	const url = new URL("https://void.invalid");
	url.pathname = interpolateRouteParams(path, params, true);
	for (const [key, value] of Object.entries(options?.query ?? {})) {
		const values = Array.isArray(value) ? value : [value];
		for (const item of values) if (item !== null && item !== void 0) url.searchParams.append(key, String(item));
	}
	if (options?.hash) url.hash = options.hash;
	return url.pathname + url.search + url.hash;
}
// node_modules/void/dist/runtime/routing.mjs
var ASSET_CONTENT_TYPES = {
	".avif": "image/avif",
	".css": "text/css; charset=utf-8",
	".gif": "image/gif",
	".html": "text/html; charset=utf-8",
	".ico": "image/x-icon",
	".jpeg": "image/jpeg",
	".jpg": "image/jpeg",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".png": "image/png",
	".svg": "image/svg+xml",
	".txt": "text/plain; charset=utf-8",
	".wasm": "application/wasm",
	".webp": "image/webp",
	".woff": "font/woff",
	".woff2": "font/woff2"
};
/** Apply native static policy before application middleware adds authored headers. */
function applyAssetCachePolicy(request, asset, assetsDir = "assets", fingerprinted = false) {
	if (!["GET", "HEAD"].includes(request.method) || ![
		200,
		206,
		304
	].includes(asset.status)) return asset;
	const pathname = new URL(request.url).pathname;
	const filename = pathname.slice(pathname.lastIndexOf("/") + 1);
	const extension = filename.slice(filename.lastIndexOf(".")).toLowerCase();
	const headers = new Headers(asset.headers);
	if (!headers.has("Content-Type") && ASSET_CONTENT_TYPES[extension]) headers.set("Content-Type", ASSET_CONTENT_TYPES[extension]);
	const policy = headers.get("Cache-Control");
	const providerDefault = (policy ?? "").toLowerCase().split(",").map((part) => part.trim()).sort().join(",") === "max-age=0,must-revalidate,public";
	const hashed = fingerprinted && pathname.startsWith("/" + assetsDir.replace(/^\/+|\/+$/g, "") + "/") && extension !== ".html" && !(headers.get("Content-Type") ?? "").toLowerCase().includes("text/html");
	if (!headers.has("Set-Cookie") && hashed && (!policy || providerDefault)) headers.set("Cache-Control", "public, max-age=31536000, immutable");
	else if (!policy) headers.set("Cache-Control", "no-store");
	return new Response(asset.body, {
		status: asset.status,
		statusText: asset.statusText,
		headers
	});
}
/** Public filenames are never evidence of a content fingerprint. */
function createAssetCachePolicy(assetsDir, loadManifest = createManifestLoader()) {
	let files;
	return async (request, env, asset) => {
		const path = new URL(request.url).pathname;
		if (!["GET", "HEAD"].includes(request.method) || ![
			200,
			206,
			304
		].includes(asset.status) || !path.startsWith("/" + (assetsDir ?? "assets").replace(/^\/+|\/+$/g, "") + "/")) return applyAssetCachePolicy(request, asset, assetsDir);
		if (!files) files = loadManifest(request, env).then((manifest) => new Set(Object.values(manifest ?? {}).flatMap((entry) => Array.isArray(entry?.immutableFiles) ? entry.immutableFiles : [])), () => /* @__PURE__ */ new Set());
		return applyAssetCachePolicy(request, asset, assetsDir, (await files).has(path.slice(1)));
	};
}
function createAssetFallback(options = {}) {
	const cachePolicy = createAssetCachePolicy(options.assetsDir);
	return async (request, env, response) => {
		if (response.status !== 404 || !env.ASSETS || request.method !== "GET" && request.method !== "HEAD") return response;
		const asset = await env.ASSETS.fetch(new Request(request.url, {
			method: request.method,
			headers: request.headers
		}));
		if (asset.status !== 404) return cachePolicy(request, env, asset);
		const accept = request.headers.get("accept") ?? "";
		if (options.serveSpaFallback && accept.includes("text/html")) {
			const url = new URL("/index.html", request.url);
			const index = await env.ASSETS.fetch(new Request(url, { method: request.method }));
			if (index.status === 200) {
				const res = new Response(index.body, {
					status: 200,
					headers: index.headers
				});
				res.headers.set("Cache-Control", "no-store");
				res.headers.set("Content-Type", "text/html; charset=utf-8");
				return res;
			}
		} else if (!options.serveSpaFallback && options.notFound === "404-page" && accept.includes("text/html") && (asset.headers.get("content-type") ?? "").includes("text/html")) {
			const res = new Response(asset.body, asset);
			res.headers.set("Cache-Control", "no-store");
			return res;
		}
		return response;
	};
}
/** Hide platform capabilities without copying bindings or changing application bindings. */
function filterInternalBindings(env, prefixes, exactNames = []) {
	const hidden = (key) => typeof key === "string" && (prefixes.some((prefix) => key.startsWith(prefix)) || exactNames.includes(key));
	return new Proxy(env, {
		get: (target, prop, receiver) => hidden(prop) ? void 0 : Reflect.get(target, prop, receiver),
		has: (target, prop) => !hidden(prop) && Reflect.has(target, prop),
		ownKeys: (target) => Reflect.ownKeys(target).filter((key) => !hidden(key)),
		getOwnPropertyDescriptor: (target, prop) => hidden(prop) ? void 0 : Reflect.getOwnPropertyDescriptor(target, prop)
	});
}
function createWorkerFetch(options) {
	return async (request, originalEnv, ctx) => {
		const url = new URL(request.url);
		const discovery = request.method === "POST" && url.pathname === "/__void/prerender-paths" && originalEnv.__VOID_PRERENDER === "1";
		if (options.validateEnv && !discovery) await options.validateEnv(originalEnv);
		const env = options.remoteEnv && originalEnv.__VOID_REMOTE === "1" ? options.remoteEnv(originalEnv) : originalEnv;
		if (options.isr) {
			env.__VOID_ISR_DEPLOYMENT_ID ??= options.isr.deploymentId;
			env.__VOID_ISR_HOST = url.hostname;
		}
		return options.withRawEnv(env, () => options.withRuntimeEnv(env, async () => {
			if (options.emailReceipt && url.pathname === "/__void/email/receipt/v1") return options.emailReceipt(request, env, ctx);
			if (request.method === "GET" && url.pathname === "/__void/ready") {
				const metadata = options.versionMetadataBinding ? env[options.versionMetadataBinding] : void 0;
				return Response.json({
					ready: true,
					...options.versionMetadataBinding ? { versionId: metadata?.id } : {}
				}, options.versionMetadataBinding ? { headers: { "cache-control": "no-store" } } : void 0);
			}
			const internal = await options.internalRoute(request, env, ctx);
			if (internal) return internal;
			if (discovery) return Response.json({ paths: await options.collectPrerenderPaths(request, env, ctx) });
			if (options.alwaysUseHttps) {
				const redirect = redirectToHttps(request);
				if (redirect) return redirect;
			}
			const userEnv = options.filterBindings(env);
			const render = async (req) => options.assets(req, env, await options.app.fetch(req, userEnv, ctx));
			if (options.isr && env.ISR_CACHE && request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
				const cached = await options.isr.handle(request, env, ctx, render);
				if (cached) return cached;
			}
			return render(request);
		}));
	};
}
var routeHandlers = /* @__PURE__ */ new WeakSet();
/** Records a handler that answers a route, so the marker can tell it from middleware. */
function markRouteHandler(handler) {
	routeHandlers.add(handler);
	return handler;
}
/** One state owner per generated app: recursive dispatch shares rewrite and fallback guards. */
function createRoutingRuntime(app, options = {}) {
	const originalUrls = /* @__PURE__ */ new WeakMap();
	const fallbackHandled = /* @__PURE__ */ new WeakSet();
	const warnedPatterns = /* @__PURE__ */ new Set();
	const requestContext = new AsyncLocalStorage();
	const assetExtensions = options.blockedAssetExtensions ?? ASSET_EXTENSIONS;
	const assetExtensionRE = assetExtensions.length ? new RegExp(`\\.(${assetExtensions.join("|")})$`, "i") : /(?!)/;
	const annotate = (response, trace) => {
		if (!options.dev) return response;
		const headers = new Headers(response.headers);
		headers.set("X-Void-Routing", trace);
		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers
		});
	};
	const dispatch = (request, c) => Promise.resolve(options.nodeTarget ? app.fetch(request, c.env) : app.fetch(request, c.env, c.executionCtx));
	const rememberOriginal = (request, c) => {
		originalUrls.set(request, originalUrls.get(c.req.raw) ?? new URL(c.req.url));
	};
	const warn = (pattern, error, kind) => {
		if (warnedPatterns.has(pattern)) return;
		warnedPatterns.add(pattern);
		const detail = error instanceof Error ? error.message : String(error);
		console.warn(kind === "routing" ? `[void] skipping routing rule with invalid source ${JSON.stringify(pattern)}: ${detail}` : `[void] failed to compile route pattern ${JSON.stringify(pattern)}: ${detail}`);
	};
	const applyRules = async (c, rules, fallback) => {
		const url = new URL(c.req.url);
		for (const rule of rules) {
			if (rule.host && rule.host !== url.hostname) continue;
			try {
				compilePattern(rule.source);
			} catch (error) {
				warn(rule.source, error, "routing");
				continue;
			}
			const params = matchPatternCaptures(rule.source, url.pathname);
			if (!params) continue;
			const destination = substituteParams(rule.destination, params);
			if (rule.status === 200) {
				const q = destination.indexOf("?");
				const rewriteUrl = new URL(c.req.url);
				rewriteUrl.pathname = q === -1 ? destination : destination.slice(0, q);
				const search = q === -1 ? "" : destination.slice(q);
				if (search) rewriteUrl.search = search;
				const request = new Request(rewriteUrl.toString(), c.req.raw);
				rememberOriginal(request, c);
				keepActionKey(c.req.raw, request, search);
				if (fallback) fallbackHandled.add(request);
				const response = await dispatch(request, c);
				const kind = rule.force === true ? "rewrite" : "fallback";
				return annotate(response, `${kind}[${rule.source}] -> ${destination} (${rule.origin || "unknown"})`);
			}
			const location = mergeQueryIntoLocation(destination, url.search);
			return annotate(c.redirect(location, rule.status), `redirect[${rule.source}] -> ${destination} ${rule.status} (${rule.origin || "unknown"})`);
		}
	};
	const contextMiddleware = async (context, next) => {
		const c = context;
		if (options.managedDispatch && !originalUrls.has(c.req.raw)) {
			const original = c.req.raw.headers.get("X-Void-Original-URL");
			if (original != null) try {
				originalUrls.set(c.req.raw, new URL(original));
			} catch {}
		}
		c.rewrite = (destination) => {
			const path = toUrlString(destination);
			if (!path.startsWith("/") || path.startsWith("//")) throw new Error("c.rewrite() only accepts internal, path-absolute destinations — they must start with a single \"/\" (a leading \"//\" parses as protocol-relative and would proxy cross-origin); use fetch() for external URLs");
			const q = path.indexOf("?");
			const h = path.indexOf("#");
			const first = q === -1 ? h : h === -1 ? q : Math.min(q, h);
			const pathname = first === -1 ? path : path.slice(0, first);
			if (assetExtensionRE.test(pathname)) throw new VoidAssetRewriteError(path);
			const search = q === -1 ? "" : path.slice(q, h === -1 ? path.length : h);
			const url = new URL(c.req.url);
			url.pathname = pathname;
			if (search) url.search = search;
			const request = new Request(url.toString(), c.req.raw);
			rememberOriginal(request, c);
			keepActionKey(c.req.raw, request, search);
			return dispatch(request, c).then((response) => annotate(response, `c.rewrite -> ${path} (middleware)`));
		};
		const redirect = context.redirect.bind(context);
		c.redirect = (destination, status) => {
			const location = toUrlString(destination);
			if (location.startsWith("/") && !location.startsWith("//")) return redirect(redirectLocation(c.req.raw, location, status), status);
			return redirect(location, status);
		};
		c.originalUrl = () => originalUrls.get(c.req.raw) ?? null;
		c.isRewritten = () => originalUrls.has(c.req.raw);
		await next();
	};
	return {
		requestContext,
		contextMiddleware,
		requestMiddleware: async (c, next) => {
			await requestContext.run(options.nodeTarget ? { request: c.req.raw } : {
				request: c.req.raw,
				executionCtx: c.executionCtx
			}, next);
		},
		routingMiddleware: (rules) => async (c, next) => {
			if (originalUrls.has(c.req.raw)) return next();
			const response = await applyRules(c, rules, false);
			if (response) return response;
			await next();
			if (options.dev && c.res && !c.res.headers.has("X-Void-Routing")) try {
				c.res.headers.set("X-Void-Routing", "pass-through");
			} catch {}
		},
		headerMiddleware: (rules) => async (c, next) => {
			await next();
			const pathname = new URL(c.req.url).pathname;
			const matched = [];
			for (const rule of rules) {
				try {
					compilePattern(rule.pattern);
				} catch (error) {
					warn(rule.pattern, error, "header");
					continue;
				}
				if (matchPattern(rule.pattern, pathname)) matched.push(...rule.headers);
			}
			if (!matched.length) return;
			const headers = new Headers(c.res.headers);
			for (const [name, value] of matched) headers.set(name, value);
			c.res = new Response(c.res.body, {
				headers,
				status: c.res.status,
				statusText: c.res.statusText
			});
		},
		applyFallback: (c, rules) => fallbackHandled.has(c.req.raw) ? Promise.resolve(void 0) : applyRules(c, rules, true),
		markNoMatch
	};
}
function redirectLocation(request, location, status) {
	const url = new URL(request.url);
	const search = url.search;
	if (!hasActionKey(request)) return mergeQueryIntoLocation(location, search);
	if (status === 303 || (status === void 0 || status === 301 || status === 302) && request.method === "POST") return mergeQueryIntoLocation(location, searchWithoutActionKey(search));
	const hash = location.indexOf("#");
	const destinationQuery = location.indexOf("?");
	if (destinationQuery === -1 || hash !== -1 && hash < destinationQuery) return mergeQueryIntoLocation(location, search);
	const merged = mergeQueryIntoLocation(location, searchWithoutActionKey(search));
	if (actionKeySegment(location.slice(destinationQuery, hash === -1 ? location.length : hash)) && new URL(location, url).pathname === url.pathname) return merged;
	const mergedHash = merged.indexOf("#");
	const base = mergedHash === -1 ? merged : merged.slice(0, mergedHash);
	const fragment = mergedHash === -1 ? "" : merged.slice(mergedHash);
	const q = base.indexOf("?");
	const segments = q === -1 ? [] : base.slice(q + 1).split("&");
	const key = actionKeySegment(search);
	const name = queryKey(key);
	const hasName = (segment) => segment !== "" && queryKey(segment) === name;
	const own = location.slice(destinationQuery + 1, hash === -1 ? location.length : hash).split("&").some(hasName) ? segments.findIndex(hasName) : -1;
	const first = own === -1 ? key : segments.splice(own, 1)[0];
	const rest = segments.join("&");
	return base.slice(0, q === -1 ? base.length : q) + "?" + first + (rest ? "&" + rest : "") + fragment;
}
function queryKey(segment) {
	return new URLSearchParams(segment).keys().next().value;
}
/** A rewrite that keeps the query keeps the action key in it too. */
function keepActionKey(from, to, destinationSearch) {
	if (!destinationSearch && hasActionKey(from)) markActionKey(to);
}
function markNoMatch(request, response) {
	const url = new URL(request.url);
	if (response.status !== 404 || request.method !== "GET" && request.method !== "HEAD" || url.pathname === "/api" || url.pathname.startsWith("/api/") || /\/[^/]+\.[^/]+$/.test(url.pathname)) return response;
	const headers = new Headers(response.headers);
	headers.set("X-Void-No-Match", "1");
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers
	});
}
function createHttpRouteHandler(load, method) {
	return markRouteHandler(async (c) => convertReturnValue(await (await load())[method](c)));
}
function createModuleLoader(load, cache = true) {
	let module;
	return async () => {
		if (!cache) return load();
		if (!module) module = await load();
		return module;
	};
}
// node_modules/void/dist/r2-conditions-BqkQNt2n.mjs
/** URI-encoded JSON object metadata that the binding handler sends with a streamed `/r2/get` body. */
var R2_OBJECT_HEADER = "x-void-r2-object";
var HTTP_METADATA_FIELDS = /* @__PURE__ */ new Set([
	"contentType",
	"contentLanguage",
	"contentDisposition",
	"contentEncoding",
	"cacheControl"
]);
function parseHeaderEntries(value, message) {
	if (!value.every((pair) => Array.isArray(pair) && pair.length === 2 && pair.every((item) => typeof item === "string"))) throw new Error(message);
	return new Headers(value);
}
function parseR2Conditional(value) {
	if (Array.isArray(value)) return parseHeaderEntries(value, "Invalid R2 conditional headers");
	if (!value || typeof value !== "object") throw new Error("Invalid R2 conditional options");
	const result = {};
	for (const [key, entry] of Object.entries(value)) if (key === "etagMatches" || key === "etagDoesNotMatch") {
		if (typeof entry !== "string") throw new Error(`Invalid R2 condition: ${key}`);
		result[key] = entry;
	} else if (key === "uploadedBefore" || key === "uploadedAfter") {
		if (typeof entry !== "string" || !Number.isFinite(Date.parse(entry))) throw new Error(`Invalid R2 condition: ${key}`);
		result[key] = new Date(entry);
	} else if (key === "secondsGranularity") {
		if (typeof entry !== "boolean") throw new Error(`Invalid R2 condition: ${key}`);
		result[key] = entry;
	} else throw new Error(`Unsupported R2 condition: ${key}`);
	return result;
}
/** Like native R2, unknown metadata fields are ignored. */
function parseR2HttpMetadata(value) {
	if (Array.isArray(value)) return parseHeaderEntries(value, "Invalid R2 HTTP metadata headers");
	if (!value || typeof value !== "object") throw new Error("Invalid R2 HTTP metadata");
	const result = {};
	for (const [key, entry] of Object.entries(value)) if (key === "cacheExpiry") {
		if (typeof entry !== "string" || !Number.isFinite(Date.parse(entry))) throw new Error(`Invalid R2 HTTP metadata: ${key}`);
		result[key] = new Date(entry);
	} else if (HTTP_METADATA_FIELDS.has(key)) {
		if (typeof entry !== "string") throw new Error(`Invalid R2 HTTP metadata: ${key}`);
		result[key] = entry;
	}
	return result;
}
// node_modules/void/dist/runtime/remote/binding-handler.mjs
/** Parse the body, answer 400 when `invalid` names a problem, and 404 for an unknown binding. */
async function readBindingRequest(c, env, invalid) {
	const body = await c.req.json();
	const error = invalid(body);
	if (error) return c.json({ error }, 400);
	const binding = env[body.binding];
	if (!binding) return c.json({ error: `unknown binding "${body.binding}"` }, 404);
	return {
		body,
		binding
	};
}
function requireBinding(body) {
	return body.binding ? void 0 : "binding required";
}
function requireKey(body) {
	return body.binding && body.key ? void 0 : "binding and key required";
}
/** Object fields that ProxyR2Bucket reads. `contentType` serves older clients. */
function r2ObjectJson(obj) {
	return {
		key: obj.key,
		size: obj.size,
		etag: obj.etag,
		version: obj.version,
		lastModified: obj.uploaded.toISOString(),
		contentType: obj.httpMetadata?.contentType ?? "application/octet-stream",
		httpMetadata: obj.httpMetadata,
		customMetadata: obj.customMetadata
	};
}
function r2DeleteKeys(body) {
	return body.keys ? body.keys : body.key ? [body.key] : [];
}
/**
* Creates a Hono app that handles `/__void/*` routes for native binding access.
* Deployed user workers expose this so the proxy can dispatch D1/KV/R2 operations
* via Workers for Platforms instead of the Cloudflare REST API (~1-5ms vs ~50-200ms).
*
* Authenticated via `x-void-internal` header against `env.__VOID_PROXY_TOKEN`.
* Response formats match the proxy's REST API responses, so ProxyClient
* handles both paths.
*/
function createBindingHandler(env) {
	const app = new Hono();
	app.use("*", async (c, next) => {
		const token = c.req.header("x-void-internal");
		const expected = env.__VOID_PROXY_TOKEN;
		if (!token || !expected || token !== expected) return c.json({ error: "unauthorized" }, 403);
		await next();
	});
	app.post("/d1/query", async (c) => {
		const request = await readBindingRequest(c, env, (body) => body.binding && body.sql ? void 0 : "binding and sql required");
		if (request instanceof Response) return request;
		const { body, binding: db } = request;
		const stmt = db.prepare(body.sql).bind(...body.params ?? []);
		switch (body.method) {
			case "first": {
				const row = await stmt.first();
				return c.json(row);
			}
			case "raw": {
				const raw = await stmt.raw({ columnNames: true });
				const columns = raw.length > 0 ? raw[0] : [];
				const results = raw.slice(1);
				return c.json({
					columns,
					results,
					meta: {}
				});
			}
			case "run": {
				const result = await stmt.run();
				return c.json({
					success: true,
					meta: result.meta
				});
			}
			default: {
				const result = await stmt.all();
				return c.json({
					results: result.results,
					success: true,
					meta: result.meta
				});
			}
		}
	});
	app.post("/d1/batch", async (c) => {
		const request = await readBindingRequest(c, env, (body) => body.binding && Array.isArray(body.statements) ? void 0 : "binding and statements required");
		if (request instanceof Response) return request;
		const { body, binding: db } = request;
		const stmts = body.statements.map((s) => db.prepare(s.sql).bind(...s.params ?? []));
		const results = await db.batch(stmts);
		return c.json(results.map((r) => ({
			results: r.results,
			success: true,
			meta: r.meta
		})));
	});
	app.post("/kv/get", async (c) => {
		const request = await readBindingRequest(c, env, requireKey);
		if (request instanceof Response) return request;
		const { body, binding: kv } = request;
		const type = body.type ?? "text";
		if (type === "json") {
			const val = await kv.get(body.key, "json");
			return c.json(val);
		}
		if (type === "arrayBuffer") {
			const val = await kv.get(body.key, "arrayBuffer");
			if (val === null) return c.json(null);
			return new Response(val, { headers: { "content-type": "application/octet-stream" } });
		}
		if (type === "stream") {
			const val = await kv.get(body.key, "stream");
			if (val === null) return c.json(null);
			return new Response(val, { headers: { "content-type": "application/octet-stream" } });
		}
		return c.json(await kv.get(body.key, "text"));
	});
	app.post("/kv/put", async (c) => {
		const request = await readBindingRequest(c, env, requireKey);
		if (request instanceof Response) return request;
		const { body, binding: kv } = request;
		const opts = {};
		if (body.expiration) opts.expiration = body.expiration;
		if (body.expiration_ttl) opts.expirationTtl = body.expiration_ttl;
		let value;
		if (body.base64 && typeof body.value === "string") value = base64ToBytes(body.value).buffer;
		else value = typeof body.value === "string" ? body.value : JSON.stringify(body.value);
		await kv.put(body.key, value, opts);
		return c.json({ success: true });
	});
	app.post("/kv/delete", async (c) => {
		const request = await readBindingRequest(c, env, requireKey);
		if (request instanceof Response) return request;
		await request.binding.delete(request.body.key);
		return c.json({ success: true });
	});
	app.post("/kv/list", async (c) => {
		const request = await readBindingRequest(c, env, requireBinding);
		if (request instanceof Response) return request;
		const { body, binding: kv } = request;
		const opts = {};
		if (body.prefix) opts.prefix = body.prefix;
		if (body.limit) opts.limit = body.limit;
		if (body.cursor) opts.cursor = body.cursor;
		const result = await kv.list(opts);
		return c.json({
			keys: result.keys,
			list_complete: result.list_complete,
			cursor: result.list_complete ? null : result.cursor
		});
	});
	app.post("/r2/get", async (c) => {
		const request = await readBindingRequest(c, env, requireKey);
		if (request instanceof Response) return request;
		const obj = await request.binding.get(request.body.key);
		if (!obj) return c.json(null);
		const headers = new Headers();
		headers.set("content-type", obj.httpMetadata?.contentType ?? "application/octet-stream");
		headers.set("content-length", String(obj.size));
		if (obj.httpEtag) headers.set("etag", obj.httpEtag);
		headers.set(R2_OBJECT_HEADER, encodeURIComponent(JSON.stringify(r2ObjectJson(obj))));
		return new Response(obj.body, { headers });
	});
	app.on("POST", ["/r2/put", "/r2/put-conditional"], async (c) => {
		const request = await readBindingRequest(c, env, requireKey);
		if (request instanceof Response) return request;
		const { body, binding: bucket } = request;
		const data = body.base64 ? base64ToBytes(body.base64) : new TextEncoder().encode(body.value ?? "");
		let httpMetadata;
		let onlyIf;
		try {
			httpMetadata = body.httpMetadata === void 0 ? { contentType: body.contentType ?? "application/octet-stream" } : parseR2HttpMetadata(body.httpMetadata);
			if (body.onlyIf !== void 0 || c.req.path.endsWith("/put-conditional")) onlyIf = parseR2Conditional(body.onlyIf);
		} catch (error) {
			return c.json({ error: String(error) }, 400);
		}
		const obj = await bucket.put(body.key, data, {
			httpMetadata,
			customMetadata: body.customMetadata,
			onlyIf
		});
		if (!obj) return c.json(null);
		return c.json(r2ObjectJson(obj));
	});
	app.post("/r2/delete", async (c) => {
		const request = await readBindingRequest(c, env, (body) => requireBinding(body) ?? (r2DeleteKeys(body).length === 0 ? "key or keys required" : void 0));
		if (request instanceof Response) return request;
		await request.binding.delete(r2DeleteKeys(request.body));
		return c.json({ success: true });
	});
	app.post("/r2/list", async (c) => {
		const request = await readBindingRequest(c, env, requireBinding);
		if (request instanceof Response) return request;
		const { body, binding: bucket } = request;
		const opts = {};
		if (body.prefix) opts.prefix = body.prefix;
		if (body.limit) opts.limit = body.limit;
		if (body.cursor) opts.cursor = body.cursor;
		if (body.delimiter) opts.delimiter = body.delimiter;
		if (body.startAfter) opts.startAfter = body.startAfter;
		if (Array.isArray(body.include)) opts.include = body.include;
		const result = await bucket.list(opts);
		return c.json({
			objects: result.objects.map(r2ObjectJson),
			truncated: result.truncated,
			cursor: result.truncated ? result.cursor : null,
			delimitedPrefixes: result.delimitedPrefixes
		});
	});
	app.post("/r2/head", async (c) => {
		const request = await readBindingRequest(c, env, requireKey);
		if (request instanceof Response) return request;
		const obj = await request.binding.head(request.body.key);
		if (!obj) return c.json(null);
		return c.json(r2ObjectJson(obj));
	});
	return app;
}
// virtual:void-routes
var app = new Hono();
var __routingRuntime = createRoutingRuntime(app, {
	"dev": false,
	"nodeTarget": false,
	"managedDispatch": false,
	"blockedAssetExtensions": [
		"png",
		"jpg",
		"jpeg",
		"gif",
		"webp",
		"avif",
		"svg",
		"ico",
		"css",
		"js",
		"mjs",
		"cjs",
		"woff",
		"woff2",
		"ttf",
		"otf",
		"eot",
		"mp4",
		"webm",
		"mp3",
		"wav",
		"pdf",
		"txt",
		"xml",
		"json",
		"wasm",
		"map"
	]
});
var requestContext = __routingRuntime.requestContext;
app.use(__routingRuntime.contextMiddleware);
app.use(__routingRuntime.requestMiddleware);
var _load_probe_ts = createModuleLoader(() => import("./assets/probe-B55uMerI.js"), true);
app.get("/probe", createHttpRouteHandler(_load_probe_ts, "GET"));
async function __voidCollectPrerenderPaths(request, env, ctx) {
	return withRuntimeEnv(env, async () => {
		return requestContext.run({
			request,
			executionCtx: ctx
		}, async () => {
			return [.../* @__PURE__ */ new Set([])];
		});
	});
}
async function scheduled() {}
async function __voidHandleInternalRoute() {
	return null;
}
var __voidBindingApp;
app.all("/__void/*", markRouteHandler(async (c) => {
	if (!__voidBindingApp) __voidBindingApp = createBindingHandler(__getRawEnv());
	const url = new URL(c.req.url);
	url.pathname = url.pathname.slice(7);
	return __voidBindingApp.fetch(new Request(url.toString(), c.req.raw));
}));
var __rawEnvStore = new AsyncLocalStorage();
function __withRawEnv(env, fn) {
	return __rawEnvStore.run(env, fn);
}
function __getRawEnv() {
	return __rawEnvStore.getStore();
}
// node_modules/void/dist/env-helpers-Dj_SIwPu.mjs
function build(parse, state) {
	return {
		"~standard": {
			version: 1,
			vendor: "void",
			validate(value) {
				if (value === void 0 || value === null || value === "") {
					if (state.defaultValue !== void 0) return { value: state.defaultValue };
					if (state.optional) return { value: void 0 };
					return { issues: [{ message: "Required" }] };
				}
				const result = parse(typeof value === "string" ? value : String(value));
				if (result.ok) return { value: result.value };
				return { issues: [{ message: result.message }] };
			}
		},
		optional() {
			return build(parse, {
				optional: true,
				defaultValue: state.defaultValue
			});
		},
		default(value) {
			return build(parse, {
				optional: false,
				defaultValue: value
			});
		}
	};
}
var empty = () => ({
	optional: false,
	defaultValue: void 0
});
/** Required string env value. */
function string() {
	return build((raw) => ({
		ok: true,
		value: raw
	}), empty());
}
// node_modules/void/dist/runtime/env-public.mjs
/**
* Secret redaction helpers for env-validation output.
*
* Values are redacted (replaced with `<redacted>`) whenever they flow into
* a user-visible string — `EnvValidationError` messages, CLI reports, the
* dev-server warning block. The key name is never masked (the user needs
* it to locate the offending entry).
*
* Server env values are production secrets by definition, so validator
* messages redact the raw input unconditionally.
*
* Users can opt out of the guard for local debugging via
* `VOID_ENV_UNMASK=1` in the environment; that path prints a one-shot
* notice on stderr so the loosened output is visibly attributed.
*
* This module is a leaf — no imports from non-leaf modules, safe to reach
* from both the runtime (worker bundle) and the CLI host.
*/
/** Sentinel emitted in place of a redacted value. */
var REDACTED = "<redacted>";
/** Environment variable that disables redaction when set to `1`. */
var UNMASK_ENV_VAR = "VOID_ENV_UNMASK";
/** Replace raw input in validator messages, regardless of its name or shape. */
function redactMessage(rawValue, message, options = {}) {
	if (options.unmask) return message;
	if (typeof rawValue !== "string" || rawValue.length === 0) return message;
	return message.split(rawValue).join(REDACTED);
}
var unmaskResolved = null;
/**
* Resolve the effective unmask flag, consulting `process.env` exactly once
* per process. On the first affirmative read, we print a one-shot notice to
* stderr so CI logs clearly show the guard is off.
*/
function isUnmaskActive() {
	if (unmaskResolved !== null) return unmaskResolved;
	try {
		unmaskResolved = globalThis.process?.env?.[UNMASK_ENV_VAR] === "1";
	} catch {
		unmaskResolved = false;
	}
	if (unmaskResolved) console.error(`[void/env] ${UNMASK_ENV_VAR}=1 is set — env validation errors will include raw values. Unset it before sharing logs.`);
	return unmaskResolved;
}
/**
* Public env API — `void/env`.
*
* Canonical usage:
*
* ```ts
* // env.ts at project root
* import { defineEnv, string, number, oneOf } from "void/env";
*
* export default defineEnv({
*   STRIPE_KEY: string(),
*   PORT: number().default(3000),
*   NODE_ENV: oneOf(["development", "production"]),
*   VITE_APP_TITLE: string(),
* });
*
* // anywhere else
* import { env } from "void/env";
* env.STRIPE_KEY;
* ```
*
* The `env` proxy reads from the underlying runtime env (Cloudflare worker
* bindings, Node `process.env`, Nuxt globals, etc.) via `getRuntimeEnv()`,
* and validates each key on first access using the registered schema.
*
* Bindings (`DB`, `KV`, `STORAGE`, `AI`, queue handlers) and other env keys
* not declared in the schema pass through unchanged.
*/
var ENV_REGISTRY_SYMBOL = Symbol.for("void.env.registry");
var registryGlobal = globalThis;
var registry = registryGlobal[ENV_REGISTRY_SYMBOL] ??= {
	schema: null,
	hasDefineEnvBeenCalled: false,
	bootValidation: null
};
var validatedCache = /* @__PURE__ */ new WeakMap();
var cacheList = [];
function getValidatedCache(rawEnv) {
	let cache = validatedCache.get(rawEnv);
	if (!cache) {
		cache = /* @__PURE__ */ new Map();
		validatedCache.set(rawEnv, cache);
		cacheList.push(cache);
	}
	return cache;
}
/** Vite embeds the same public build inputs into server and browser bundles. */
function getClientEnvValues() {
	return Object.fromEntries(Object.entries({
		"BASE_URL": "/",
		"DEV": false,
		"MODE": "production",
		"PROD": true,
		"SSR": true
	}).filter(([key]) => key.startsWith("VITE_")));
}
/**
* Register an env schema and return the typed `env` proxy.
*
* Calling `defineEnv` is the only required step — Void auto-discovers
* `env.ts` at project root, imports it, and uses the schema for runtime
* validation, type generation, and deploy-time secret checks.
*
* The return value is identical to the `env` export from `void/env`.
* Re-export it from your `env.ts` if you prefer the explicit
* `import { env } from "~/env"` pattern.
*/
function defineEnv(schema) {
	registry.schema = schema;
	registry.hasDefineEnvBeenCalled = true;
	for (const map of cacheList) map.clear();
	registry.bootValidation = null;
	return env;
}
/**
* Internal: validate the whole schema against the worker env once per isolate,
* from the generated worker entry. Catches remote-secret values the deploy CLI
* cannot see. Async validators are awaited here and their values cached, so
* later synchronous `env.X` reads can serve them.
*/
async function _validateEnvOnce(envValues) {
	if (registry.bootValidation) {
		if (!registry.bootValidation.ok) throw registry.bootValidation.error;
		return;
	}
	if (!registry.schema) {
		registry.bootValidation = { ok: true };
		return;
	}
	const values = {
		...envValues ?? {},
		...getClientEnvValues()
	};
	const report = await validateAllEnvWithValues(registry.schema, values);
	if (report.valid) {
		try {
			const cacheKey = getRawRuntimeEnv();
			const cache = getValidatedCache(cacheKey);
			for (const [key, value] of report.values) {
				if (isInternalBinding(key, cacheKey)) continue;
				if (!cache.has(key)) cache.set(key, value);
			}
		} catch {}
		registry.bootValidation = { ok: true };
		return;
	}
	const lines = ["Env validation failed at worker boot:"];
	for (const key of report.missing) lines.push(`  • ${key} is required but missing`);
	for (const { key, messages } of report.invalid) lines.push(`  • ${key}: ${messages.join("; ")}`);
	const error = new EnvValidationError("__init__", [{ message: lines.join("\n") }]);
	registry.bootValidation = {
		ok: false,
		error
	};
	throw error;
}
var EnvValidationError = class extends Error {
	key;
	issues;
	constructor(key, issues) {
		super(`Invalid env "${key}": ${issues.map((i) => i.message).join(", ")}`);
		this.name = "EnvValidationError";
		this.key = key;
		this.issues = issues;
	}
};
function readKey(key) {
	const rawEnv = getRawRuntimeEnv();
	if (isInternalBinding(key, rawEnv)) return;
	const filtered = getRuntimeEnv();
	const clientValues = getClientEnvValues();
	const rawValue = Object.hasOwn(clientValues, key) ? clientValues[key] : filtered[key];
	if (!registry.schema) return rawValue;
	const validator = registry.schema[key];
	if (!validator) return rawValue;
	const cache = getValidatedCache(rawEnv);
	if (cache.has(key)) return cache.get(key);
	const result = validator["~standard"].validate(rawValue);
	if (result instanceof Promise) throw new Error(`env: Async validator for '${key}' cannot be resolved synchronously. Proxy property access is synchronous, so async Standard Schema validators must be pre-resolved by calling \`_validateEnvOnce(env)\` at worker boot (Void splices this into the generated entry) or by awaiting \`validateAllEnv(env)\` before the first \`env.${key}\` read. Once pre-validated, the resolved value is cached and served synchronously here.`);
	if (result.issues) {
		const unmask = isUnmaskActive();
		throw new EnvValidationError(key, result.issues.map((i) => ({
			...i,
			message: redactMessage(rawValue, i.message, { unmask })
		})));
	}
	cache.set(key, result.value);
	return result.value;
}
/**
* Typed env proxy. Reads from the runtime env, validating declared keys
* on first access and passing through bindings / unknown keys unchanged.
* Async validators must be resolved first by `_validateEnvOnce()`.
*/
var env = new Proxy({}, {
	get(_target, key) {
		if (typeof key === "symbol") return;
		return readKey(key);
	},
	has(_target, key) {
		if (typeof key === "symbol") return false;
		return Object.hasOwn(getClientEnvValues(), key) || Reflect.has(getRuntimeEnv(), key);
	},
	ownKeys() {
		return [.../* @__PURE__ */ new Set([...Reflect.ownKeys(getRuntimeEnv()), ...Object.keys(getClientEnvValues())])];
	},
	getOwnPropertyDescriptor(_target, key) {
		if (typeof key === "symbol") return;
		return {
			enumerable: true,
			configurable: true,
			value: readKey(String(key))
		};
	}
});
/**
* Internal: shared core that validates a schema against values and also
* returns the resolved values (for cache seeding).
*/
async function validateAllEnvWithValues(schema, envValues) {
	const report = {
		valid: true,
		missing: [],
		invalid: [],
		values: /* @__PURE__ */ new Map()
	};
	const unmask = isUnmaskActive();
	for (const [key, validator] of Object.entries(schema)) {
		const raw = envValues[key];
		const resultMaybe = validator["~standard"].validate(raw);
		const result = resultMaybe instanceof Promise ? await resultMaybe : resultMaybe;
		if (result.issues) {
			report.valid = false;
			if (raw === void 0 || raw === null || raw === "") report.missing.push(key);
			else report.invalid.push({
				key,
				messages: result.issues.map((i) => redactMessage(raw, i.message, { unmask }))
			});
		} else report.values.set(key, result.value);
	}
	return report;
}
defineEnv({ PROBE: string().default("1") });
// .void/entry.ts
var __filterInternalBindings = (env) => filterInternalBindings(env, ["__VOID_", "__PROJECT_"], []);
var __voidFetch = createWorkerFetch({
	app,
	assets: createAssetFallback({
		"assetsDir": "assets",
		"serveSpaFallback": true,
		"notFound": "none"
	}),
	withRawEnv: __withRawEnv,
	withRuntimeEnv,
	filterBindings: __filterInternalBindings,
	internalRoute: __voidHandleInternalRoute,
	collectPrerenderPaths: __voidCollectPrerenderPaths,
	validateEnv: _validateEnvOnce
});
async function handleScheduled(controller, env, ctx) {
	await _validateEnvOnce(env);
	const userEnv = __filterInternalBindings(env);
	return withRuntimeEnv(env, () => /* @__PURE__ */ scheduled(controller, userEnv, ctx));
}
__setSandboxBindingName("SANDBOX");
var entry_default = class extends WorkerEntrypoint {
	async fetch(request) {
		return __voidFetch(request, this.env, this.ctx);
	}
	async scheduled(controller) {
		return handleScheduled(controller, this.env, this.ctx);
	}
};
// \0virtual:cloudflare/worker-entry
var worker_entry_default = entry_default ?? {};
export { VoidPlatformSandbox as SandboxV1, worker_entry_default as default };

//# sourceMappingURL=index.js.map