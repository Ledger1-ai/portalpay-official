import { useCallback, useEffect, useRef, useState } from "react";
import { buildServerAssistantPrompt } from "../agent/prompts/serverAssistantPrompt";
import { getLanguageCode } from "@/lib/azure-translator";
import { getLocaleFromLanguage } from "@/lib/i18n/config";

/**
 * Realtime voice agent hook with WebRTC negotiation to Azure Realtime.
 * - Requests an SDP answer via /api/voice/rtc/offer using a local RTC offer.
 * - Captures microphone, sends as audio to the agent; receives agent audio and analyzes agentLevel.
 * - Creates/handles a data channel; bridges tool_call messages to window events and returns tool_result back.
 * - Enforces max duration based on server policy (unauth 60s, auth daily cap) using auto-stop.
 */

export type StartOptions = {
  voice?: string; // e.g., "marin"
  instructions?: string;
};

export type VoiceAgentState = {
  isListening: boolean;
  isMuted: boolean;
  isStarting: boolean;
  toolsReady: boolean;
  micLevel: number;   // 0..1 normalized
  agentLevel: number; // 0..1 normalized
  maxDurationSec: number;
  error: string | null;
};

export type UseRealtimeVoiceAgent = {
  state: VoiceAgentState;
  startListening: (opts?: StartOptions) => Promise<void>;
  toggleMute: () => void;
  stop: () => void;
  sendText: (text: string) => void;
};

function rmsFromAnalyser(analyser: AnalyserNode): number {
  const bufLen = analyser.frequencyBinCount;
  const data = new Uint8Array(bufLen);
  analyser.getByteTimeDomainData(data);
  let sumSq = 0;
  for (let i = 0; i < bufLen; i++) {
    const v = (data[i] - 128) / 128;
    sumSq += v * v;
  }
  const rms = Math.sqrt(sumSq / bufLen);
  return Math.min(1, Math.max(0, rms * 1.5));
}

function getNormalizedSpectrum(analyser: AnalyserNode): number[] {
  // Returns normalized magnitude spectrum (0..1) using current FFT settings
  const bufLen = analyser.frequencyBinCount;
  const data = new Uint8Array(bufLen);
  analyser.getByteFrequencyData(data);
  const out: number[] = new Array(bufLen);
  for (let i = 0; i < bufLen; i++) {
    out[i] = Math.max(0, Math.min(1, data[i] / 255));
  }
  return out;
}

function stableStringify(obj: any): string {
  try {
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      const keys = Object.keys(obj).sort();
      const norm: any = {};
      for (const k of keys) { (norm as any)[k] = (obj as any)[k]; }
      return JSON.stringify(norm);
    }
    return JSON.stringify(obj);
  } catch { return String(obj); }
}

function buildLanguageTimeInjection(): { instruction: string; locale: string; language: string } {
  let language = "English (US)";
  let locale = "en";
  try {
    const savedLocale = localStorage.getItem("pp:locale") || "";
    const savedLanguage = localStorage.getItem("pp:language") || "";
    const lc = (savedLanguage && (getLanguageCode(savedLanguage) || getLocaleFromLanguage(savedLanguage))) || savedLocale || "en";
    const ln = savedLanguage || "English (US)";
    locale = String(lc || "en");
    language = String(ln || "English (US)");
  } catch { }
  let tz = "UTC";
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch { }
  const now = new Date();
  const hour = now.getHours();
  const timeStr = (() => {
    try {
      return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return `${hour}:${String(now.getMinutes()).padStart(2, "0")}`;
    }
  })();
  let bucket = "night";
  if (hour >= 5 && hour <= 11) bucket = "morning";
  else if (hour >= 12 && hour <= 16) bucket = "afternoon";
  else if (hour >= 17 && hour <= 21) bucket = "evening";
  else bucket = "night";
  const instruction =
    `Localization: Preferred language is ${language} (locale: ${locale}). ` +
    `Customer time zone: ${tz}. Local time: ${timeStr}. ` +
    `Greeting rule: greet the customer with an appropriate salutation for the time of day (${bucket}) and speak in the selected language (${language}). ` +
    `Keep the greeting short before proceeding.`;
  return { instruction, locale, language };
}

