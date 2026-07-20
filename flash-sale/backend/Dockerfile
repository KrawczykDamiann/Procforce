FROM node:20-alpine

WORKDIR /app

# Install dependencies first to leverage Docker caching layers
COPY package*.json ./
RUN npm install

# Copy Prisma schema and generate the client before copying the rest of the code
COPY prisma ./prisma/
RUN npx prisma generate

# Copy the remaining source files
COPY . .

EXPOSE 3001

# Application startup will be handled dynamically via Docker Compose command to ensure proper sequencing
CMD ["npm", "run", "dev"]