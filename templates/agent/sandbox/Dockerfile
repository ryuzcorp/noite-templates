# Sandbox image for the agent template. Noite builds a Dockerfile only if it
# uses nothing but FROM/COPY/WORKDIR/ENV/LABEL/USER/EXPOSE/CMD/ENTRYPOINT/
# ARG/STOPSIGNAL/MAINTAINER: no RUN/ADD/ONBUILD/SHELL/HEALTHCHECK/VOLUME, no
# parser directives, no heredocs, no $ in FROM or COPY --from. Local COPY
# sources must sit inside this directory (the build context).
#
# The non-slim node image ships git. No sandbox-shim: the container object
# drives this image directly through ctx.container (engine exec API +
# bridge networking need no in-container agent), so nothing consumes the
# @cloudflare/sandbox shim and the Dockerfile pins no version
# (test/dockerfile.test.ts fails if a shim reference returns).
FROM node:26.12.1-trixie
# Container-mode agent server, written by `bun run build`
# (scripts/build-agent-server.ts) before the image builds.
COPY agent/server.mjs /opt/agent/server.mjs
# The container-mode agent server port (reached over the container
# loopback; also the macOS dev route, which needs the declaration).
EXPOSE 8787
WORKDIR /workspace
CMD ["sleep", "infinity"]
