FROM node:20-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package.json .
RUN npm install --production
COPY server.js .

RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 3002
CMD ["node", "server.js"]
