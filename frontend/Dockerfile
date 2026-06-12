FROM node:20-bullseye-slim

WORKDIR /app

# Install deps separately so the layer is cached
COPY package.json yarn.lock* ./
RUN yarn install --frozen-lockfile || yarn install

# Copy source
COPY . .

EXPOSE 3000

# CRA / CRACO dev server
CMD ["yarn", "start"]
