# Use the official Node.js image as the base image
FROM node:22-alpine

# Set the working directory in the container
WORKDIR /usr/src/backend

# Copy the application code
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

# Expose the port the app runs on
EXPOSE 5000


# Start application
CMD ["npm", "start"]
