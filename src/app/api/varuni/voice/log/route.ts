import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import ChatSession from '@/lib/models/ChatSession';

function getUserIdFromAuth(authHeader: string | null): string {
  try {
    const token = (authHeader || '').split(' ')[1] || '';
    const payload = JSON.parse(Buffer.from((token.split('.')[1]||''), 'base64').toString());
    return payload.userId || 'anonymous';
  } catch {
    return 'anonymous';
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const userId = getUserIdFromAuth(req.headers.get('authorization'));
    const { sessionId, role, text, title } = await req.json();
    if (!role || typeof text !== 'string') {
      return NextResponse.json({ success: false, error: 'Missing role or text' }, { status: 400 });
    }
    let session: any = null;
    if (sessionId) {
      session = await ChatSession.findOne({ _id: sessionId, userId });
    }
    if (!session) {
      session = await ChatSession.create({ userId, title: title || 'Voice Conversation', messages: [] });
    }
    session.messages.push({ role: role === 'assistant' ? 'assistant' : 'user', content: text });
    await session.save();
    return NextResponse.json({ success: true, sessionId: String(session._id) });
  } catch (e: any) {
    console.error('Voice log error', e);
    return NextResponse.json({ success: false, error: e?.message || 'Failed' }, { status: 500 });
  }
}
