import mongoose from 'mongoose';

const productivityQueueItemSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true },
    done: { type: Boolean, default: false },
  },
  { timestamps: true }
);

productivityQueueItemSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const ProductivityQueueItem = mongoose.model('ProductivityQueueItem', productivityQueueItemSchema);
