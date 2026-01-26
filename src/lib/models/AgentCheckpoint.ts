import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAgentCheckpoint extends Document {
	sessionId: string;
	step: number;
	activeToolset: string;
	state: any;
	createdAt: Date;
	updatedAt: Date;
}

const AgentCheckpointSchema = new Schema<IAgentCheckpoint>({
	sessionId: { type: String, index: true, required: true },
	step: { type: Number, required: true },
	activeToolset: { type: String, default: 'main' },
	state: { type: Schema.Types.Mixed },
}, { timestamps: true });

AgentCheckpointSchema.index({ sessionId: 1, step: 1 }, { unique: true });

export const AgentCheckpoint: Model<IAgentCheckpoint> = mongoose.models.AgentCheckpoint || mongoose.model<IAgentCheckpoint>('AgentCheckpoint', AgentCheckpointSchema);
export default AgentCheckpoint;