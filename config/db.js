const mongoose = require('mongoose');

let connectionPromise;

const connectDB = async () => {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (connectionPromise) return connectionPromise;
  try {
    const dbUrl = process.env.MONGO_URI || process.env.MONGO_PUBLIC_URL;
    connectionPromise = mongoose.connect(dbUrl, { serverSelectionTimeoutMS: 10000 });
    await connectionPromise;
    console.log('MongoDB connected');
    return mongoose.connection;
  } catch (error) {
    connectionPromise = undefined;
    console.error('MongoDB connection error:', error.message);
    throw error;
  }
};

module.exports = connectDB;
