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

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const userId = getUserIdFromAuth(req.headers.get('authorization'));
    const sessions = await ChatSession.find({ userId }).select('_id title updatedAt tokenTotal').sort({ updatedAt: -1 }).limit(20);
    return NextResponse.json({ success: true, sessions: sessions.map(s => ({ id: String(s._id), title: s.title, updatedAt: s.updatedAt, tokenTotal: s.tokenTotal || 0 })) });
  } catch (e: any) {
    console.error('Varuni sessions list error', e);
    return NextResponse.json({ success: false, error: e?.message || 'Failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const userId = getUserIdFromAuth(req.headers.get('authorization'));
    const { sessionId } = await req.json();
    const session = await ChatSession.findOne({ _id: sessionId, userId });
    if (!session) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, session: { id: String(session._id), title: session.title, messages: session.messages, tokenTotal: session.tokenTotal || 0 } });
  } catch (e: any) {
    console.error('Varuni session fetch error', e);
    return NextResponse.json({ success: false, error: e?.message || 'Failed' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await connectDB();
    const userId = getUserIdFromAuth(req.headers.get('authorization'));
    const { sessionId } = await req.json().catch(() => ({}));
    if (!sessionId) return NextResponse.json({ success: false, error: 'Missing sessionId' }, { status: 400 });
    const res = await ChatSession.deleteOne({ _id: sessionId, userId });
    if (res.deletedCount === 0) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('Varuni session delete error', e);
    return NextResponse.json({ success: false, error: e?.message || 'Failed' }, { status: 500 });
  }
}

