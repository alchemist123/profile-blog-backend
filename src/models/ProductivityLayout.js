import mongoose from 'mongoose';

const productivityLayoutSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    order: [{ type: String }],
    sizes: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

productivityLayoutSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    delete ret.key;
    return ret;
  },
});

export const ProductivityLayout = mongoose.model('ProductivityLayout', productivityLayoutSchema);
