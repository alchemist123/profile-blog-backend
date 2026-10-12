import { Router } from 'express';
import mongoose from 'mongoose';
import { Vlog } from '../models/Vlog.js';
import { isAdmin, requireAdmin } from '../auth.js';

const router = Router();

const EDITABLE = ['title', 'caption', 'videoUrl', 'source', 'posterUrl', 'orientation', 'durationSec', 'tags', 'status'];

function isHttpUrl(value) {
  try {
    const u = new URL(String(value));
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Pick and validate editable fields from a request body. Returns [fields, error]. */
function pickFields(body, { partial }) {
  const out = {};
  for (const k of EDITABLE) if (body[k] !== undefined) out[k] = body[k];
  if (!partial && !out.title?.trim()) return [null, 'title is required'];
  if (!partial && !out.videoUrl) return [null, 'videoUrl is required'];
  if (out.videoUrl !== undefined && !isHttpUrl(out.videoUrl)) return [null, 'videoUrl must be an http(s) URL'];
  if (out.posterUrl && !isHttpUrl(out.posterUrl)) return [null, 'posterUrl must be an http(s) URL'];
  if (out.tags !== undefined) out.tags = Array.isArray(out.tags) ? out.tags.map(String).filter(Boolean).slice(0, 12) : [];
  if (out.durationSec !== undefined) out.durationSec = Math.max(0, Number(out.durationSec) || 0);
  return [out, null];
}

const validId = (id) => mongoose.isValidObjectId(id);

/** GET /api/vlogs?orientation=portrait|landscape&limit=N - newest first */
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (!(req.query.includeDrafts === '1' && isAdmin(req))) filter.status = { $ne: 'draft' };
    if (['portrait', 'landscape'].includes(req.query.orientation)) filter.orientation = req.query.orientation;
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 100);
    const docs = await Vlog.find(filter).sort({ createdAt: -1 }).limit(limit);
    res.json(docs.map((d) => d.toJSON()));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/vlogs/:id */
router.get('/:id', async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const doc = await Vlog.findById(req.params.id);
    if (!doc || (doc.status === 'draft' && !isAdmin(req))) return res.status(404).json({ error: 'Not found' });
    res.json(doc.toJSON());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/vlogs/:id/like and /:id/view - public counters on published vlogs */
for (const [action, field] of [['like', 'likes'], ['view', 'views']]) {
  router.post(`/:id/${action}`, async (req, res) => {
    try {
      if (!validId(req.params.id)) return res.status(404).json({ error: 'Not found' });
      const doc = await Vlog.findOneAndUpdate(
        { _id: req.params.id, status: { $ne: 'draft' } },
        { $inc: { [field]: 1 } },
        { new: true }
      );
      if (!doc) return res.status(404).json({ error: 'Not found' });
      res.json({ [field]: doc[field] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

router.post('/', requireAdmin, async (req, res) => {
  try {
    const [fields, error] = pickFields(req.body || {}, { partial: false });
    if (error) return res.status(400).json({ error });
    const doc = await Vlog.create(fields);
    res.status(201).json(doc.toJSON());
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const [fields, error] = pickFields(req.body || {}, { partial: true });
    if (error) return res.status(400).json({ error });
    const doc = await Vlog.findByIdAndUpdate(req.params.id, fields, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc.toJSON());
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const doc = await Vlog.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
