FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
# Install server dependencies before copying source for better layer caching.
RUN npm install

COPY . .

EXPOSE 4000

# Bootstrap demo data if needed, then build and launch the API.
CMD ["npm", "run", "docker:start"]
