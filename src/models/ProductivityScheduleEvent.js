import mongoose from 'mongoose';

const productivityScheduleEventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    date: { type: String, required: true, trim: true },
    time: { type: String, required: true, trim: true },
    type: { type: String, default: 'Meeting', trim: true },
  },
  { timestamps: true }
);

productivityScheduleEventSchema.index({ date: 1, createdAt: 1 });

productivityScheduleEventSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const ProductivityScheduleEvent = mongoose.model(
  'ProductivityScheduleEvent',
  productivityScheduleEventSchema
);
