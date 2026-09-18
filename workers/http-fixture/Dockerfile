FROM node:24-bookworm-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553
WORKDIR /opt/aios-http
COPY --chown=node:node worker.mjs ./worker.mjs
ENV HOME=/home/node
USER node
ENTRYPOINT ["node","--max-old-space-size=48","worker.mjs"]
