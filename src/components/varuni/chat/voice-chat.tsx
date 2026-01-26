'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Settings as SettingsIcon } from 'lucide-react';

const VOICE = 'coral';

export function VoiceChat() {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [tools, setTools] = useState<any[]>([]);
  const [activeToolset, setActiveToolset] = useState<string>('main');
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputId, setSelectedInputId] = useState<string | null>(null);
  const [selectedOutputId, setSelectedOutputId] = useState<string | null>(null);
  const [speakingText, setSpeakingText] = useState<string>('');
  const [toolStatus, setToolStatus] = useState<string>('');
  const [micVolume, setMicVolume] = useState<number>(0);
  const [agentVolume, setAgentVolume] = useState<number>(0);
  const [computedInstructions, setComputedInstructions] = useState<string>('');
  const [voiceSessionId, setVoiceSessionId] = useState<string | null>(null);
  const [userPartialText, setUserPartialText] = useState<string>('');
  const [showDebug, setShowDebug] = useState<boolean>(false);
  const vizRef = useRef<HTMLDivElement | null>(null);
  const [vizW, setVizW] = useState<number>(0);
  const [vizH, setVizH] = useState<number>(0);

  const fullAssistantTextRef = useRef<string>('');
  const recognitionRef = useRef<any>(null);
  const debugRef = useRef<boolean>(false);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const inputStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserMicRef = useRef<AnalyserNode | null>(null);
  const analyserAgentRef = useRef<AnalyserNode | null>(null);
  const rafMicRef = useRef<number | null>(null);
  const rafAgentRef = useRef<number | null>(null);

  const logMessage = useCallback((message: string) => {
    console.log(message);
    setLogs((prev) => [...prev, message]);
  }, []);

  useEffect(() => { debugRef.current = showDebug; }, [showDebug]);

  useEffect(() => {
    async function bootstrapDevices() {
      try {
        // Ensure permissions are granted so labels are available
        const prePerm = await navigator.mediaDevices.getUserMedia({ audio: true });
        prePerm.getTracks().forEach(t => t.stop());
      } catch { }
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        const inputs = list.filter(d => d.kind === 'audioinput');
        const outputs = list.filter(d => d.kind === 'audiooutput');
        setInputDevices(inputs);
        setOutputDevices(outputs);
        if (!selectedInputId && inputs.length) setSelectedInputId(inputs[0].deviceId || 'default');
        if (!selectedOutputId && outputs.length) setSelectedOutputId(outputs[0].deviceId || 'default');
      } catch (e) {
        console.warn('enumerateDevices failed', e);
      }
    }
    bootstrapDevices();

    async function fetchTools() {
      try {
        const auth = typeof window !== 'undefined' ? `Bearer ${sessionStorage.getItem('accessToken') || ''}` : '';
        const response = await fetch(`/api/varuni/chat/tools?toolset=${encodeURIComponent(activeToolset)}`, { headers: { 'Authorization': auth } });
        if (!response.ok) {
          throw new Error('Failed to fetch tools');
        }
        const toolData = await response.json();
        setTools(toolData);
      } catch (error) {
        logMessage('Error fetching tools.');
        console.error(error);
      }
    }
    fetchTools();
  }, [logMessage, selectedInputId, selectedOutputId, activeToolset]);

  // Responsive orb sizing based on container
  useEffect(() => {
    const el = vizRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect || { width: 240, height: 240 } as any;
        setVizW(width);
        setVizH(height);
      }
    });
    ro.observe(el);
    return () => { try { ro.disconnect(); } catch { } };
  }, []);

  const cleanupAnalyser = useCallback(() => {
    if (rafMicRef.current) cancelAnimationFrame(rafMicRef.current);
    if (rafAgentRef.current) cancelAnimationFrame(rafAgentRef.current);
    rafMicRef.current = null;
    rafAgentRef.current = null;
    try { analyserMicRef.current?.disconnect(); } catch { }
    try { analyserAgentRef.current?.disconnect(); } catch { }
    try { audioCtxRef.current?.close(); } catch { }
    analyserMicRef.current = null;
    analyserAgentRef.current = null;
    audioCtxRef.current = null;
  }, []);

  const startMeter = useCallback((stream: MediaStream, which: 'mic' | 'agent') => {
    try {
      const ctx = audioCtxRef.current || new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        const value = Math.min(1, rms * 2);
        if (which === 'mic') setMicVolume(value); else setAgentVolume(value);
        if (which === 'mic') rafMicRef.current = requestAnimationFrame(tick); else rafAgentRef.current = requestAnimationFrame(tick);
      };
      tick();
      if (which === 'mic') analyserMicRef.current = analyser; else analyserAgentRef.current = analyser;
    } catch (e) {
      console.warn('audio meter init failed', e);
    }
  }, []);

  const startUserSTT = useCallback(() => {
    try {
      const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) return; // no-op if unsupported
      const rec = new SR();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';
      rec.onresult = async (e: any) => {
        let finalText = '';
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          const txt = r[0].transcript || '';
          if (r.isFinal) finalText += txt; else interim += txt;
        }
        if (interim) setUserPartialText(interim);
        if (finalText) {
          setUserPartialText('');
          try {
            const res = await fetch('/api/varuni/voice/log', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': typeof window !== 'undefined' ? `Bearer ${sessionStorage.getItem('accessToken') || ''}` : ''
              },
              body: JSON.stringify({ sessionId: voiceSessionId, role: 'user', text: finalText })
            });
            const json = await res.json().catch(() => ({} as any));
            if (json?.success && typeof json.sessionId === 'string') setVoiceSessionId(json.sessionId);
          } catch { }
        }
      };
      rec.onerror = () => { };
      rec.onend = () => { };
      rec.start();
      recognitionRef.current = rec;
    } catch { }
  }, [voiceSessionId]);

  const handleToolCall = useCallback(async (functionCall: any) => {
    const { name, arguments: args } = functionCall;
    const call_id = (functionCall && (functionCall.call_id || functionCall.id || functionCall.callId)) || undefined;
    setToolStatus(`Using ${name}…`);
    logMessage(`Executing tool: ${name} with args: ${args}`);
    try {
      const parseArgs = (val: any) => {
        if (!val) return {};
        if (typeof val === 'string') {
          try { return JSON.parse(val); } catch { return {}; }
        }
        return (typeof val === 'object') ? val : {};
      };
      const auth = typeof window !== 'undefined' ? `Bearer ${sessionStorage.getItem('accessToken') || ''}` : '';
      const response = await fetch('/api/varuni/chat/voice/call-tool', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': auth,
        },
        body: JSON.stringify({ toolName: name, args: parseArgs(args) }),
      });
      if (!response.ok) {
        throw new Error(`Tool call failed with status ${response.status}`);
      }
      const result = await response.json();

      logMessage(`Tool ${name} executed with result: ${JSON.stringify(result)}`);

      if (dataChannelRef.current) {
        dataChannelRef.current.send(JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id,
            output: JSON.stringify(result.result),
          }
        }));

        dataChannelRef.current.send(JSON.stringify({
          type: 'response.create',
          response: {}
        }));
      }
      // Switch toolset if a navigator tool returned navigate
      try {
        const nav = result && result.result && typeof result.result.navigate === 'string' ? String(result.result.navigate).toLowerCase() : '';
        if (nav && nav !== activeToolset) {
          setActiveToolset(nav);
          // Proactively update session with new toolset
          const auth2 = typeof window !== 'undefined' ? `Bearer ${sessionStorage.getItem('accessToken') || ''}` : '';
          const resp = await fetch(`/api/varuni/chat/tools?toolset=${encodeURIComponent(nav)}`, { headers: { 'Authorization': auth2 } });
          if (resp.ok) {
            const newTools = await resp.json();
            const flattened = Array.isArray(newTools)
              ? newTools.map((t: any) => (t && t.function ? { type: 'function', name: t.function.name, description: t.function.description, parameters: t.function.parameters } : t))
              : [];
            if (dataChannelRef.current) {
              dataChannelRef.current.send(JSON.stringify({
                type: 'session.update',
                session: { tools: flattened, tool_choice: 'auto', voice: VOICE, output_audio_format: 'pcm16' },
              }));
            }
          }
        }
      } catch { }
      setToolStatus(`${name} ✓`);
      setTimeout(() => setToolStatus(''), 1500);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setToolStatus(`${name} failed`);
      setTimeout(() => setToolStatus(''), 2000);
      logMessage(`Error executing tool ${name}: ${errorMessage}`);
      console.error(`Error executing tool ${name}:`, error);
    }
  }, [logMessage, activeToolset]);

  const initWebRTC = useCallback(async (ephemeralKey: string) => {
    const pc = new RTCPeerConnection();
    peerConnectionRef.current = pc;

    if (!audioRef.current) {
      const audioElement = document.createElement('audio');
      audioElement.autoplay = true;
      document.body.appendChild(audioElement);
      audioRef.current = audioElement;
    }

    pc.ontrack = (event) => {
      if (audioRef.current) {
        audioRef.current.srcObject = event.streams[0];
        // Try binding sink/output device
        if (typeof (audioRef.current as any).setSinkId === 'function' && selectedOutputId) {
          try { (audioRef.current as any).setSinkId(selectedOutputId); } catch { }
        }
        // Start speaking meter on remote stream
        // Replace existing agent analyser if present
        startMeter(event.streams[0], 'agent');
      }
    };

    // Acquire mic using selected device
    if (inputStreamRef.current) { try { inputStreamRef.current.getTracks().forEach(t => t.stop()); } catch { } }
    const constraints: MediaStreamConstraints = { audio: selectedInputId ? { deviceId: { exact: selectedInputId } } as any : true };
    const clientMedia = await navigator.mediaDevices.getUserMedia(constraints);
    inputStreamRef.current = clientMedia;
    const audioTrack = clientMedia.getAudioTracks()[0];
    const sender = pc.addTrack(audioTrack, clientMedia);
    startMeter(clientMedia, 'mic');
    startUserSTT();

    const dataChannel = pc.createDataChannel('realtime-channel');
    dataChannelRef.current = dataChannel;

    dataChannel.onopen = () => {
      if (debugRef.current) logMessage('Data channel is open');
      const flattenedTools = Array.isArray(tools)
        ? tools.map((t: any) => {
          if (t && typeof t === 'object' && t.function && typeof t.function === 'object') {
            const fn = t.function || {};
            return {
              type: 'function',
              name: fn.name,
              description: fn.description,
              parameters: fn.parameters || { type: 'object', properties: {}, additionalProperties: true },
            };
          }
          return t;
        })
        : [];
      const event = {
        type: 'session.update',
        session: {
          instructions: (computedInstructions && computedInstructions.trim().length > 0) ? computedInstructions : 'You are Varuni. Be concise and helpful. Prefer tool use when relevant.',
          tools: flattenedTools,
          tool_choice: 'auto',
          voice: VOICE,
          output_audio_format: 'pcm16',
        },
      } as any;
      dataChannel.send(JSON.stringify(event));
      if (debugRef.current) logMessage('Sent client event: ' + JSON.stringify(event, null, 2));
    };

    dataChannel.onmessage = (event) => {
      try {
        const realtimeEvent = JSON.parse(event.data);
        if (!realtimeEvent || typeof realtimeEvent !== 'object') return;
        if (realtimeEvent.type) {
          if ((realtimeEvent.type === 'response.output_text.delta' || realtimeEvent.type === 'response.delta') && typeof realtimeEvent.delta === 'string') {
            setSpeakingText(prev => (prev + realtimeEvent.delta));
            fullAssistantTextRef.current = (fullAssistantTextRef.current || '') + realtimeEvent.delta;
          }
          if (realtimeEvent.type === 'response.done' && Array.isArray(realtimeEvent.response?.output)) {
            const outputs: any[] = realtimeEvent.response.output || [];
            const finalText = fullAssistantTextRef.current || '';
            if (finalText.trim().length > 0) {
              (async () => {
                try {
                  const res = await fetch('/api/varuni/voice/log', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': typeof window !== 'undefined' ? `Bearer ${sessionStorage.getItem('accessToken') || ''}` : ''
                    },
                    body: JSON.stringify({ sessionId: voiceSessionId, role: 'assistant', text: finalText })
                  });
                  const json = await res.json().catch(() => ({} as any));
                  if (json?.success && typeof json.sessionId === 'string') setVoiceSessionId(json.sessionId);
                } catch { }
              })();
            }
            setTimeout(() => setSpeakingText(''), 500);
            fullAssistantTextRef.current = '';
            const functionCalls = outputs.filter((it: any) => it && it.type === 'function_call');
            if (functionCalls.length) {
              (async () => { for (const fc of functionCalls) { try { await handleToolCall(fc); } catch { } } })();
            }
          }
          if (realtimeEvent.type === 'session.error' && debugRef.current) logMessage(`Error: ${realtimeEvent.error?.message || 'Unknown error'}`);
          if ((realtimeEvent.type === 'session.created' || realtimeEvent.type === 'session.updated') && debugRef.current) logMessage(`Received server event: ${JSON.stringify(realtimeEvent, null, 2)}`);
        }
      } catch (e) {
        console.warn('onmessage parse failed', e);
      }
    };

    dataChannel.onclose = () => {
      if (debugRef.current) logMessage('Data channel is closed');
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const webrtcUrl = process.env.NEXT_PUBLIC_AZURE_OPENAI_REALTIME_WEBRTC_URL;
    const deployment = process.env.NEXT_PUBLIC_AZURE_OPENAI_REALTIME_DEPLOYMENT;

    if (!webrtcUrl || !deployment) {
      throw new Error('WebRTC URL or deployment name is not configured in environment variables.');
    }

    const sdpResponse = await fetch(`${webrtcUrl}?model=${deployment}`, {
      method: 'POST',
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${ephemeralKey}`,
        'Content-Type': 'application/sdp',
      },
    });

    const answerSdp = await sdpResponse.text();
    await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

    // Helper to switch microphone on the fly
    (pc as any).__replaceMic__ = async (deviceId: string) => {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } as any });
        const newTrack = newStream.getAudioTracks()[0];
        const senderToReplace = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
        if (senderToReplace) await senderToReplace.replaceTrack(newTrack);
        if (inputStreamRef.current) inputStreamRef.current.getTracks().forEach(t => t.stop());
        inputStreamRef.current = newStream;
        startMeter(newStream, 'mic');
      } catch (e) {
        console.error('replace mic failed', e);
      }
    };

  }, [logMessage, tools, handleToolCall, selectedInputId, selectedOutputId, cleanupAnalyser, startMeter, computedInstructions, voiceSessionId]);

  // Re-send tools/instructions to the session once tools finish loading or instructions change
  useEffect(() => {
    try {
      const dc = dataChannelRef.current;
      if (!dc || dc.readyState !== 'open') return;
      const flattenedTools = Array.isArray(tools)
        ? tools.map((t: any) => {
          if (t && typeof t === 'object' && t.function && typeof t.function === 'object') {
            const fn = t.function || {};
            return {
              type: 'function',
              name: fn.name,
              description: fn.description,
              parameters: fn.parameters || { type: 'object', properties: {}, additionalProperties: true },
            };
          }
          return t;
        })
        : [];
      const event = {
        type: 'session.update',
        session: {
          instructions: (computedInstructions && computedInstructions.trim().length > 0) ? computedInstructions : 'You are Varuni. Be concise and helpful. Prefer tool use when relevant.',
          tools: flattenedTools,
          tool_choice: 'auto',
          voice: VOICE,
          output_audio_format: 'pcm16',
        },
      } as any;
      dc.send(JSON.stringify(event));
      if (debugRef.current) logMessage('Updated session with tools');
      setToolStatus('Tools loaded ✓');
      setTimeout(() => setToolStatus(''), 1200);
    } catch { }
  }, [tools, computedInstructions, logMessage]);

  const buildInstructions = useCallback(async (): Promise<string> => {
    const endpoint = process.env.NEXT_PUBLIC_GRAPHQL_URL || 'http://localhost:3000/api/graphql';
    const auth = typeof window !== 'undefined' ? `Bearer ${sessionStorage.getItem('accessToken') || ''}` : '';
    const who = await (async () => {
      try {
        const resp = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': auth }, body: JSON.stringify({ query: 'query{ me{ name email } }' }) });
        const json = await resp.json();
        const nm = json?.data?.me?.name || '';
        const em = json?.data?.me?.email || '';
        const src = (nm && nm.trim()) ? nm : (em || 'guest');
        return (src.includes('@') ? src.split('@')[0] : src.split(/\s+/)[0]) || 'guest';
      } catch {
        return 'guest';
      }
    })();
    const now = new Date();
    const day = now.toLocaleDateString(undefined, { weekday: 'long' });
    const date = now.toLocaleDateString();
    const time = now.toLocaleTimeString();
    return `You are Varuni, an AI operations strategist.

Caller: ${who}
Day: ${day}
Date: ${date}
Time: ${time}

Context: You are assisting an auto shop backoffice director inside LedgerOne. Prioritize accurate, actionable advice. When helpful, reference trade practices from the Society of Automotive Engineers (SAE), Motor Service Professional guidelines, I-CAR procedures, and ASE standards. Use these as guiding references—not to quote—when forming recommendations.

About ledger1:
ledger1 is a unified backoffice demo platform for hospitality operations.

Core Operating Principles (inherited from The Utility Company):
- Decentralized Ownership: Enable stakeholders to own, not just participate.
- Self-Reliance: Build systems where individuals and communities can create more than they consume.
- Transparency by Design: Every action should leave a verifiable digital trace, ensuring accountability and trust.
- East Meets West: Ground modern automation in timeless philosophies—efficiency paired with intentionality.
- Vertical Integration: Leverage shared infrastructure across all subsidiaries to enable a seamless and interoperable I3AS ecosystem.

Your Capabilities as Varuni:
- Offer short, actionable insights and concrete next steps grounded in live data where possible.
- Use specialized tools and systems for each module; when tools are available, prioritize their use over manual reasoning.
- Maintain operational harmony between tokenized ownership mechanics and real-world distillery workflows.
- Act as a strategic assistant to auto repair operators managing LedgerOne service lanes, parts, and customer experiences.

Response rules:
- Be concise but sufficiently detailed. No meta narration (e.g., "I'm going to", "working on it").
- 1-3 sentences maximum, or a short bullet list of results.
- Never mention internal tools or toolsets. Do not instruct the user about navigation.
- Ask at most one clarifying question only when necessary.

System Behavior:
- Emphasize data-backed decisions, especially where inventory forecasting, token-based barrel planning, or invoice automation are concerned.

Data integration rules:
- Locations and service areas must come from provider data only. For staffing/on-duty queries, use 7shifts locations (company → all locationIds) and aggregate across all by default. Do not ask about or invent domain names like "distillery" or "tasting room" unless those exact labels exist in provider data.
- If the user omits location, assume all locations. Only ask a location question if the provider response requires a disambiguation you cannot resolve (e.g., multiple orgs with conflicting scopes).

Authoritative integrations:
- 7shifts [Seven Shifts] (workforce): Source of truth for live/on-duty staff, clock-ins, roles, departments, and staffing summaries. Prefer 7shifts for any roster/coverage questions and aggregate across all locations by default.
- Toast POS (sales/ops): Source of truth for orders, revenue, menu data, and POS-side labor where relevant. Prefer Toast for order analytics, menu visibility/stock, and employee directory when used.

Tool preferences:
- For live on-duty staff, call seven_shifts_active (all locations) and summarize by department/location if available. Do not use scheduling.* for this.
 - If seven_shifts_active returns an error or no items, fall back to POS clock-ins: call toast_restaurants to list connected restaurants, then toast_time_entries for the current business day per restaurant, and join with toast_employees_list for names and roles. Aggregate across all restaurants and clearly note that this is a POS approximation.

Navigation rules:
- You have toolsets (grouped tool dictionaries). Start in the main navigator.
- To see groups, call list_toolsets. To see tools in a group, call list_tools with the toolset name.
- To switch groups, call open_toolset or a specific open_* tool (e.g., open_seven_shifts, open_toast).
- After completing a task, call back_to_main to return to the navigator so future turns stay organized.

Credential rules:
- Never ask the user for 7shifts company/org name or identifiers; derive org and locations from the configured API token.
- Never ask the user for Toast restaurant GUID; retrieve it via the toast_restaurant_id endpoint and cache per session if needed.

Voice & Tone:
- Be concise, confident, and instructive.
- Respect the user’s time—focus on what to do next.
- Honor the legacy of Varuni: maintain order, ensure prosperity, and enable fluid operations.

Daily framing: Always relate insights to day-part and current business date when relevant (e.g., pre-service, mid-service, close). If the user’s request could change by time horizon (today vs tomorrow), state assumptions explicitly.

Operating rules: Ask concise clarifying questions before tool calls when ambiguity exists. Keep tool chatter internal in the sense that I don't want you to announce the tools you used or the tool sets you are navigating between. After tools finish, produce ONE concise markdown response with: key numbers, assumptions, and 1–3 next steps.
`;
  }, []);

  const startSession = useCallback(async () => {
    logMessage('Starting session...');
    setLogs([]);

    try {
      const instr = await buildInstructions();
      setComputedInstructions(instr);

      const response = await fetch('/api/varuni/chat/voice/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ voice: VOICE }),
      });

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = await response.json();
      const ephemeralKey = data.client_secret?.value;
      if (!ephemeralKey) {
        throw new Error('Ephemeral key not received.');
      }

      if (debugRef.current) {
        logMessage('Ephemeral Key Received: ***');
        logMessage(`WebRTC Session Id = ${data.id}`);
      }

      await initWebRTC(ephemeralKey);
      setIsSessionActive(true);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logMessage(`Error starting session: ${errorMessage}`);
      console.error('Error starting session:', error);
    }
  }, [logMessage, initWebRTC, buildInstructions]);

  const stopSession = useCallback(() => {
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.srcObject = null;
    }
    if (inputStreamRef.current) {
      try { inputStreamRef.current.getTracks().forEach(t => t.stop()); } catch { }
      inputStreamRef.current = null;
    }
    try { if (recognitionRef.current) { recognitionRef.current.stop?.(); recognitionRef.current = null; } } catch { }
    cleanupAnalyser();
    setIsSessionActive(false);
    setSpeakingText('');
    setToolStatus('');
    setMicVolume(0);
    setAgentVolume(0);
    logMessage('Session closed.');
  }, [logMessage, cleanupAnalyser]);

  const applyOutputDevice = useCallback(async (id: string) => {
    if (audioRef.current && typeof (audioRef.current as any).setSinkId === 'function') {
      try { await (audioRef.current as any).setSinkId(id); } catch (e) { console.warn('setSinkId failed', e); }
    }
  }, []);

  useEffect(() => {
    const onBeforeUnload = () => { try { stopSession(); } catch { } };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      try { stopSession(); } catch { }
    };
  }, [stopSession]);

  // Control bar UI
  return (
    <Card>
      <CardHeader>
        <CardTitle>Realtime Voice Chat</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-row flex-wrap gap-2 mb-3 items-center">
          {!isSessionActive ? (
            <Button onClick={startSession}>Start Listening</Button>
          ) : (
            <Button onClick={stopSession} variant="destructive">Stop Listening</Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="ml-auto">
                <SettingsIcon className="h-4 w-4 mr-2" /> Settings
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>Audio Settings</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="p-2 space-y-3">
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Microphone</div>
                  <select
                    className="w-full border rounded px-2 py-1 text-sm bg-background"
                    value={selectedInputId || ''}
                    onChange={async (e) => {
                      const id = e.target.value;
                      setSelectedInputId(id);
                      if (peerConnectionRef.current && (peerConnectionRef.current as any).__replaceMic__) {
                        await (peerConnectionRef.current as any).__replaceMic__(id);
                      }
                    }}
                  >
                    {inputDevices.map(d => (
                      <option key={d.deviceId || 'default'} value={d.deviceId || 'default'}>{d.label || 'Microphone'}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Speaker</div>
                  <select
                    className="w-full border rounded px-2 py-1 text-sm bg-background"
                    value={selectedOutputId || ''}
                    onChange={async (e) => { const id = e.target.value; setSelectedOutputId(id); await applyOutputDevice(id); }}
                  >
                    {outputDevices.map(d => (
                      <option key={d.deviceId || 'default'} value={d.deviceId || 'default'}>{d.label || 'Speaker'}</option>
                    ))}
                  </select>
                </div>
                <div className="pt-1">
                  <DropdownMenuItem onSelect={(e: any) => { e.preventDefault(); setShowDebug(v => !v); }}>
                    <span className="text-xs">{showDebug ? 'Hide' : 'Show'} debug logs</span>
                  </DropdownMenuItem>
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Visualizers + captions (centered, responsive) */}
        <div ref={vizRef} className="relative mb-3 rounded-lg border border-border/50 bg-background/20 backdrop-blur p-4 flex flex-col items-center justify-center min-h-[180px] overflow-hidden">
          {(() => {
            // Compute sizes and absolute positions: agent perfectly centered; user left and lower
            const w = Math.max(260, vizW || 360);
            const h = Math.max(200, vizH || 260);
            const agent0 = Math.max(140, Math.min(Math.floor(w * 0.66), Math.floor(h * 0.8)));
            const user0 = Math.max(36, Math.floor(agent0 * 0.24)); // significantly smaller than agent
            const horizontalGap = Math.max(24, Math.round(agent0 * 0.9));
            const availableWidth = Math.max(220, w - 24);
            const expandToWidth = availableWidth / (agent0 + horizontalGap + user0);
            const heightLimitScale = Math.min((h - 24) / Math.max(agent0, user0), 1.25);
            const scale = Math.min(expandToWidth, heightLimitScale);
            const agentSize = Math.round(agent0 * scale);
            const userSize = Math.round(user0 * scale);
            const agentLeft = Math.round(w / 2 - agentSize / 2);
            const agentUpShift = Math.round(agentSize * 0.08);
            const agentTop = Math.round(h / 2 - agentSize / 2 - agentUpShift);
            const userOffset = Math.round(agentSize * 0.34); // lower on Y than agent
            const userLeft = Math.max(12, Math.round(agentLeft - Math.max(horizontalGap, Math.round(agentSize * 0.35)) - userSize));
            const userTop = Math.round(h / 2 - userSize / 2 + userOffset);
            const containerHeight = Math.max(h, agentSize + Math.round(agentSize * 0.6));
            const agentOpacity = Math.max(0.55, Math.min(0.95, 0.65 + agentVolume * 0.35));
            const userOpacity = Math.max(0.5, Math.min(0.9, 0.6 + micVolume * 0.3));
            return (
              <div className="relative w-full" style={{ height: containerHeight + 'px' }}>
                {/* Agent centered */}
                <div className="absolute flex flex-col items-center justify-center gap-2" style={{ left: agentLeft + 'px', top: agentTop + 'px' }}>
                  <div
                    className="relative rounded-full backdrop-blur-xl backdrop-saturate-150 border border-white/20 shadow-2xl transition-transform bg-gradient-to-tr from-teal-300/15 to-teal-600/10 dark:from-teal-300/10 dark:to-teal-400/10 overflow-hidden"
                    style={{
                      width: agentSize + 'px',
                      height: agentSize + 'px',
                      boxShadow: `0 0 ${14 + agentVolume * 36}px rgba(20,184,166,0.6)`,
                      transform: `scale(${1 + agentVolume * 0.45})`,
                      opacity: agentOpacity,
                      filter: `brightness(${1 + agentVolume * 0.15}) saturate(${1 + agentVolume * 0.15})`,
                    }}
                    aria-label="Agent speaking level"
                  >
                    <div className="absolute -inset-5 rounded-full bg-teal-400/25 blur-2xl" style={{ opacity: 0.35 + agentVolume * 0.5, pointerEvents: 'none' as any }} />
                    <div className="absolute inset-0 rounded-full" style={{ background: 'radial-gradient( circle at 30% 30%, rgba(255,255,255,0.25), rgba(255,255,255,0) 60%)', mixBlendMode: 'screen' as any, pointerEvents: 'none' as any }} />
                  </div>
                  <div className="text-xs text-muted-foreground">Varuni</div>
                  {speakingText ? (
                    <div className="text-sm text-foreground/90 bg-muted/60/50 backdrop-blur-sm border border-border/60 rounded px-3 py-2 text-center max-w-full">
                      {speakingText}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">Ready</div>
                  )}
                </div>
                {/* User smaller, left, and lower */}
                <div className="absolute flex flex-col items-center justify-center gap-2" style={{ left: userLeft + 'px', top: userTop + 'px' }}>
                  <div
                    className="relative rounded-full backdrop-blur-xl backdrop-saturate-150 border border-white/20 shadow-xl transition-transform bg-gradient-to-tr from-zinc-300/15 to-zinc-600/10 dark:from-zinc-300/10 dark:to-zinc-500/10 overflow-hidden"
                    style={{
                      width: userSize + 'px',
                      height: userSize + 'px',
                      boxShadow: `0 0 ${10 + micVolume * 26}px rgba(113,113,122,0.5)`,
                      transform: `scale(${1 + micVolume * 0.35})`,
                      opacity: userOpacity,
                      filter: `brightness(${1 + micVolume * 0.12}) saturate(${1 + micVolume * 0.12})`,
                    }}
                    aria-label="Mic level"
                  >
                    <div className="absolute -inset-4 rounded-full bg-zinc-300/20 blur-2xl" style={{ opacity: 0.3 + micVolume * 0.45, pointerEvents: 'none' as any }} />
                    <div className="absolute inset-0 rounded-full" style={{ background: 'radial-gradient( circle at 30% 30%, rgba(255,255,255,0.22), rgba(255,255,255,0) 58%)', mixBlendMode: 'screen' as any, pointerEvents: 'none' as any }} />
                  </div>
                  <div className="text-xs text-muted-foreground">You</div>
                  {isSessionActive ? (
                    <div className="text-xs text-muted-foreground">Listening…</div>
                  ) : (
                    <div className="text-xs text-muted-foreground">Idle</div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
        {toolStatus && (
          <div className="mt-1 text-xs text-muted-foreground">{toolStatus}</div>
        )}

        {showDebug && (
          <div className="mt-4 p-4 border rounded-md bg-muted h-48 sm:h-64 overflow-y-auto">
            {logs.map((log, index) => (
              <p key={index} className="text-xs font-mono">
                {log}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
