FROM node:20-alpine

# Install build deps for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package.json .
RUN npm install --production
COPY server.js .

RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 3001
CMD ["node", "server.js"]
