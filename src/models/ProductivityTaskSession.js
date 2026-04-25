import mongoose from 'mongoose';

const productivityTaskSessionSchema = new mongoose.Schema(
  {
    taskName: { type: String, required: true, trim: true },
    jiraId: { type: String, default: '', trim: true },
    projectKey: { type: String, default: '', trim: true },
    workType: { type: String, enum: ['office', 'personal'], required: true },
    startTime: { type: Date, required: true, default: Date.now },
    endTime: { type: Date },
    durationMs: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

productivityTaskSessionSchema.index({ endTime: 1, startTime: 1 });

productivityTaskSessionSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const ProductivityTaskSession = mongoose.model(
  'ProductivityTaskSession',
  productivityTaskSessionSchema
);
