FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
# Install UI dependencies before copying source for better layer caching.
RUN npm install

COPY . .

EXPOSE 5173

# Vite listens on all interfaces so the app is reachable from the host browser.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
