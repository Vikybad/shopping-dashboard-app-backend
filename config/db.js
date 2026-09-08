const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const dbUrl = process.env.MONGO_URI || process.env.MONGO_PUBLIC_URL;
    await mongoose.connect(dbUrl, { serverSelectionTimeoutMS: 10000 });
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    throw error;
  }
};

module.exports = connectDB;
