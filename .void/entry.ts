import { VoidPlatformSandbox as __VoidSandbox, __setSandboxBindingName } from "/home/ryuz/Developer/noite-wt/converge-tmp/sbprobe/node_modules/void/dist/runtime/sandbox.mjs";
import { WorkerEntrypoint } from "cloudflare:workers";
import app, { scheduled, __voidCollectPrerenderPaths, __voidHandleInternalRoute, __withRawEnv } from 'virtual:void-routes';

import { withRuntimeEnv } from "/home/ryuz/Developer/noite-wt/converge-tmp/sbprobe/node_modules/void/dist/runtime/env.mjs";
import "/home/ryuz/Developer/noite-wt/converge-tmp/sbprobe/env.ts";
import { _validateEnvOnce } from "/home/ryuz/Developer/noite-wt/converge-tmp/sbprobe/node_modules/void/dist/runtime/env-public.mjs";
import { filterInternalBindings as __filterBindings, createWorkerFetch as __createWorkerFetch } from "/home/ryuz/Developer/noite-wt/converge-tmp/sbprobe/node_modules/void/dist/runtime/routing.mjs";
const __filterInternalBindings = (env) => __filterBindings(env, ["__VOID_","__PROJECT_"], []);
import { createAssetFallback as __createAssetFallback } from "/home/ryuz/Developer/noite-wt/converge-tmp/sbprobe/node_modules/void/dist/runtime/routing.mjs";
const serveWithAssets = __createAssetFallback({"assetsDir":"assets","serveSpaFallback":true,"notFound":"none"});

const __voidFetch = __createWorkerFetch({
    app, assets: serveWithAssets, withRawEnv: __withRawEnv, withRuntimeEnv,
    filterBindings: __filterInternalBindings,
    internalRoute: __voidHandleInternalRoute,
    collectPrerenderPaths: __voidCollectPrerenderPaths, validateEnv: _validateEnvOnce
  });
async function handleScheduled(controller, env, ctx) {
  await _validateEnvOnce(env);
  const userEnv = __filterInternalBindings(env);
  return withRuntimeEnv(env, () => scheduled(controller, userEnv, ctx));
}




export { __VoidSandbox as SandboxV1 };
__setSandboxBindingName("SANDBOX");


export default class extends WorkerEntrypoint {
  async fetch(request) { return __voidFetch(request, this.env, this.ctx); }
  async scheduled(controller) { return handleScheduled(controller, this.env, this.ctx); }
}