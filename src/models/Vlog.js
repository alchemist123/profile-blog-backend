import mongoose from 'mongoose';

const vlogSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    caption: { type: String, default: '', maxlength: 5000 },
    // Uploaded file (our /api/media URL), a direct video URL, or a YouTube link
    videoUrl: { type: String, required: true },
    source: { type: String, enum: ['upload', 'url', 'youtube'], default: 'upload' },
    posterUrl: { type: String, default: '' },
    // portrait = 9:16 reel, landscape = 16:9 video
    orientation: { type: String, enum: ['portrait', 'landscape'], default: 'landscape', index: true },
    durationSec: { type: Number, default: 0 },
    tags: [{ type: String }],
    status: { type: String, enum: ['draft', 'published'], default: 'published', index: true },
    likes: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
  },
  { timestamps: true }
);

vlogSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const Vlog = mongoose.model('Vlog', vlogSchema);