export function useServerAssistant(): UseRealtimeVoiceAgent {
  const [isListening, setIsListening] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [agentLevel, setAgentLevel] = useState(0);
  const [maxDurationSec, setMaxDurationSec] = useState(60);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [toolsReady, setToolsReady] = useState(false);

  // WebRTC and audio refs
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioElRef = useRef<HTMLAudioElement | null>(null);

  // WebAudio
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const agentAnalyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const isListeningRef = useRef<boolean>(false);
  const agentLastAudioAboveThreshAtRef = useRef<number>(0);

  // Timers
  const autoStopTimerRef = useRef<number | null>(null);

  // Usage tracking for daily cap commit
  const usageDocIdRef = useRef<string>("");
  const sessionStartMsRef = useRef<number | null>(null);
  const committedRef = useRef<boolean>(false);

  // Tool bridging
  const toolResultListenerRef = useRef<(evt: Event) => void | null>(null);
  const sessionInitSentRef = useRef<boolean>(false);
  const sessionIdRef = useRef<string>("");
  const bootstrapRequestIdRef = useRef<string>("");

  // Processing reminder timers per active tool call
  const activeToolTimersRef = useRef<Map<string, number>>(new Map());
  const lastReminderSentAtRef = useRef<Map<string, number>>(new Map());
  const instructionsRef = useRef<string>("");
  const tokenRef = useRef<string>("");
  const tokenExpiryMsRef = useRef<number>(0);
  const sessionFetchLockRef = useRef<boolean>(false);
  const processedCallIdsRef = useRef<Set<string>>(new Set());
  // Track call_ids for which we've already submitted outputs to the model
  const submittedCallIdsRef = useRef<Set<string>>(new Set());
  const requiredActionResponseIdByCallRef = useRef<Map<string, string>>(new Map());
  const pendingToolOutputsRef = useRef<Map<string, { expected: Set<string>; outputs: Map<string, any> }>>(new Map());
  const pendingTextByResponseRef = useRef<Map<string, string>>(new Map());
  const pendingTranscriptByResponseRef = useRef<Map<string, string>>(new Map());
  const recentToolSignaturesRef = useRef<Map<string, number>>(new Map());
  const toolNameByCallIdRef = useRef<Map<string, string>>(new Map());
  const toolArgsByCallIdRef = useRef<Map<string, any>>(new Map());
  // Gate assistant replies: track responses awaiting tool outputs and cancellations already sent
  const pendingResponseIdsRef = useRef<Set<string>>(new Set());
  const canceledResponseIdsRef = useRef<Set<string>>(new Set());
  // Responses we intentionally created for continuation; never cancel these
  const safeResponseIdsRef = useRef<Set<string>>(new Set());
  const expectContinuationUntilRef = useRef<number>(0);

  // Send a short reminder to reassure the customer while a tool call is processing.
  const sendProcessingReminder = useCallback((_chan: RTCDataChannel) => {
    // No-op: avoid premature assistant messages during tool execution.
  }, []);

  const cleanupRaf = () => {
    if (rafRef.current) {
      try { cancelAnimationFrame(rafRef.current); } catch { }
      rafRef.current = null;
    }
  };

  const stopAudioGraph = () => {
    try {
      const s = micStreamRef.current;
      if (s) for (const t of s.getTracks()) t.stop();
    } catch { }
    micStreamRef.current = null;

    try {
      const rs = remoteStreamRef.current;
      if (rs) for (const t of rs.getTracks()) t.stop();
    } catch { }
    remoteStreamRef.current = null;

    try { audioCtxRef.current?.close(); } catch { }
    audioCtxRef.current = null;
    micAnalyserRef.current = null;
    agentAnalyserRef.current = null;

    const el = remoteAudioElRef.current;
    if (el) {
      try { el.pause(); el.srcObject = null; } catch { }
    }

    cleanupRaf();
  };

  const stopPeerConnection = () => {
    const pc = pcRef.current;
    if (pc) {
      try {
        pc.ontrack = null;
        pc.ondatachannel = null;
        pc.close();
      } catch { }
    }
    pcRef.current = null;

    const dc = dataChannelRef.current;
    if (dc) { try { dc.close(); } catch { } }
    dataChannelRef.current = null;

    // Remove tool result listener
    const listener = toolResultListenerRef.current;
    if (listener) {
      try { window.removeEventListener("pp:agent:tool_result", listener as EventListener); } catch { }
      toolResultListenerRef.current = null;
    }
    try { processedCallIdsRef.current.clear(); } catch { }
    // Reset session bootstrap flags so each new connection sends session.update (tools/instructions)
    try {
      sessionInitSentRef.current = false;
      sessionIdRef.current = "";
    } catch { }
    // Clear any lingering tool reminder timers/maps
    try {
      activeToolTimersRef.current.forEach((tid) => { try { clearInterval(tid); } catch { } });
      activeToolTimersRef.current.clear();
      lastReminderSentAtRef.current.clear();
    } catch { }
  };

  const teardown = () => {
    stopPeerConnection();
    stopAudioGraph();
    if (autoStopTimerRef.current) {
      try { clearTimeout(autoStopTimerRef.current); } catch { }
      autoStopTimerRef.current = null;
    }
    setIsListening(false);
    isListeningRef.current = false;
    setIsMuted(false);
    setMicLevel(0);
    setAgentLevel(0);
    setIsStarting(false);
    setToolsReady(false);
    try {
      window.dispatchEvent(
        new CustomEvent("pp:voice:levels", {
          detail: { isListening: false, micLevel: 0, agentLevel: 0 }
        }) as any
      );
    } catch { }
  };

  const loop = useCallback(() => {
    const micA = micAnalyserRef.current;
    const agentA = agentAnalyserRef.current;

    let u = 0;
    let aLevel = 0;
    let micSpec: number[] | undefined;
    let agentSpec: number[] | undefined;

    if (micA) {
      u = rmsFromAnalyser(micA);
      setMicLevel(u);
      try { micSpec = getNormalizedSpectrum(micA); } catch { }
    }

    if (agentA) {
      aLevel = rmsFromAnalyser(agentA);
      setAgentLevel(aLevel);
      try { agentSpec = getNormalizedSpectrum(agentA); } catch { }
      if (aLevel > 0.03) {
        agentLastAudioAboveThreshAtRef.current = Date.now();
      }
    }

    try {
      window.dispatchEvent(
        new CustomEvent("pp:voice:levels", {
          detail: {
            isListening: isListeningRef.current,
            micLevel: u,
            agentLevel: aLevel,
            micSpectrum: micSpec,
            agentSpectrum: agentSpec,
          }
        }) as any
      );
    } catch { }

    rafRef.current = requestAnimationFrame(loop);
  }, []);

  // Unified handler attachment for local or server-created data channel
  const attachHandlers = useCallback((chan: RTCDataChannel) => {
    try {
      dataChannelRef.current = chan;

      // Tools routing: client-local (cart) vs server-executed (reads/analytics)
      const UI_TOOL_NAMES = new Set(["addToCart", "editCartItem", "removeFromCart", "updateCartItemQty", "clearCart", "getCartSummary"]);

      const submitToolOutput = (callId: string, output: any) => {
        try {
          // Forward to unified handler; onToolResult will submit in the correct format and mark submitted
          window.dispatchEvent(new CustomEvent("pp:agent:tool_result", {
            detail: { requestId: String(callId || ""), sessionId: sessionIdRef.current, result: output }
          }));
        } catch { }
      };

      const executeTool = async (detail: { name: string; args: any; requestId?: string }) => {
        try {
          const cid = String(detail.requestId || "");
          if (cid && submittedCallIdsRef.current.has(cid)) {
            try { console.info("[Realtime] Skip already-submitted call_id", cid); } catch { }
            return;
          }
          if (cid && processedCallIdsRef.current.has(cid)) {
            try { console.info("[Realtime] Skip duplicate tool_call (processed)", detail.name, cid); } catch { }
            return;
          }
          if (cid) { processedCallIdsRef.current.add(cid); }
          // Track tool name by call id for output normalization
          try { if (cid) toolNameByCallIdRef.current.set(cid, detail.name); } catch { }
          // Track tool args by call id for better confirmations
          try { if (cid) toolArgsByCallIdRef.current.set(cid, detail.args); } catch { }
          // Deduplicate near-identical tool calls by name+args within a short window
          try {
            const sig = `${detail.name}:${stableStringify(detail.args)}`;
            const lastSig = recentToolSignaturesRef.current.get(sig) || 0;
            const nowSig = Date.now();
            if (nowSig - lastSig < 2000) {
              console.info("[Realtime] Skip duplicate tool_call by signature", detail.name, sig);
              return;
            }
            recentToolSignaturesRef.current.set(sig, nowSig);
          } catch { }
          if (UI_TOOL_NAMES.has(detail.name)) {
            // Route to client-local dispatcher
            window.dispatchEvent(new CustomEvent("pp:agent:tool_call", { detail }));
            return;
          }
          // Server-executed tools
          const shopCtx = (window as any).__pp_shopContext || {};
          const wallet = String(shopCtx?.merchantWallet || "");
          const slug = String(shopCtx?.slug || "");
          const res = await fetch("/api/agent/voice/call-tool", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(wallet ? { "x-wallet": wallet } : {}),
              ...(slug ? { "x-slug": slug } : {}),
            },
            body: JSON.stringify({ toolName: detail.name, args: detail.args }),
            credentials: "include",
          });
          const json = await res.json().catch(() => ({}));
          const result = (json && (json as any).result) ? (json as any).result : { ok: false, error: "tool_call_failed" };
          submitToolOutput(String(detail.requestId || ""), result);
        } catch (e: any) {
          const result = { ok: false, error: e?.message || "tool_call_error" };
          submitToolOutput(String(detail.requestId || ""), result);
        }
      };

      // Incoming messages: normalize tool calls
      chan.onmessage = (ev2) => {
        try {
          const msg = JSON.parse(String((ev2 as MessageEvent).data || "{}"));
          // Suppress noisy runtime error frames across variants
          const tStr = String(((msg as any)?.type) || "");
          if (tStr && tStr.toLowerCase().includes("error")) { return; }
          try { console.info("[Realtime] DC message type:", tStr || "(none)", msg); } catch { }
          // Mark continuation responses we created as safe (don't cancel them)
          if (msg && msg.type === "response.created") {
            try {
              const rid = String((msg as any)?.response?.id || (msg as any)?.id || "");
              if (rid) {
                // Track pending responses
                try { pendingResponseIdsRef.current.add(rid); } catch { }
              }
              if (rid && Date.now() <= (expectContinuationUntilRef.current || 0)) {
                safeResponseIdsRef.current.add(rid);
                // Unmute remote audio for safe continuation responses
                try {
                  const el = remoteAudioElRef.current;
                  if (el) { el.muted = false; el.play().catch(() => { }); }
                } catch { }
                try { console.info("[Realtime] Marked response_id safe (continuation)", rid); } catch { }
              }
            } catch { }
          }
          // Ensure audio context is resumed and playback unmuted when audio starts
          if (msg && msg.type === "output_audio_buffer.started") {
            try {
              if (audioCtxRef.current && audioCtxRef.current.state !== "running") {
                audioCtxRef.current.resume().catch(() => { });
              }
              const el = remoteAudioElRef.current;
              if (el) { el.muted = false; el.play().catch(() => { }); }
              try { console.info("[Realtime] Ensured audio playback on output_audio_buffer.started"); } catch { }
            } catch { }
          }
          // Accumulate text deltas and speak on completion as a fallback if audio is not emitted
          if (msg && msg.type === "response.output_text.delta") {
            try {
              const id = String((msg as any)?.response?.id || (msg as any)?.id || "");
              const delta = String((msg as any)?.delta || "");
              if (id) {
                const prev = pendingTextByResponseRef.current.get(id) || "";
                pendingTextByResponseRef.current.set(id, prev + delta);
              }
            } catch { }
            return;
          }
          // Accumulate audio transcript deltas for fallback TTS when remote audio isn't rendered
          if (msg && msg.type === "response.audio_transcript.delta") {
            try {
              const rid = String((msg as any)?.response_id || (msg as any)?.response?.id || (msg as any)?.id || "");
              // Ignore transcript for canceled responses unless marked safe (prevents ungrounded audio)
              if (rid && canceledResponseIdsRef.current.has(rid) && !safeResponseIdsRef.current.has(rid)) {
                return;
              }
              const delta = String((msg as any)?.delta || "");
              if (rid && delta) {
                const prevT = pendingTranscriptByResponseRef.current.get(rid) || "";
                pendingTranscriptByResponseRef.current.set(rid, prevT + delta);
              }
            } catch { }
            return;
          }
          if (msg && msg.type === "response.completed") {
            try {
              const id = String((msg as any)?.response?.id || (msg as any)?.id || "");
              const text = id ? (pendingTextByResponseRef.current.get(id) || "") : "";
              const transcript = id ? (pendingTranscriptByResponseRef.current.get(id) || "") : "";
              // Fallback TTS disabled to avoid premature audio before tool outputs finalize.
              if (id) {
                pendingTextByResponseRef.current.delete(id);
                pendingTranscriptByResponseRef.current.delete(id);
                // Remove from pending responses
                try { pendingResponseIdsRef.current.delete(id); } catch { }
              }

              // Suppress outputs-based function_call execution here to avoid duplicate tool invocations;
              // prefer required_action / tool_calls handlers and streamed arguments handlers.
            } catch { }
          }
          // Handle alternative event type used by some runtimes - CRITICAL: Process tool calls from response.done like ledger1
          if (msg && msg.type === "response.done") {
            try {
              const id = String((msg as any)?.response?.id || (msg as any)?.id || "");
              const text = id ? (pendingTextByResponseRef.current.get(id) || "") : "";
              const transcript = id ? (pendingTranscriptByResponseRef.current.get(id) || "") : "";
              if (id) {
                pendingTextByResponseRef.current.delete(id);
                pendingTranscriptByResponseRef.current.delete(id);
                // Remove from pending responses
                try { pendingResponseIdsRef.current.delete(id); } catch { }
              }

              // CRITICAL: Handle function_call items from response.done output array (ledger1 pattern)
              const outputs: any[] = Array.isArray((msg as any)?.response?.output) ? (msg as any).response.output : [];
              const functionCalls = outputs.filter((it: any) => it && it.type === "function_call");
              if (functionCalls.length > 0) {
                // Cancel ungrounded in-progress response to avoid hallucinated speech before tool outputs are bound
                try {
                  if (id) {
                    chan.send(JSON.stringify({ type: "response.cancel", response_id: id }));
                    const el = remoteAudioElRef.current;
                    if (el) { el.muted = true; }
                  }
                } catch { }
                console.info("[Realtime] Processing function_calls from response.done", functionCalls.length);
                // Execute all tool calls from this response
                for (const fc of functionCalls) {
                  const nm = String(fc?.name || fc?.function?.name || "");
                  let args: any = fc?.arguments || fc?.function?.arguments || {};
                  if (typeof args === "string") {
                    try { args = JSON.parse(args); } catch { args = {}; }
                  }
                  // Prefer call_id first (ledger1 pattern) to ensure proper binding
                  const reqId = String(fc?.call_id || fc?.id || "");
                  if (nm && reqId) {
                    const detail = { name: nm, args, requestId: reqId, sessionId: sessionIdRef.current };
                    console.info("[Realtime] Executing tool from response.done:", nm, detail);
                    try {
                      executeTool(detail);
                    } catch (e) {
                      console.error("[Realtime] Error executing tool from response.done:", e);
                    }
                  }
                }
              }
            } catch (e) {
              console.error("[Realtime] Error processing response.done:", e);
            }
          }

          // Fallback: speak audio transcript when audio frames are not rendered
          if (msg && msg.type === "response.audio_transcript.done") {
            try {
              const id = String((msg as any)?.response_id || (msg as any)?.response?.id || (msg as any)?.id || "");
              const transcript = id ? (pendingTranscriptByResponseRef.current.get(id) || "") : "";
              // Fallback TTS disabled to avoid premature audio before tool outputs finalize.
              if (id) { pendingTranscriptByResponseRef.current.delete(id); }
            } catch { }
          }

          // Early seed for function/tool calls appearing as output items
          if (msg && msg.type === "response.output_item.added") {
            try {
              const it = (msg as any).item || {};
              const t = String(it?.type || "");
              if (t === "function_call" || t === "tool_call" || it?.function) {
                const id0 = String(it?.id || it?.call_id || "");
                const nm0 = String(it?.name || it?.function?.name || "");
                if (id0) {
                  (window as any).__pp_tool_acc ||= new Map<string, { name?: string; buf: string }>();
                  const acc0: Map<string, { name?: string; buf: string }> = (window as any).__pp_tool_acc;
                  const prev0 = acc0.get(id0) || { buf: "", name: undefined };
                  if (nm0) prev0.name = nm0;
                  acc0.set(id0, prev0);
                }
              }
            } catch { }
          }

          // Streamed function/tool call arguments (delta/done) — NO RESPONSE CANCELLATION
          if (
            msg &&
            (
              msg.type === "response.function_call_arguments.delta" ||
              msg.type === "response.tool_call_arguments.delta" ||
              msg.type === "response.function_call.arguments.delta" ||
              msg.type === "response.tool_call.arguments.delta" ||
              msg.type === "response.function_call_arguments.done" ||
              msg.type === "response.tool_call_arguments.done" ||
              msg.type === "response.function_call.arguments.done" ||
              msg.type === "response.tool_call.arguments.done"
            )
          ) {
            (window as any).__pp_tool_acc ||= new Map<string, { name?: string; buf: string }>();
            const acc: Map<string, { name?: string; buf: string }> = (window as any).__pp_tool_acc;
            const id = String((msg as any).call_id || (msg as any).id || (msg as any).item_id || "");
            if (!id) return;

            const isDelta = msg.type.endsWith(".delta");

            if (isDelta) {
              const prev = acc.get(id) || { buf: "", name: undefined };
              prev.buf += String((msg as any).delta || "");
              const nm =
                typeof (msg as any).name === "string" && (msg as any).name.length
                  ? (msg as any).name
                  : String((msg as any)?.tool?.name || (msg as any)?.function?.name || "");
              if (nm) prev.name = nm;
              acc.set(id, prev);
              return;
            }

            // Done event: finalize, parse, and dispatch
            const entry = acc.get(id);
            if (!entry) { acc.delete(id); return; }
            acc.delete(id);
            const text = entry?.buf ?? "";
            let argsObj: any = {};
            try { argsObj = text ? JSON.parse(text) : {}; } catch { argsObj = {}; }
            const nameCandidate =
              (typeof (msg as any).name === "string" && (msg as any).name.length)
                ? (msg as any).name
                : (entry?.name ?? "");
            if (!nameCandidate) return;
            const detail = { name: nameCandidate, args: argsObj, requestId: id, sessionId: sessionIdRef.current };
            console.info("[Realtime] Incoming streamed function/tool_call:", detail);
            try {
              fetch("/api/agent/telemetry", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  type: "data_channel_message",
                  name: detail.name,
                  requestId: detail.requestId,
                  sessionId: detail.sessionId,
                  args: detail.args
                })
              }).catch(() => { });
            } catch { }
            const callId = detail.requestId || "";
            if (callId && submittedCallIdsRef.current.has(callId)) { try { console.info("[Realtime] Skip duplicate tool_call (submitted)", detail.name, callId); } catch { }; return; }
            if (callId && processedCallIdsRef.current.has(callId)) { try { console.info("[Realtime] Skip duplicate tool_call (processed)", detail.name, callId); } catch { }; return; }
            try {
              if (callId && detail.name) toolNameByCallIdRef.current.set(callId, detail.name);
              if (callId) toolArgsByCallIdRef.current.set(callId, detail.args);
            } catch { }
            // Route streamed tool calls: UI tools via local dispatcher, others execute on server
            if (detail.name && UI_TOOL_NAMES.has(detail.name)) {
              if (callId) processedCallIdsRef.current.add(callId);
              window.dispatchEvent(new CustomEvent("pp:agent:tool_call", { detail }));
            } else {
              executeTool(detail);
            }
            return;
          }
        } catch {
          // ignore non-JSON payloads
        }
      };

      const handleOpen = async () => {
        // Assign a unique session id for this channel
        if (!sessionIdRef.current) {
          sessionIdRef.current = `sess:${Date.now()}:${Math.random().toString(36).slice(2)}`;
        }
        // Bridge tool results back to the agent using ledger1's proven working pattern
        const onToolResult = (evt: Event) => {
          const ce = evt as CustomEvent<{ requestId?: string; sessionId?: string; result: { ok: boolean; data?: any; error?: string } }>;
          try {
            const sid = (ce.detail as any)?.sessionId || "";
            if (sid && sid !== sessionIdRef.current) return;
            const callId = ce.detail?.requestId || "";
            if (callId && submittedCallIdsRef.current.has(callId)) {
              try { console.info("[Realtime] Skip tool_result (already submitted)", callId); } catch { }
              return;
            }
            const result = ce.detail?.result || { ok: false, error: "missing_result" };

            // Send the exact server result without transformation (ledger1 pattern)
            // This ensures the model receives tool outputs in the exact shape it expects
            if (dataChannelRef.current && dataChannelRef.current.readyState === "open") {
              try {
                // 1. Submit the tool output as a conversation item
                // Convert to natural language text so agent actually reads it
                const outputData = result.data ?? result;
                const toolName = toolNameByCallIdRef.current.get(callId) || "unknown";

                // Cancel any in-progress responses that are not marked safe before submitting tool outputs
                try {
                  const pendingIds = Array.from(pendingResponseIdsRef.current || []);
                  for (const rid of pendingIds) {
                    if (!safeResponseIdsRef.current.has(rid) && !canceledResponseIdsRef.current.has(rid)) {
                      dataChannelRef.current!.send(JSON.stringify({ type: "response.cancel", response_id: rid }));
                      canceledResponseIdsRef.current.add(rid);
                    }
                  }
                } catch { }

                // Format as descriptive text based on tool type
                let outputString: string;
                const od: any = outputData;

                // Prefer explicit meta from cart tools to avoid referencing previous items
                if (toolName === "addToCart" && od && od.added) {
                  const qty = Number(od.added.qty || 0);
                  const name = String(od.added.name || "item");
                  const subtotalVal = Number(od.subtotal || 0);
                  outputString = `Added ${qty} ${name} to the cart. Subtotal: $${subtotalVal.toFixed(2)}.`;
                } else if (toolName === "updateCartItemQty" && od && od.updated) {
                  const qty = Number(od.updated.qty || 0);
                  const name = String(od.updated.name || "item");
                  const subtotalVal = Number(od.subtotal || 0);
                  outputString = `Set quantity for ${name} to ${qty}. Subtotal: $${subtotalVal.toFixed(2)}.`;
                } else if (toolName === "clearCart" && od && od.cleared) {
                  outputString = `Cleared the cart. Subtotal: $0.00.`;
                } else if (toolName === "getCartSummary" && od && Array.isArray(od.items)) {
                  const itemsArr = od.items as any[];
                  const subtotalVal = Number(od.subtotal || 0);
                  if (itemsArr.length === 0) {
                    outputString = `Cart is empty. Subtotal: $${subtotalVal.toFixed(2)}.`;
                  } else {
                    const itemsText = itemsArr.map((it: any) => {
                      const name = it?.name || "Unknown";
                      const qty = Number(it?.qty || 0);
                      const price = Number(it?.priceUsd || 0);
                      return `${name} (qty ${qty} @ $${price})`;
                    }).join("; ");
                    outputString = `Cart summary: ${itemsArr.length} item${itemsArr.length > 1 ? "s" : ""}. Subtotal: $${subtotalVal.toFixed(2)}. Items: ${itemsText}`;
                  }
                } else if (Array.isArray(outputData)) {
                  // Inventory results - format as readable list
                  if (outputData.length === 0) {
                    outputString = "No items found.";
                  } else {
                    const items = outputData.map((item: any) => {
                      const name = item.name || "Unknown";
                      const price = typeof item.priceUsd === "number" ? `$${item.priceUsd}` : "Price N/A";
                      const stock = typeof item.stockQty === "number"
                        ? (item.stockQty === -1 ? "Unlimited stock" : `${item.stockQty} in stock`)
                        : "Stock unknown";
                      const id = item.id || item.sku || "";
                      return `${name} (${price}, ${stock}, ID: ${id})`;
                    }).join("; ");
                    outputString = `Found ${outputData.length} item${outputData.length > 1 ? "s" : ""}: ${items}`;
                  }
                } else if (outputData && typeof outputData === "object") {
                  // Object result - stringify with descriptive prefix
                  outputString = `Result: ${JSON.stringify(outputData)}`;
                } else {
                  // Primitive or unknown - just stringify
                  outputString = String(outputData);
                }

                // Prefer structured wrapper for inventory tools to improve grounding
                let outputPayload: string;
                if (Array.isArray(outputData) && (toolName === "getInventory" || toolName === "getInventoryPage")) {
                  // Wrap array in an { items: [...] } object (models tend to consume this more reliably)
                  outputPayload = JSON.stringify({ items: outputData });
                } else if (Array.isArray(outputData)) {
                  // Send array as JSON string for grounding
                  outputPayload = JSON.stringify(outputData);
                } else if (outputData && typeof outputData === 'object') {
                  // Send object as JSON string for grounding (e.g., cart summary)
                  outputPayload = JSON.stringify(outputData);
                } else {
                  // Primitive fallback: plain string
                  outputPayload = String(outputData);
                }

                const itemObj: any = {
                  type: "function_call_output",
                  call_id: callId,
                  output: outputPayload
                };
                const funcItemEvt = {
                  type: "conversation.item.create",
                  item: itemObj
                };
                dataChannelRef.current.send(JSON.stringify(funcItemEvt));

                // Also inject a system message that explicitly contains the tool output as plain text.
                // This forces the model to read and ground its response on the tool data.
                try {
                  const sysMsgEvt = {
                    type: "conversation.item.create",
                    item: {
                      type: "message",
                      role: "system",
                      content: [
                        {
                          type: "input_text",
                          text: `TOOL OUTPUT:\n${outputString}\n\nInstructions: Use ONLY the above tool output. Do NOT invent or list any items not present in the tool output.`
                        }
                      ]
                    }
                  };
                  dataChannelRef.current.send(JSON.stringify(sysMsgEvt));
                } catch { }

                // Enhanced debugging: show exactly what's being sent to the agent
                console.group(`[Realtime] 📤 Tool Output Sent to Agent`);
                console.log("Call ID:", callId);
                console.log("Tool Name:", toolNameByCallIdRef.current.get(callId) || "unknown");
                console.log("Result Status:", { ok: result.ok, hasData: result.data !== undefined, hasError: result.error !== undefined });
                console.log("Raw Result Object:", result);
                console.log("Extracted Output Data:", outputData);
                console.log("Output String Length:", outputString.length, "chars");
                console.log("Output String (first 500 chars):", outputString.substring(0, 500));
                if (Array.isArray(outputData)) {
                  console.log(`  → Sending ARRAY with ${outputData.length} items`);
                  outputData.forEach((item, idx) => {
                    console.log(`    [${idx}]:`, item);
                  });
                } else if (outputData && typeof outputData === 'object') {
                  console.log(`  → Sending OBJECT with keys: ${Object.keys(outputData).join(', ')}`);
                  console.log("    Full object:", outputData);
                }
                console.log("Complete message sent to agent:", funcItemEvt);
                console.groupEnd();

                // 2. Immediately trigger agent continuation WITH INSTRUCTIONS OVERRIDE to force grounding
                // Mark upcoming continuation response as safe
                expectContinuationUntilRef.current = Date.now() + 2000;
                // Build cart-specific confirmation instructions to avoid mentioning issues when ok=true
                let continueInstructions = `Use ONLY the tool output just provided. Do NOT invent or list any items not present in it. Respond concisely based on:\n${outputString}`;
                try {
                  const od: any = outputData;
                  if (result.ok) {
                    if (toolName === "addToCart" && od?.added) {
                      const qty = Number(od.added.qty || 0);
                      const name = String(od.added.name || "item");
                      const subtotalVal = Number(od.subtotal || 0);
                      continueInstructions = `Confirm clearly and positively that you added ${qty} of ${name} to the cart. Then state the current subtotal ($${subtotalVal.toFixed(2)}). Do not mention any problems since the tool succeeded.`;
                    } else if (toolName === "updateCartItemQty" && od?.updated) {
                      const qty = Number(od.updated.qty || 0);
                      const name = String(od.updated.name || "item");
                      const subtotalVal = Number(od.subtotal || 0);
                      continueInstructions = `Confirm clearly that you set the quantity for ${name} to ${qty}. Then state the current subtotal ($${subtotalVal.toFixed(2)}). Do not mention any issues.`;
                    } else if (toolName === "clearCart" && od?.cleared) {
                      continueInstructions = `Confirm clearly that you cleared the cart. Then state that the subtotal is $0.00. Do not mention any issues.`;
                    } else if (toolName === "getCartSummary" && Array.isArray(od?.items)) {
                      const subtotalVal = Number(od.subtotal || 0);
                      continueInstructions = `Summarize the cart concisely with item names and quantities, then give the subtotal ($${subtotalVal.toFixed(2)}). Do not mention any issues.`;
                    }
                  } else {
                    // If the tool failed, explain the error briefly
                    continueInstructions = `The tool reported an error: ${(result as any).error || "unknown_error"}. Inform the user briefly and suggest a next step.`;
                  }
                } catch { }
                const continueEvt = {
                  type: "response.create",
                  response: {
                    instructions: continueInstructions
                  }
                };
                dataChannelRef.current.send(JSON.stringify(continueEvt));
                console.info("[Realtime] Triggered agent continuation after tool output (instructions override applied)");

                // Mark as submitted
                submittedCallIdsRef.current.add(callId);
              } catch (e) {
                console.error("[Realtime] Error submitting tool output:", e);
              }
            }

            // Stop the processing reminders for this tool call
            if (callId) {
              const timerId = activeToolTimersRef.current.get(callId);
              if (timerId) {
                try { clearInterval(timerId); } catch { }
                activeToolTimersRef.current.delete(callId);
                lastReminderSentAtRef.current.delete(callId);
                console.info("[Realtime] Cleared processing reminders for callId:", callId);
              }
            }
          } catch (e) {
            console.error("[Realtime] Error in onToolResult:", e);
          }
        };
        if (!toolResultListenerRef.current) {
          toolResultListenerRef.current = onToolResult;
          window.addEventListener("pp:agent:tool_result", onToolResult as EventListener);
        }

        // Send session.update + initial prompt once
        if (!sessionInitSentRef.current) {
          try {
            // Fetch server tool definitions and merge with client-local cart tools
            let serverTools: any[] = [];
            try {
              const resp = await fetch("/api/agent/tools?toolset=shop");
              if (resp.ok) {
                serverTools = await resp.json();
              }
            } catch { }

            const uiTools: any[] = [];

            const tools: any[] = [...serverTools, ...uiTools];

            const shopCtx = (window as any).__pp_shopContext || {};
            const shopName = String(shopCtx?.name || "").trim();
            const shopDesc = String(shopCtx?.description || shopCtx?.shortDescription || shopCtx?.bio || "").trim();
            const shopWallet = String(shopCtx?.merchantWallet || "").trim();
            const shopSlug = String(shopCtx?.slug || "").trim();
            const ratingAvg = Number(shopCtx?.ratingAvg || 0);
            const ratingCount = Number(shopCtx?.ratingCount || 0);

            const dynamicInstructions = buildServerAssistantPrompt({
              name: shopName,
              description: String(shopCtx?.description || "").trim(),
              shortDescription: String(shopCtx?.shortDescription || "").trim(),
              bio: String(shopCtx?.bio || "").trim(),
              // merchantWallet: shopWallet, // Not used in server assistant prompt explicitly or optional
              // slug: shopSlug,
              // ratingAvg,
              // ratingCount,
              categories: Array.isArray(shopCtx?.categories) ? shopCtx.categories : [],
              sessionSeed: sessionIdRef.current,
              startedAt: new Date().toISOString(),
            });

            // Prepare a compatibility tools array for Azure variants that expect flattened function schema
            const toolsCompat = tools.map((t: any) => ({
              type: "function",
              name: t.function?.name,
              description: t.function?.description,
              parameters: t.function?.parameters,
            }));

            // Augment instructions to encourage tool usage explicitly (ledger1-style guidance)
            const toolNames: string[] = tools.map((t: any) => t?.function?.name).filter(Boolean);
            const richInstructions = `${dynamicInstructions}

${buildLanguageTimeInjection().instruction}

Tooling: Available functions: ${toolNames.join(", ")}.
- Use getShopRating for reviews (avg and count).
- Use getInventory / getInventoryPage for product search and pagination.
- Use getItemModifiers to fetch modifier groups and variants for customizable items before adding to cart.
- Use getOwnerAnalytics for owner metrics when authenticated.

CRITICAL RULES FOR TOOL OUTPUTS:
1. ONLY use data from tool outputs - NEVER invent, assume, or extrapolate product information
2. If a tool returns an empty array or no items, say "I don't see any items matching that" - do NOT make up products
3. When listing items, use ONLY the exact fields returned: id, sku, name, priceUsd, stockQty, category
4. If tool output is missing or empty, inform the user - do NOT fill in with placeholder or example data
5. After receiving tool outputs, base your entire response on that data and nothing else

Always prefer tool calls when data is needed; summarize results concisely and accurately.`;

            // Send session.update with flattened function schema so runtime recognizes functions
            const sessionUpdate1 = {
              type: "session.update",
              session: {
                instructions: richInstructions,
                tool_choice: "auto",
                modalities: ["text", "audio"],
                voice: "marin",
                output_audio_format: "pcm16",
                tools: toolsCompat,
              },
            };
            chan.send(JSON.stringify(sessionUpdate1));

            // Send a secondary session.update with nested function schema for maximum compatibility
            const sessionUpdate2 = {
              type: "session.update",
              session: {
                tools,
                tool_choice: "auto",
                modalities: ["text", "audio"],
                voice: "marin",
                output_audio_format: "pcm16",
              },
            };
            chan.send(JSON.stringify(sessionUpdate2));

            // Also send a compatibility session.update with flattened tool schema
            try {
              console.info("[ShopAgent] Initialized", {
                name: shopName,
                description: shopDesc,
                shortDescription: typeof shopCtx?.shortDescription === "string" ? shopCtx.shortDescription : null,
                bio: typeof shopCtx?.bio === "string" ? shopCtx.bio : null,
                slug: shopSlug,
                wallet: shopWallet,
                ratingAvg,
                ratingCount,
                tools: tools.map((t: any) => t.function?.name)
              });
            } catch { }

            // Wait for session.update to be processed before generating the first response (no user prompt)
            setTimeout(() => {
              try {
                const initResp = { type: "response.create" };
                chan.send(JSON.stringify(initResp));
              } catch { }
            }, 500);

            sessionInitSentRef.current = true;
            setToolsReady(true);
            setIsStarting(false);
          } catch { }
        }
      };
      // Attach open handler and invoke immediately if already open
      try { chan.onopen = handleOpen; if (chan.readyState === "open") { void handleOpen(); } } catch { }
    } catch {
      // ignore attachment errors
    }
  }, []);

  const startListening = useCallback(async (opts?: StartOptions) => {
    setError(null);
    if (isListening || isStarting) { try { console.info("[Realtime] Already listening or starting; ignoring start"); } catch { } return; }
    // Ensure shop context is ready before starting to avoid hallucinated greetings
    try {
      const sc = (window as any).__pp_shopContext || {};
      const hasDesc =
        (typeof sc.description === "string" && sc.description.trim().length > 0) ||
        (typeof sc.shortDescription === "string" && sc.shortDescription.trim().length > 0) ||
        (typeof sc.bio === "string" && sc.bio.trim().length > 0);
      const ready =
        !!sc &&
        typeof sc.merchantWallet === "string" && sc.merchantWallet &&
        typeof sc.name === "string" && sc.name.trim().length > 0 &&
        hasDesc;
      if (!ready) {
        setError("Shop context not ready");
        return;
      }
    } catch { }
    try {
      // Get maxDurationSec from /api/voice/session to honor gating and voice default
      const shopCtx1 = (window as any).__pp_shopContext || {};
      const wallet1 = String(shopCtx1?.merchantWallet || "");
      // Seed a session id early so instructions carry a consistent sessionSeed
      if (!sessionIdRef.current) {
        sessionIdRef.current = `sess:${Date.now()}:${Math.random().toString(36).slice(2)}`;
      }
      const preInstructions = buildServerAssistantPrompt({
        name: String(shopCtx1?.name || "").trim(),
        description: String(shopCtx1?.description || "").trim(),
        shortDescription: String(shopCtx1?.shortDescription || "").trim(),
        bio: String(shopCtx1?.bio || "").trim(),
        merchantWallet: wallet1,
        slug: String(shopCtx1?.slug || "").trim(),
        ratingAvg: Number(shopCtx1?.ratingAvg || 0),
        ratingCount: Number(shopCtx1?.ratingCount || 0),
        categories: Array.isArray(shopCtx1?.categories) ? shopCtx1.categories : [],
        sessionSeed: sessionIdRef.current,
        startedAt: new Date().toISOString(),
      });
      const langInfo = buildLanguageTimeInjection();
      instructionsRef.current = `${preInstructions}

${langInfo.instruction}`;
      setIsStarting(true);
      // Reuse ephemeral token if not expired; otherwise fetch a new one with backoff and handle rate limits
      // Load cached token from sessionStorage if present
      try {
        const cachedToken = sessionStorage.getItem("pp_voice_token") || "";
        const cachedExpMs = Number(sessionStorage.getItem("pp_voice_token_expiryMs") || "0");
        if (cachedToken && Number.isFinite(cachedExpMs) && Date.now() < cachedExpMs) {
          tokenRef.current = cachedToken;
          tokenExpiryMsRef.current = cachedExpMs;
          console.info("[Realtime] Using cached ephemeral token from sessionStorage");
        }
      } catch { }
      const nowMs = Date.now();
      const hasValidToken = !!tokenRef.current && (nowMs < tokenExpiryMsRef.current);
      let cap = maxDurationSec;
      if (!hasValidToken) {
        if (sessionFetchLockRef.current) {
          // Another session fetch may be in-flight; small wait to avoid thundering herd
          await new Promise((r) => setTimeout(r, 500));
        }
        sessionFetchLockRef.current = true;
        try {
          const res = await fetch("/api/voice/session", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(wallet1 ? { "x-wallet": wallet1 } : {}) },
            cache: "no-store",
            body: JSON.stringify({ voice: (opts?.voice || "marin"), wallet: wallet1, instructions: opts?.instructions || instructionsRef.current || preInstructions }),
          });
          const j = await res.json().catch(() => ({}));
          if (!res.ok) {
            const msg = typeof j?.error === "string" ? j.error : "Voice session failed";
            // If rate limited on sessions and we have an existing token, proceed; otherwise surface error
            if (res.status === 429 || String(msg).toLowerCase().includes("limit")) {
              if (!tokenRef.current) {
                setError("Sessions rate limited. Please wait ~60s and try again.");
                return;
              }
            } else {
              throw new Error(msg);
            }
          } else {
            tokenRef.current = String(
              (j as any)?.client_secret?.value ||
              (j as any)?.client_secret ||
              (j as any)?.secret ||
              (j as any)?.token ||
              ""
            );
            // Derive TTL from response if available; fallback to 90s
            try {
              const expiresAtStr = String((j as any)?.client_secret?.expires_at || "");
              const expiresInSec = Number((j as any)?.client_secret?.expires_in || (j as any)?.expires_in || 0);
              let ttlMs = 90_000;
              if (expiresAtStr) {
                const at = Date.parse(expiresAtStr);
                if (Number.isFinite(at)) {
                  ttlMs = Math.max(30_000, Math.min(5 * 60_000, at - Date.now()));
                }
              } else if (Number.isFinite(expiresInSec) && expiresInSec > 0) {
                ttlMs = Math.max(30_000, Math.min(5 * 60_000, Math.floor(expiresInSec * 1000)));
              }
              tokenExpiryMsRef.current = Date.now() + ttlMs;
              try { console.info("[Realtime] Cached ephemeral token TTL ms:", ttlMs); } catch { }
            } catch {
              tokenExpiryMsRef.current = Date.now() + 90_000;
            }
            // Persist token to sessionStorage to avoid re-hitting sessions endpoint after page reloads
            try {
              sessionStorage.setItem("pp_voice_token", tokenRef.current);
              sessionStorage.setItem("pp_voice_token_expiryMs", String(tokenExpiryMsRef.current));
            } catch { }
            cap = Number(j?.maxDurationSec || cap || 60);
            setMaxDurationSec(cap);
            usageDocIdRef.current = String(j?.usageDocId || usageDocIdRef.current || "");
          }
        } finally {
          sessionFetchLockRef.current = false;
        }
      }

      // Create peer connection
      const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      pcRef.current = pc;

      // Create local data channel following Azure/OpenAI convention
      const dc = pc.createDataChannel("oai-events");
      dc.onopen = () => { console.info("[Realtime] Data channel open"); attachHandlers(dc); };
      dc.onmessage = () => { /* handled by attachHandlers */ };

      // If server creates data channel, attach handlers
      pc.ondatachannel = (ev) => { attachHandlers(ev.channel); };

      // Remote audio handling
      pc.ontrack = (ev) => {
        const [stream] = ev.streams;
        remoteStreamRef.current = stream || new MediaStream([ev.track]);
        let el = remoteAudioElRef.current;
        if (!el) {
          el = document.createElement("audio");
          el.autoplay = true;
          el.setAttribute("playsinline", "true");
          el.controls = false;
          el.muted = false;
          remoteAudioElRef.current = el;
          try { document.body.appendChild(el); } catch { }
          el.style.display = "none";
        }
        try {
          el.srcObject = remoteStreamRef.current;
          el.play().catch(() => { });
        } catch { }

        // Analyze agent audio
        if (!audioCtxRef.current) {
          audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        const agentCtx = audioCtxRef.current as AudioContext;
        const agentSource = agentCtx.createMediaStreamSource(remoteStreamRef.current!);
        const agentAnalyser = agentCtx.createAnalyser();
        agentAnalyser.fftSize = 1024;
        agentSource.connect(agentAnalyser);
        agentAnalyserRef.current = agentAnalyser;
      };

      // Add explicit audio transceiver
      try { pc.addTransceiver("audio", { direction: "sendrecv" }); } catch { }

      // Mic capture
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      micStreamRef.current = micStream;
      const micTrack = micStream.getAudioTracks()[0];
      pc.addTrack(micTrack, micStream);

      // Audio graph for mic level
      const micCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = micCtx;
      const micSource = micCtx.createMediaStreamSource(micStream);
      const micAnalyser = micCtx.createAnalyser();
      micAnalyser.fftSize = 1024;
      micSource.connect(micAnalyser);
      micAnalyserRef.current = micAnalyser;

      // Create and set local offer
      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);

      // Wait for ICE gathering to complete (so SDP has candidates)
      const waitForIce = (peer: RTCPeerConnection, timeoutMs = 4000) =>
        new Promise<void>((resolve) => {
          if (peer.iceGatheringState === "complete") { resolve(); return; }
          let done = false;
          const onStateChange = () => {
            if (!done && peer.iceGatheringState === "complete") {
              done = true;
              peer.removeEventListener("icegatheringstatechange", onStateChange);
              resolve();
            }
          };
          peer.addEventListener("icegatheringstatechange", onStateChange);
          setTimeout(() => {
            if (!done) {
              done = true;
              try { peer.removeEventListener("icegatheringstatechange", onStateChange); } catch { }
              resolve();
            }
          }, timeoutMs);
        });
      try { await waitForIce(pc, 4000); } catch { }

      const localSdp = (pc.localDescription && pc.localDescription.sdp) || offer.sdp || "";

      // Send offer to server; get answer
      const shopCtx2 = (window as any).__pp_shopContext || {};
      const wallet2 = String(shopCtx2?.merchantWallet || "");
      const offerRes = await fetch("/api/voice/rtc/offer", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(wallet2 ? { "x-wallet": wallet2 } : {}) },
        cache: "no-store",
        body: JSON.stringify({
          sdp: localSdp,
          voice: (opts?.voice || "marin"),
          wallet: wallet2,
          instructions: (instructionsRef.current || ""),
          token: tokenRef.current
        }),
      });
      const offerJson = await offerRes.json().catch(() => ({}));
      if (!offerRes.ok || !offerJson?.answer?.sdp) {
        throw new Error(offerJson?.error || "RTC offer failed");
      }
      const remoteDesc = {
        type: String(offerJson?.answer?.type || "answer") as RTCSdpType,
        sdp: String(offerJson?.answer?.sdp || ""),
      };
      await pc.setRemoteDescription(remoteDesc as RTCSessionDescriptionInit);

      // Start visualization loop
      cleanupRaf();
      rafRef.current = requestAnimationFrame(loop);

      // Mark listening; ensure mic enabled
      setIsListening(true);
      isListeningRef.current = true;
      setIsMuted(false);
      sessionStartMsRef.current = Date.now();
      try { for (const t of micStream.getAudioTracks()) t.enabled = true; } catch { }

      // Auto-stop at cap
      if (autoStopTimerRef.current) {
        try { clearTimeout(autoStopTimerRef.current); } catch { }
        autoStopTimerRef.current = null;
      }
      autoStopTimerRef.current = setTimeout(() => { try { stop(); } catch { } }, cap * 1000) as unknown as number;
    } catch (e: any) {
      setError(e?.message || "Failed to start voice");
      stop();
    }
  }, [loop, isListening]);

  const toggleMute = useCallback(() => {
    const s = micStreamRef.current;
    if (!s) return;
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    try { for (const t of s.getAudioTracks()) t.enabled = !nextMuted; } catch { }
  }, [isMuted]);

  const commitUsage = useCallback(async () => {
    try {
      if (committedRef.current) return;
      const id = usageDocIdRef.current;
      const startedAt = sessionStartMsRef.current;
      if (!id || !startedAt) return;
      const elapsedSec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      const used = Math.min(elapsedSec, Math.max(0, maxDurationSec || 0));
      committedRef.current = true;
      await fetch("/api/voice/usage/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ id, seconds: used }),
      }).catch(() => { });
    } catch {
      // swallow commit errors
    }
  }, [maxDurationSec]);

  const stop = useCallback(() => {
    void commitUsage();
    teardown();
  }, [commitUsage]);

  const sendText = useCallback((text: string) => {
    const dc = dataChannelRef.current;
    if (!dc || dc.readyState !== "open") return;
    const t = String(text || "").trim();
    if (!t) return;
    try {
      const item = {
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: t }],
        },
      };
      const resp = { type: "response.create" };
      dc.send(JSON.stringify(item));
      dc.send(JSON.stringify(resp));
      try { console.info("[Realtime] Sent user text via conversation.item.create", t); } catch { }
    } catch { }
  }, []);

  useEffect(() => {
    return () => { stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    state: { isListening, isMuted, isStarting, toolsReady, micLevel, agentLevel, maxDurationSec, error },
    startListening,
    toggleMute,
    stop,
    sendText,
  };
}
