import { Router } from 'express';
import { BlogPost } from '../models/BlogPost.js';
import { ContentBlock } from '../models/ContentBlock.js';

const router = Router();

/** GET /api/blogs - list blogs, optional ?search= & ?tag=, newest first */
router.get('/', async (req, res) => {
  try {
    const { search, tag } = req.query;
    const filter = {};
    if (search && String(search).trim()) {
      const term = String(search).trim();
      filter.$or = [
        { title: new RegExp(term, 'i') },
        { summary: new RegExp(term, 'i') },
      ];
    }
    if (tag && String(tag).trim()) {
      filter.tags = { $in: [String(tag).trim()] };
    }
    const blogs = await BlogPost.find(filter).sort({ createdAt: -1 }).lean();
    const withId = blogs.map((b) => ({
      ...b,
      id: b._id.toString(),
      _id: undefined,
    }));
    res.json(withId);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/blogs/tags - list all distinct tags */
router.get('/tags', async (req, res) => {
  try {
    const tags = await BlogPost.distinct('tags');
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
    const { title, summary, content, coverImage, tags, blocks } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });
    const hasBlocks = Array.isArray(blocks) && blocks.length > 0;
    if (!hasBlocks && (content == null || content === '')) {
      return res.status(400).json({ error: 'content or blocks are required' });
    }
    const doc = await BlogPost.create({
      title,
      summary: summary ?? '',
      content: hasBlocks ? '' : (content ?? ''),
      coverImage: coverImage ?? undefined,
      tags: Array.isArray(tags) ? tags : [],
    });
    if (hasBlocks) {
      await ContentBlock.deleteMany({ blogId: doc._id });
      await ContentBlock.insertMany(
        blocks.map((b, i) => ({
          blogId: doc._id,
          index: i,
          type: b.type === 'html' ? 'html' : 'richtext',
          content: typeof b.content === 'string' ? b.content : '',
        }))
      );
    }
    const out = doc.toJSON();
    out.blocks = hasBlocks ? blocks : undefined;
    res.status(201).json(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** PUT /api/blogs/:id - update blog (optional blocks replace existing) */
router.put('/:id', async (req, res) => {
  try {
    const { title, summary, content, coverImage, tags, blocks } = req.body;
    const updates = {};
    if (title != null) updates.title = title;
    if (summary != null) updates.summary = summary;
    if (coverImage != null) updates.coverImage = coverImage;
    if (tags != null) updates.tags = Array.isArray(tags) ? tags : [];
    const hasBlocks = Array.isArray(blocks) && blocks.length > 0;
    if (hasBlocks) updates.content = '';
    else if (content != null) updates.content = content;

    const doc = await BlogPost.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!doc) return res.status(404).json({ error: 'Not found' });

    if (hasBlocks) {
      await ContentBlock.deleteMany({ blogId: doc._id });
      await ContentBlock.insertMany(
        blocks.map((b, i) => ({
          blogId: doc._id,
          index: i,
          type: b.type === 'html' ? 'html' : 'richtext',
          content: typeof b.content === 'string' ? b.content : '',
        }))
      );
    }
    const out = doc.toJSON();
    if (hasBlocks) {
      const blks = await ContentBlock.find({ blogId: doc._id }).sort({ index: 1 }).lean();
      out.blocks = blks.map((b) => ({ type: b.type, content: b.content }));
    }
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
