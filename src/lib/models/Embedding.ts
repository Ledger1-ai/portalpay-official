import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IEmbedding extends Document {
	namespace: string; // e.g., inventory,item, vendor, recipe, order, team, etc.
	entityId: string; // Graph entity _id
	entityType: string; // Model name
	text: string; // Indexed text
	embedding: number[]; // Vector
	metadata?: Record<string, any>;
	createdAt: Date;
	updatedAt: Date;
}

const EmbeddingSchema = new Schema<IEmbedding>({
	namespace: { type: String, index: true },
	entityId: { type: String, index: true },
	entityType: { type: String, index: true },
	text: { type: String, required: true },
	embedding: { type: [Number], index: '2dsphere' as any },
	metadata: { type: Schema.Types.Mixed },
}, { timestamps: true });

EmbeddingSchema.index({ namespace: 1, entityType: 1, entityId: 1 });

export const Embedding: Model<IEmbedding> = mongoose.models.Embedding || mongoose.model<IEmbedding>('Embedding', EmbeddingSchema);
export default Embedding;

