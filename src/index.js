import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectDB } from './db.js';
import blogsRouter from './routes/blogs.js';
import productivityRouter from './routes/productivity.js';
import mediaRouter from './routes/media.js';
import vlogsRouter from './routes/vlogs.js';
import { authRouter, requireAdmin } from './auth.js';
import { checkStorage } from './storage.js';

const app = express();
const PORT = process.env.PORT || 4000;

// Real client IP behind a local/private reverse proxy (used by the login rate limiter).
app.set('trust proxy', 'loopback, linklocal, uniquelocal');
app.disable('x-powered-by');

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Prevent 304 Not Modified – always return fresh JSON for API
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  next();
});

app.use('/api/auth', authRouter);
app.use('/api/blogs', blogsRouter);
app.use('/api/media', mediaRouter);
app.use('/api/vlogs', vlogsRouter);
app.use('/api/v1/productivity', requireAdmin, productivityRouter);

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

async function start() {
  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 12) {
    console.warn('ADMIN_PASSWORD is missing or shorter than 12 chars: admin endpoints are disabled.');
  }
  await connectDB();
  await checkStorage();
  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
