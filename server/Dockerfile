FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
ENV PORT=8884
EXPOSE 8884
CMD ["node", "server.js"]
