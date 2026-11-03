import { n as defineHandler, o as getSandbox } from "./handler-xmzz0U38-DCBPwY1C.js";
// routes/probe.ts
var race = async (p, ms) => {
	let timer;
	const timeout = new Promise((resolve) => {
		timer = setTimeout(() => resolve({ settled: false }), ms);
	});
	try {
		return await Promise.race([p.then((value) => ({
			settled: true,
			value
		})), timeout]);
	} finally {
		clearTimeout(timer);
	}
};
var textOf = async (stream, ms) => {
	if (!stream) return {
		settled: true,
		value: null
	};
	return race(new Response(stream).text(), ms);
};
var GET = defineHandler(async (c) => {
	const step = c.req.query("step") ?? "all";
	const id = `sbprobe-${crypto.randomUUID()}`;
	const out = {
		step,
		id
	};
	const started = Date.now();
	let sb;
	try {
		sb = await getSandbox(id, { inactivityTimeoutMs: 3e4 });
		out.gotSandbox = true;
		if (step === "running" || step === "all") out.runningBefore = await race(sb.running(), 8e3);
		if (step === "files" || step === "all") {
			await sb.files.mkdir("/workspace/p", { recursive: true });
			await sb.files.writeFile("/workspace/p/a.txt", "hello-probe");
			out.stat = await race(sb.files.stat("/workspace/p/a.txt"), 8e3);
		}
		if (step === "read" || step === "all") {
			const r = await race(sb.files.readFile("/workspace/p/a.txt"), 8e3);
			if (r.settled) {
				const resp = r.value;
				out.readFile = await race(resp.text(), 8e3);
			} else out.readFile = r;
		}
		if (step === "exit" || step === "all") {
			const proc = await sb.exec([
				"node",
				"-e",
				"process.exit(3)"
			]);
			out.execHandle = {
				pid: proc.pid,
				isPty: proc.isPty,
				hasStdout: !!proc.stdout,
				hasStderr: !!proc.stderr
			};
			out.exitCode = await race(proc.exitCode, 8e3);
		}
		if (step === "stdout" || step === "all") {
			const proc = await sb.exec([
				"node",
				"-e",
				"console.log(\"hi-stdout\")"
			]);
			out.stdoutText = await textOf(proc.stdout, 8e3);
			out.stderrText = await textOf(proc.stderr, 8e3);
			out.exitCode = await race(proc.exitCode, 8e3);
		}
		if (step === "output" || step === "all") {
			const r = await race((await sb.exec([
				"node",
				"-e",
				"console.log(\"hi-output\")"
			])).output(), 8e3);
			if (r.settled) {
				const v = r.value;
				r.value = {
					stdout: new TextDecoder().decode(v.stdout),
					stderr: new TextDecoder().decode(v.stderr),
					exitCode: v.exitCode
				};
			}
			out.output = r;
		}
		if (step === "abort" || step === "all") out.abortExitCode = await race((await sb.exec([
			"node",
			"-e",
			"setTimeout(() => {}, 60000)"
		], { signal: AbortSignal.timeout(3e3) })).exitCode, 12e3);
	} catch (error) {
		out.error = error instanceof Error ? error.message : String(error);
	} finally {
		if (sb) out.destroyed = await race(sb.destroy(), 8e3);
	}
	out.durationMs = Date.now() - started;
	return c.json(out);
});
export { GET };

//# sourceMappingURL=probe-B55uMerI.js.map