# Agent sandbox image: node 24 on trixie-slim plus the control server from
# the 0.12 line of the Sandbox SDK image. The tag after the colon MUST match
# the installed @cloudflare/sandbox version (0.12.9): the SDK checks version
# compatibility on startup, and mismatched versions break the control plane.
#
# The 0.12 server is the standalone binary at /container-server/sandbox
# (ENTRYPOINT, serves the control API on port 3000). The /usr/local/bin
# sandbox-shim path belongs to the 1.x images and does not exist here.
ARG SANDBOX_TOOLS_IMAGE=docker.io/cloudflare/sandbox:0.12.9
FROM ${SANDBOX_TOOLS_IMAGE} AS donor

FROM node:24-trixie-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    procps \
    curl \
    && rm -rf /var/lib/apt/lists/*

# The control server plus the bundled JS executors it serves (code
# interpreter, node executor). Copy the whole directory so ENTRYPOINT keeps
# working and the executors stay beside the binary.
COPY --from=donor /container-server /container-server

RUN mkdir -p /workspace

# The control server port. Required: on macOS the node reaches the container
# through a published port.
EXPOSE 3000

ENTRYPOINT ["/container-server/sandbox"]
