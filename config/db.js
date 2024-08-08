const mongoose = require('mongoose');
require('dotenv').config();

let dbUrl = process.env?.MONGO_URI || process.env?.MONGO_PUBLIC_URL
console.log(`dbUrl: ${dbUrl}`);

const connectDB = async () => {
  try {
    await mongoose.connect(dbUrl);
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

module.exports = connectDB;