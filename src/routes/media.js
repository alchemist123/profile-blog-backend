import crypto from 'node:crypto';
import { PassThrough } from 'node:stream';
import { Router } from 'express';
import busboy from 'busboy';
import { Media } from '../models/Media.js';
import { requireAdmin } from '../auth.js';
import { bucket, storage } from '../storage.js';

const router = Router();

const MB = 1024 * 1024;
const LIMITS = { image: 20 * MB, video: 1024 * MB };

// Only formats browsers render natively. No SVG/HTML: they could run script from this origin.
const ALLOWED = {
  'image/jpeg': ['image', '.jpg'],
  'image/png': ['image', '.png'],
  'image/webp': ['image', '.webp'],
  'image/gif': ['image', '.gif'],
  'image/avif': ['image', '.avif'],
  'video/mp4': ['video', '.mp4'],
  'video/webm': ['video', '.webm'],
  'video/quicktime': ['video', '.mov'],
};

function publicUrl(req, key) {
  return `${req.protocol}://${req.get('host')}/api/media/f/${key}`;
}

function serialize(req, doc) {
  const m = doc.toJSON();
  return { ...m, url: publicUrl(req, m.key) };
}

/** POST /api/media - multipart upload (field "file"), streamed straight into MinIO */
router.post('/', requireAdmin, (req, res) => {
  const s3 = storage();
  if (!s3) return res.status(503).json({ error: 'Media storage is not configured' });

  let bb;
  try {
    bb = busboy({ headers: req.headers, limits: { files: 1, fileSize: LIMITS.video } });
  } catch {
    return res.status(400).json({ error: 'Expected multipart/form-data' });
  }

  let handled = false;
  let sawFile = false;
  const fail = (status, error) => {
    if (handled) return;
    handled = true;
    req.unpipe(bb);
    req.resume();
    // Stop the client from streaming the rest of a rejected body.
    res.set('Connection', 'close').status(status).json({ error });
  };

  bb.on('file', (_field, file, info) => {
    sawFile = true;
    const type = ALLOWED[info.mimeType];
    if (!type) {
      file.resume();
      return fail(415, `Unsupported file type: ${info.mimeType}. Use JPG, PNG, WebP, GIF, AVIF, MP4, WebM or MOV.`);
    }
    const [kind, ext] = type;
    const now = new Date();
    const key = `${kind}s/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}${ext}`;

    // Count bytes and enforce the per-kind limit while streaming.
    let size = 0;
    let tooBig = false;
    const counter = new PassThrough();
    counter.on('error', () => {}); // the putObject promise reports the failure
    const tooLarge = () => {
      if (tooBig) return;
      tooBig = true;
      file.unpipe(counter);
      file.resume();
      counter.destroy(new Error('too large'));
      fail(413, `File too large (max ${LIMITS[kind] / MB} MB for ${kind}s)`);
    };
    file.on('data', (chunk) => {
      size += chunk.length;
      if (size > LIMITS[kind]) tooLarge();
    });
    file.on('limit', tooLarge);
    file.pipe(counter);

    s3.putObject(bucket(), key, counter, undefined, { 'Content-Type': info.mimeType })
      .then(async () => {
        if (tooBig) {
          await s3.removeObject(bucket(), key).catch(() => {});
          return;
        }
        const doc = await Media.create({ key, kind, mimeType: info.mimeType, size, originalName: String(info.filename || '').slice(0, 200) });
        if (!handled) {
          handled = true;
          res.status(201).json(serialize(req, doc));
        }
      })
      .catch(async (err) => {
        await s3.removeObject(bucket(), key).catch(() => {});
        fail(502, `Upload failed: ${err.message}`);
      });
  });

  bb.on('close', () => {
    if (!sawFile) fail(400, 'No file uploaded');
  });
  bb.on('error', (err) => fail(400, err.message));
  req.pipe(bb);
});

/** GET /api/media?kind=image|video - recent uploads for the media library */
router.get('/', requireAdmin, async (req, res) => {
  try {
    const filter = ['image', 'video'].includes(req.query.kind) ? { kind: req.query.kind } : {};
    const docs = await Media.find(filter).sort({ createdAt: -1 }).limit(60);
    res.json(docs.map((d) => serialize(req, d)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /api/media/:id */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const doc = await Media.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    await storage()?.removeObject(bucket(), doc.key).catch(() => {});
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/media/f/<key> - public file delivery with HTTP Range support (video seeking) */
router.get(/^\/f\/((?:images|videos)\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.[a-z0-9]{3,4})$/, async (req, res) => {
  const s3 = storage();
  if (!s3) return res.status(503).end();
  const key = req.params[0];
  try {
    const stat = await s3.statObject(bucket(), key);
    const total = stat.size;
    const type = stat.metaData?.['content-type'] || 'application/octet-stream';

    res.set({
      'Content-Type': type,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    res.removeHeader('Pragma');
    if (stat.etag) {
      res.set('ETag', `"${stat.etag}"`);
      if (req.get('if-none-match') === `"${stat.etag}"`) return res.status(304).end();
    }

    const range = /^bytes=(\d*)-(\d*)$/.exec(req.get('range') || '');
    let stream;
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(total - Number(range[2]), 0);
      const end = range[1] && range[2] ? Math.min(Number(range[2]), total - 1) : total - 1;
      if (start >= total || start > end) {
        res.set('Content-Range', `bytes */${total}`);
        return res.status(416).end();
      }
      res.status(206).set({ 'Content-Range': `bytes ${start}-${end}/${total}`, 'Content-Length': end - start + 1 });
      if (req.method === 'HEAD') return res.end();
      stream = await s3.getPartialObject(bucket(), key, start, end - start + 1);
    } else {
      res.set('Content-Length', total);
      if (req.method === 'HEAD') return res.end();
      stream = await s3.getObject(bucket(), key);
    }
    stream.on('error', () => res.destroy());
    req.on('close', () => stream.destroy());
    stream.pipe(res);
  } catch (err) {
    if (err.code === 'NotFound' || err.code === 'NoSuchKey') return res.status(404).end();
    res.status(502).end();
  }
});

export default router;
