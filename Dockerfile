# syntax=docker/dockerfile:1.7

FROM node:24-bookworm AS builder
WORKDIR /work
COPY app/package*.json ./
RUN npm ci
COPY app/ ./
RUN npm run build

FROM node:24-bookworm AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends libcap2-bin openssl && rm -rf /var/lib/apt/lists/*
RUN useradd -r -s /usr/sbin/nologin nodeuser
WORKDIR /app
COPY --from=builder /work/build ./build
COPY --from=builder /work/server.js ./server.js
COPY container-entrypoint.sh /usr/local/bin/kennemer-entrypoint
RUN mkdir -p /certs /data \
	&& chmod 755 /usr/local/bin/kennemer-entrypoint \
	&& chown -R nodeuser:nodeuser /certs /data
RUN chown -R nodeuser:nodeuser /app
RUN setcap 'cap_net_bind_service=+ep' /usr/local/bin/node
USER nodeuser
ENV HOST=0.0.0.0
ENV PORT=80
ENV HTTPS_KEY_PATH=/certs/server.key
ENV HTTPS_CERT_PATH=/certs/server.crt
ENV HTTPS_PORT=443
EXPOSE 80 443
ENTRYPOINT ["/usr/local/bin/kennemer-entrypoint"]
CMD ["node", "server.js"]
