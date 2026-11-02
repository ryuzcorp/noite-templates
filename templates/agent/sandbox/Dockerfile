# Sandbox image for the agent template. Noite builds a Dockerfile only if it
# uses nothing but FROM/COPY/WORKDIR/ENV/LABEL/USER/EXPOSE/CMD/ENTRYPOINT/
# ARG/STOPSIGNAL/MAINTAINER: no RUN/ADD/ONBUILD/SHELL/HEALTHCHECK/VOLUME, no
# parser directives, no heredocs, no $ in FROM or COPY --from. Local COPY
# sources must sit inside this directory (the build context).
#
# The non-slim node image ships git (Void's default slim image has none).
# The shim tag must equal the @cloudflare/sandbox version in bun.lock
# (test/dockerfile.test.ts fails when they drift).
FROM node:26.12.1-trixie
COPY --from=docker.io/cloudflare/sandbox:1.0.3 /usr/local/bin/sandbox-shim /usr/local/bin/sandbox-shim
# Container-mode agent server, written by `bun run build`
# (scripts/build-agent-server.ts) before the image builds.
COPY agent/server.mjs /opt/agent/server.mjs
WORKDIR /workspace
CMD ["sleep", "infinity"]
