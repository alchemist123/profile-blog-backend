import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema(
  {
    name: { type: String, default: 'Anonymous' },
    text: { type: String, required: true },
  },
  { timestamps: true }
);

const blogPostSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    summary: { type: String, default: '' },
    content: { type: String, default: '' },
    coverImage: { type: String },
    tags: [{ type: String }],
    likes: { type: Number, default: 0 },
    readCount: { type: Number, default: 0 },
    comments: [commentSchema],
  },
  { timestamps: true }
);

blogPostSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const BlogPost = mongoose.model('BlogPost', blogPostSchema);
