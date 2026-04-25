import { Router } from 'express';
import { ProductivityTaskSession } from '../models/ProductivityTaskSession.js';
import { ProductivityQueueItem } from '../models/ProductivityQueueItem.js';
import { ProductivityScheduleEvent } from '../models/ProductivityScheduleEvent.js';
import { ProductivityLayout } from '../models/ProductivityLayout.js';

const router = Router();

function toPeriodRange(period) {
  const now = new Date();
  const start = new Date(now);

  if (period === 'month') {
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    return { start, end: now };
  }

  if (period === 'week') {
    const day = start.getUTCDay();
    const diff = day === 0 ? 6 : day - 1;
    start.setUTCDate(start.getUTCDate() - diff);
    start.setUTCHours(0, 0, 0, 0);
    return { start, end: now };
  }

  start.setUTCHours(0, 0, 0, 0);
  return { start, end: now };
}

function defaultGoal(period) {
  if (period === 'week') return 70;
  if (period === 'month') return 300;
  return 14;
}

router.get('/tasks/active', async (_req, res) => {
  try {
    const active = await ProductivityTaskSession.findOne({ endTime: null }).sort({ startTime: -1 });
    if (!active) return res.status(204).send();
    return res.json(active.toJSON());
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/tasks/start', async (req, res) => {
  try {
    const { taskName, jiraId, projectKey, workType } = req.body || {};
    if (!taskName || !String(taskName).trim()) {
      return res.status(400).json({ error: 'taskName is required' });
    }
    if (!['office', 'personal'].includes(workType)) {
      return res.status(400).json({ error: 'workType must be office or personal' });
    }

    const existing = await ProductivityTaskSession.findOne({ endTime: null });
    if (existing) {
      return res.status(409).json({ error: 'An active task is already running', id: existing._id.toString() });
    }

    const created = await ProductivityTaskSession.create({
      taskName: String(taskName).trim(),
      jiraId: jiraId ? String(jiraId).trim() : '',
      projectKey: projectKey ? String(projectKey).trim() : '',
      workType,
      startTime: new Date(),
    });

    return res.status(201).json(created.toJSON());
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/tasks/:taskId/stop', async (req, res) => {
  try {
    const task = await ProductivityTaskSession.findOne({ _id: req.params.taskId, endTime: null });
    if (!task) return res.status(404).json({ error: 'Active task not found' });

    const endTime = new Date();
    const durationMs = Math.max(0, endTime.getTime() - task.startTime.getTime());
    task.endTime = endTime;
    task.durationMs = durationMs;
    await task.save();

    return res.json({
      id: task._id.toString(),
      durationMs,
      endTime: task.endTime,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const period = ['today', 'week', 'month'].includes(req.query.period) ? req.query.period : 'today';
    const { start, end } = toPeriodRange(period);

    const sessions = await ProductivityTaskSession.find({
      endTime: { $ne: null, $gte: start, $lte: end },
    }).lean();

    const tasksExecuted = sessions.length;
    const deepWorkMs = sessions
      .filter((s) => s.workType === 'office')
      .reduce((sum, s) => sum + (Number(s.durationMs) || 0), 0);
    const deepWorkHours = Number((deepWorkMs / (1000 * 60 * 60)).toFixed(2));
    const tasksGoal = defaultGoal(period);
    const efficiencyRatio = tasksGoal > 0 ? Math.min(100, Math.round((tasksExecuted / tasksGoal) * 100)) : 0;

    return res.json({
      tasksExecuted,
      tasksGoal,
      deepWorkHours,
      efficiencyRatio,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/queue', async (_req, res) => {
  try {
    const items = await ProductivityQueueItem.find().sort({ createdAt: 1 });
    return res.json(items.map((item) => item.toJSON()));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/queue', async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: 'text is required' });
    }
    const created = await ProductivityQueueItem.create({ text: String(text).trim() });
    return res.status(201).json(created.toJSON());
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch('/queue/:itemId', async (req, res) => {
  try {
    const { done } = req.body || {};
    if (typeof done !== 'boolean') {
      return res.status(400).json({ error: 'done must be boolean' });
    }
    const item = await ProductivityQueueItem.findByIdAndUpdate(
      req.params.itemId,
      { done },
      { new: true, runValidators: true }
    );
    if (!item) return res.status(404).json({ error: 'Queue item not found' });
    return res.json(item.toJSON());
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/schedule', async (req, res) => {
  try {
    const query = {};
    if (req.query.date) query.date = String(req.query.date);
    const events = await ProductivityScheduleEvent.find(query).sort({ createdAt: 1 });
    return res.json(events.map((event) => event.toJSON()));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/schedule', async (req, res) => {
  try {
    const { title, date, time, type } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'title is required' });
    if (!date || !String(date).trim()) return res.status(400).json({ error: 'date is required' });
    if (!time || !String(time).trim()) return res.status(400).json({ error: 'time is required' });

    const created = await ProductivityScheduleEvent.create({
      title: String(title).trim(),
      date: String(date).trim(),
      time: String(time).trim(),
      type: type ? String(type).trim() : 'Meeting',
    });
    return res.status(201).json(created.toJSON());
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/layout', async (_req, res) => {
  try {
    const layout = await ProductivityLayout.findOne({ key: 'default' });
    if (!layout) {
      return res.json({ order: [], sizes: {} });
    }
    const out = layout.toJSON();
    return res.json({ order: out.order || [], sizes: out.sizes || {} });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.put('/layout', async (req, res) => {
  try {
    const { order, sizes } = req.body || {};
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array' });
    if (!sizes || typeof sizes !== 'object' || Array.isArray(sizes)) {
      return res.status(400).json({ error: 'sizes must be an object' });
    }

    const updated = await ProductivityLayout.findOneAndUpdate(
      { key: 'default' },
      { $set: { order, sizes } },
      { new: true, upsert: true, runValidators: true }
    );
    const out = updated.toJSON();
    return res.json({ order: out.order || [], sizes: out.sizes || {} });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
