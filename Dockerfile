# Use the official Node.js image as the base image
FROM node:18 AS build

# Set the working directory in the container
WORKDIR /app

# Copy the rest of the application code
COPY . .

# Install dependencies
RUN npm install

# EXPOSE 5000
EXPOSE 5000

CMD ["npm", "start"]
