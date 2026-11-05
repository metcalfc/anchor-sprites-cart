# One image, two Fly apps: the invoices API (fly.toml) and Hangar Supply
# (fly.site.toml). The heal service runs on the Sprite, not from this image.
FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY site ./site
COPY integration ./integration
COPY tasks ./tasks
COPY api ./api
ENV PORT=8080
EXPOSE 8080
CMD ["node", "api/server.js"]
