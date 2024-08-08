# Use the official Node.js image as the base image
FROM node:18

# Set the working directory in the container
WORKDIR /usr/src/backend

# Copy the application code
COPY . .

# Install dependencies
RUN npm install

# Expose the port the app runs on
EXPOSE 5000


# Start application
CMD ["npm", "start"]
