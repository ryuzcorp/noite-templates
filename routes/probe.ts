// LAB-ONLY sandbox probe (converge run): isolates which sandbox primitive
// hangs. Void's `run()` awaits stdout+stderr+exitCode together, so a 504
// says nothing about which leg stalls. Each step races one primitive
// against an 8 s timeout and always answers JSON.
import { defineHandler } from 'void';
import { getSandbox } from 'void/sandbox';

type Settled =
  | { settled: true; value: unknown }
  | { settled: false };

const race = async (
  p: Promise<unknown>,
  ms: number,
): Promise<Settled> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<Settled>((resolve) => {
    timer = setTimeout(() => resolve({ settled: false }), ms);
  });
  try {
    return await Promise.race([
      p.then((value) => ({ settled: true as const, value })),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
};

const textOf = async (stream: unknown, ms: number): Promise<Settled> => {
  if (!stream) {
    return { settled: true, value: null };
  }
  return race(new Response(stream as ReadableStream).text(), ms);
};

export const GET = defineHandler(async (c) => {
  const step = c.req.query('step') ?? 'all';
  const id = `sbprobe-${crypto.randomUUID()}`;
  const out: Record<string, unknown> = { step, id };
  const started = Date.now();
  let sb: Awaited<ReturnType<typeof getSandbox>> | undefined;
  try {
    sb = await getSandbox(id, { inactivityTimeoutMs: 30_000 });
    out.gotSandbox = true;
    if (step === 'running' || step === 'all') {
      out.runningBefore = await race(sb.running(), 8000);
    }
    if (step === 'files' || step === 'all') {
      await sb.files.mkdir('/workspace/p', { recursive: true });
      await sb.files.writeFile('/workspace/p/a.txt', 'hello-probe');
      out.stat = await race(sb.files.stat('/workspace/p/a.txt'), 8000);
    }
    if (step === 'read' || step === 'all') {
      const r = await race(sb.files.readFile('/workspace/p/a.txt'), 8000);
      if (r.settled) {
        const resp = r.value as Response;
        out.readFile = await race(resp.text(), 8000);
      } else {
        out.readFile = r;
      }
    }
    if (step === 'exit' || step === 'all') {
      const proc = await sb.exec(['node', '-e', 'process.exit(3)']);
      out.execHandle = {
        pid: proc.pid,
        isPty: proc.isPty,
        hasStdout: !!proc.stdout,
        hasStderr: !!proc.stderr,
      };
      out.exitCode = await race(proc.exitCode, 8000);
    }
    if (step === 'stdout' || step === 'all') {
      const proc = await sb.exec(['node', '-e', 'console.log("hi-stdout")']);
      out.stdoutText = await textOf(proc.stdout, 8000);
      out.stderrText = await textOf(proc.stderr, 8000);
      out.exitCode = await race(proc.exitCode, 8000);
    }
    if (step === 'output' || step === 'all') {
      const proc = await sb.exec(['node', '-e', 'console.log("hi-output")']);
      const r = await race(proc.output(), 8000);
      if (r.settled) {
        const v = r.value as {
          stdout: ArrayBuffer;
          stderr: ArrayBuffer;
          exitCode: number;
        };
        r.value = {
          stdout: new TextDecoder().decode(v.stdout),
          stderr: new TextDecoder().decode(v.stderr),
          exitCode: v.exitCode,
        };
      }
      out.output = r;
    }
    if (step === 'abort' || step === 'all') {
      const proc = await sb.exec(['node', '-e', 'setTimeout(() => {}, 60000)'], {
        signal: AbortSignal.timeout(3000),
      });
      out.abortExitCode = await race(proc.exitCode, 12000);
    }
  } catch (error) {
    out.error = error instanceof Error ? error.message : String(error);
  } finally {
    if (sb) {
      out.destroyed = await race(sb.destroy(), 8000);
    }
  }
  out.durationMs = Date.now() - started;
  return c.json(out);
});
