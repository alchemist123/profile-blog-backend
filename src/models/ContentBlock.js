import mongoose from 'mongoose';

const contentBlockSchema = new mongoose.Schema(
  {
    blogId: { type: mongoose.Schema.Types.ObjectId, ref: 'BlogPost', required: true, index: true },
    index: { type: Number, required: true },
    type: { type: String, required: true, enum: ['richtext', 'html'] },
    content: { type: String, default: '' },
  },
  { _id: true }
);

contentBlockSchema.index({ blogId: 1, index: 1 });

export const ContentBlock = mongoose.model('ContentBlock', contentBlockSchema);
