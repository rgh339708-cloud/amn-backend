FROM node:18

# Create app directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application source code
COPY . .

# Expose the server port
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production
ENV DATABASE_URL=postgresql://neondb_owner:npg_PQW0dJnf6yjm@ep-billowing-mountain-atlczlqj-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require

# Start the application
CMD [ "node", "server.js" ]
