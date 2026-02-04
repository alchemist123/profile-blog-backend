import mongoose from 'mongoose';

const maxRetries = 10;
const retryDelayMs = 2000;

export async function connectDB() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/profile';
  for (let i = 0; i < maxRetries; i++) {
    try {
      await mongoose.connect(uri);
      console.log('MongoDB connected');
      return;
    } catch (err) {
      console.warn(`MongoDB connect attempt ${i + 1}/${maxRetries} failed:`, err.message);
      if (i === maxRetries - 1) throw err;
      await new Promise((r) => setTimeout(r, retryDelayMs));
    }
  }
}
