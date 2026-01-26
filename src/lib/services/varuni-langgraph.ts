import { VaruniAgent, AgentContext, AgentToolSet } from './varuni-agent';
import AgentCheckpoint from '@/lib/models/AgentCheckpoint';

export interface LangGraphRunOptions {
	prompt: string;
	context: AgentContext;
	activeToolset: string;
	history?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
	getToolsets: () => AgentToolSet[];
	sessionId?: string;
	onEvent?: (event: any) => void;
}

export interface LangGraphRuntimeOptions {
	decision?: 'APPROVE' | 'BACK';
	replayStep?: number;
	parallelReads?: boolean;
	hitl?: boolean;
	config?: Record<string, any>;
}

export async function runVaruniLangGraph(opts: LangGraphRunOptions & { runtime?: LangGraphRuntimeOptions }): Promise<{ text: string; usedTools?: any[]; events?: any[]; usage?: any; awaitingApproval?: boolean; replayed?: boolean; }> {
	// Attempt to load LangGraph dynamically. If unavailable, gracefully fallback to direct agent call.
	let lg: any = null;
	try { lg = await import('@langchain/langgraph'); } catch {}

	const sessionId = opts.sessionId || 'transient';
	const last = await AgentCheckpoint.findOne({ sessionId }).sort({ step: -1 }).lean();
	const step = (last?.step || 0) + 1;

	// Time travel / replay
	if (opts.runtime?.replayStep && Number.isFinite(opts.runtime.replayStep)) {
		const replay = await AgentCheckpoint.findOne({ sessionId, step: opts.runtime.replayStep }).lean();
		if (replay) {
			const st: any = replay.state || {};
			return { text: `Replayed step ${replay.step}`, usedTools: st.usedTools || [], events: st.events || [], replayed: true } as any;
		}
		return { text: `No checkpoint found for step ${opts.runtime.replayStep}`, usedTools: [], events: [], replayed: true } as any;
	}

	if (lg && typeof lg.StateGraph === 'function') {
		const graph: any = new lg.StateGraph();
		graph.addNode('plan', async (state: any) => ({ ...state, prompt: opts.prompt, activeToolset: opts.activeToolset }));
		graph.addNode('execute', async (state: any) => {
			const inner = new VaruniAgent();
			for (const ts of opts.getToolsets()) inner.registerToolSet(ts);
			const hitlEnabled = typeof opts.runtime?.hitl === 'boolean' ? opts.runtime?.hitl : (process.env.VARUNI_HITL_ENABLED === 'true');
			const decision = opts.runtime?.decision;
			if (hitlEnabled && decision === 'BACK') {
				return { ...state, result: { text: 'Operation cancelled by user.', events: [], usedTools: [] } };
			}
			const parallelReads = typeof opts.runtime?.parallelReads === 'boolean' ? opts.runtime?.parallelReads : (process.env.VARUNI_PARALLEL_READS !== 'false');
			const result = await inner.chat(state.prompt, opts.context, state.activeToolset, { history: opts.history, onEvent: opts.onEvent || (() => {}), requireApproval: hitlEnabled && decision !== 'APPROVE', parallelizeReads: parallelReads });
			if (hitlEnabled && result && typeof result.text === 'string' && /Approval required/i.test(result.text)) {
				return { ...state, result: { ...result, awaitingApproval: true } };
			}
			return { ...state, result };
		});
		graph.addNode('summarize', async (state: any) => {
			const r = state.result || {};
			return { ...state, text: r.text, usedTools: r.usedTools, events: r.events, usage: r.usage, awaitingApproval: !!r.awaitingApproval };
		});
		if (lg.START && lg.END) {
			graph.addEdge(lg.START, 'plan');
			graph.addEdge('plan', 'execute');
			graph.addEdge('execute', 'summarize');
			graph.addEdge('summarize', lg.END);
		}
		const app = typeof graph.compile === 'function' ? graph.compile() : null;
		const output = app && typeof app.invoke === 'function' ? await app.invoke({}) : await (async () => {
			const s1 = await (graph as any).nodes.get('plan').func({});
			const s2 = await (graph as any).nodes.get('execute').func(s1);
			return await (graph as any).nodes.get('summarize').func(s2);
		})();
		const result = output.result || { text: output.text, usedTools: output.usedTools, events: output.events, usage: output.usage, awaitingApproval: output.awaitingApproval };
		try { await AgentCheckpoint.create({ sessionId, step, activeToolset: opts.activeToolset, state: { events: result.events || [], usedTools: result.usedTools || [] } }); } catch {}
		return { text: result.text, usedTools: result.usedTools, events: result.events, usage: result.usage, awaitingApproval: !!result.awaitingApproval } as any;
	}

	// Fallback to existing agent orchestration
	const agent = new VaruniAgent();
	for (const ts of opts.getToolsets()) agent.registerToolSet(ts);
	const hitlEnabled = typeof opts.runtime?.hitl === 'boolean' ? opts.runtime?.hitl : (process.env.VARUNI_HITL_ENABLED === 'true');
	const decision = opts.runtime?.decision;
	const parallelReads = typeof opts.runtime?.parallelReads === 'boolean' ? opts.runtime?.parallelReads : (process.env.VARUNI_PARALLEL_READS !== 'false');
	const single = await agent.chat(opts.prompt, opts.context, opts.activeToolset, { history: opts.history, onEvent: opts.onEvent || (() => {}), requireApproval: hitlEnabled && decision !== 'APPROVE', parallelizeReads: parallelReads });
	try { await AgentCheckpoint.create({ sessionId, step, activeToolset: opts.activeToolset, state: { events: single.events || [], usedTools: single.usedTools || [] } }); } catch {}
	return { ...single, awaitingApproval: hitlEnabled && single && typeof single.text === 'string' && /Approval required/i.test(single.text) } as any;
}

export default runVaruniLangGraph;


