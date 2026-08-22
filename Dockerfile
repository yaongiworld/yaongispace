# The app, for running locally in Docker.
#
# Development-mode on purpose: this exists so the app can be *seen* running
# next to its database, not to produce a deployment artefact. Vercel builds
# production from source and does not use this file.
#
# node_modules is installed inside the image rather than copied from the host.
# `sharp` ships platform-native binaries, so a macOS host's copy is unusable on
# a linux container — and mounting the source over it would hide the failure
# until the first photo import.
FROM node:22-bookworm-slim

WORKDIR /app

# Dependencies first, so editing source does not reinstall them.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 3000
# Bound to 0.0.0.0 — the container's localhost is not reachable from the host.
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0"]
