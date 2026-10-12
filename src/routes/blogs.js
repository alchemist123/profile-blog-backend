import { Router } from 'express';
import { BlogPost } from '../models/BlogPost.js';
import { ContentBlock } from '../models/ContentBlock.js';

const router = Router();

const WORDS_PER_MINUTE = 220;

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Estimate minutes to read from HTML (rich text + raw HTML blocks). */
function computeReadingTime(html) {
  const text = String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ');
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

function normalizeBlocks(blocks) {
  return blocks.map((b) => ({
    type: b.type === 'html' ? 'html' : 'richtext',
    content: typeof b.content === 'string' ? b.content : '',
  }));
}

function normalizeStatus(status) {
  return status === 'draft' ? 'draft' : 'published';
}

/**
 * GET /api/blogs - list blogs (card data only, no body/comments), newest first.
 * Optional ?search= & ?tag=. Drafts are hidden unless ?includeDrafts=1.
 */
router.get('/', async (req, res) => {
  try {
    const { search, tag, includeDrafts } = req.query;
    const filter = {};
    if (includeDrafts !== '1') filter.status = { $ne: 'draft' };
    if (search && String(search).trim()) {
      const term = new RegExp(escapeRegex(String(search).trim()), 'i');
      filter.$or = [{ title: term }, { summary: term }, { tags: term }];
    }
    if (tag && String(tag).trim()) {
      filter.tags = { $in: [String(tag).trim()] };
    }
    const blogs = await BlogPost.aggregate([
      { $match: filter },
      { $sort: { createdAt: -1 } },
      {
        $project: {
          title: 1,
          summary: 1,
          coverImage: 1,
          tags: 1,
          likes: 1,
          readCount: 1,
          readingTime: 1,
          status: { $ifNull: ['$status', 'published'] },
          createdAt: 1,
          updatedAt: 1,
          commentCount: { $size: { $ifNull: ['$comments', []] } },
        },
      },
    ]);
    res.json(blogs.map(({ _id, ...b }) => ({ ...b, id: _id.toString() })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/blogs/tags - list all distinct tags */
router.get('/tags', async (req, res) => {
  try {
    const tags = await BlogPost.distinct('tags', { status: { $ne: 'draft' } });
    res.json(tags.filter(Boolean).sort());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/blogs/:id/like - increment like count (no auth) - must be before GET /:id */
router.post('/:id/like', async (req, res) => {
  try {
    const doc = await BlogPost.findByIdAndUpdate(
      req.params.id,
      { $inc: { likes: 1 } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json({ likes: doc.likes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/blogs/:id/read - increment read count */
router.post('/:id/read', async (req, res) => {
  try {
    const doc = await BlogPost.findByIdAndUpdate(
      req.params.id,
      { $inc: { readCount: 1 } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json({ readCount: doc.readCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/blogs/:id/comments - add comment (name optional -> Anonymous) */
router.post('/:id/comments', async (req, res) => {
  try {
    const { name, text } = req.body || {};
    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: 'Comment text is required' });
    }
    const comment = {
      name: name && String(name).trim() ? String(name).trim() : 'Anonymous',
      text: String(text).trim(),
      createdAt: new Date(),
    };
    const doc = await BlogPost.findByIdAndUpdate(
      req.params.id,
      { $push: { comments: comment } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: 'Not found' });
    const added = doc.comments[doc.comments.length - 1];
    res.status(201).json({
      id: added._id.toString(),
      name: added.name,
      text: added.text,
      createdAt: added.createdAt,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/blogs/:id - get one blog by id (includes blocks from ContentBlock collection) */
router.get('/:id', async (req, res) => {
  try {
    const doc = await BlogPost.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    const blog = doc.toJSON();
    const blockDocs = await ContentBlock.find({ blogId: doc._id }).sort({ index: 1 }).lean();
    blog.blocks = blockDocs.map((b) => ({
      type: String(b.type || 'richtext'),
      content: typeof b.content === 'string' ? b.content : '',
    }));
    res.json(blog);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/blogs - create blog (content or blocks required) */
router.post('/', async (req, res) => {
  try {
    const { title, summary, content, coverImage, tags, blocks, status } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });
    const isDraft = normalizeStatus(status) === 'draft';
    const hasBlocks = Array.isArray(blocks) && blocks.length > 0;
    if (!isDraft && !hasBlocks && (content == null || content === '')) {
      return res.status(400).json({ error: 'content or blocks are required' });
    }
    const cleanBlocks = hasBlocks ? normalizeBlocks(blocks) : [];
    const bodyHtml = hasBlocks ? cleanBlocks.map((b) => b.content).join(' ') : (content ?? '');
    const doc = await BlogPost.create({
      title,
      summary: summary ?? '',
      content: hasBlocks ? '' : (content ?? ''),
      coverImage: coverImage ?? undefined,
      tags: Array.isArray(tags) ? tags : [],
      status: normalizeStatus(status),
      readingTime: computeReadingTime(bodyHtml),
    });
    if (hasBlocks) {
      await ContentBlock.insertMany(
        cleanBlocks.map((b, i) => ({ blogId: doc._id, index: i, ...b }))
      );
    }
    const out = doc.toJSON();
    out.blocks = hasBlocks ? cleanBlocks : undefined;
    res.status(201).json(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** PUT /api/blogs/:id - update blog (optional blocks replace existing) */
router.put('/:id', async (req, res) => {
  try {
    const { title, summary, content, coverImage, tags, blocks, status } = req.body;
    const updates = {};
    if (status != null) updates.status = normalizeStatus(status);
    if (title != null) updates.title = title;
    if (summary != null) updates.summary = summary;
    if (coverImage != null) updates.coverImage = coverImage;
    if (tags != null) updates.tags = Array.isArray(tags) ? tags : [];
    const hasBlocks = Array.isArray(blocks) && blocks.length > 0;
    const cleanBlocks = hasBlocks ? normalizeBlocks(blocks) : [];
    if (hasBlocks) {
      updates.content = '';
      updates.readingTime = computeReadingTime(cleanBlocks.map((b) => b.content).join(' '));
    } else if (content != null) {
      updates.content = content;
      updates.readingTime = computeReadingTime(content);
    }

    const doc = await BlogPost.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!doc) return res.status(404).json({ error: 'Not found' });

    if (hasBlocks) {
      await ContentBlock.deleteMany({ blogId: doc._id });
      await ContentBlock.insertMany(
        cleanBlocks.map((b, i) => ({ blogId: doc._id, index: i, ...b }))
      );
    }
    const out = doc.toJSON();
    if (hasBlocks) out.blocks = cleanBlocks;
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /api/blogs/:id - delete blog and its content blocks */
router.delete('/:id', async (req, res) => {
  try {
    const doc = await BlogPost.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    await ContentBlock.deleteMany({ blogId: doc._id });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
