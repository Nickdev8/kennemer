# syntax=docker/dockerfile:1.7

FROM node:20-bookworm AS builder
WORKDIR /work
COPY app/package*.json ./
RUN npm ci
COPY app/ ./
RUN npm run build

FROM node:20-bookworm AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends libcap2-bin && rm -rf /var/lib/apt/lists/*
RUN useradd -r -s /usr/sbin/nologin nodeuser
WORKDIR /app
COPY --from=builder /work/build ./build
COPY --from=builder /work/server.js ./server.js
RUN setcap 'cap_net_bind_service=+ep' /usr/local/bin/node
USER nodeuser
ENV HOST=0.0.0.0
ENV PORT=80
EXPOSE 80 443
CMD ["node", "server.js"]
