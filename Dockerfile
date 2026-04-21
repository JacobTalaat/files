FROM node:18-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=optional

COPY . .
RUN npm run build:css
RUN npm prune --omit=dev

FROM node:18-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/public ./public
COPY --from=build /app/server.js ./server.js

EXPOSE 9000
CMD ["node","server.js"]

