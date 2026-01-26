import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IChatMessage {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  html?: string;
  createdAt?: Date;
}

export interface IChatSession extends Document {
  userId: string;
  title?: string;
  messages: IChatMessage[];
  tokenTotal?: number;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IChatMessage>({
  role: { type: String, required: true },
  content: { type: String, required: true },
  html: { type: String },
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const ChatSessionSchema = new Schema<IChatSession>({
  userId: { type: String, index: true },
  title: { type: String },
  messages: { type: [MessageSchema], default: [] },
  tokenTotal: { type: Number, default: 0 },
}, { timestamps: true });

export const ChatSession: Model<IChatSession> = mongoose.models.ChatSession || mongoose.model<IChatSession>('ChatSession', ChatSessionSchema);
export default ChatSession;

