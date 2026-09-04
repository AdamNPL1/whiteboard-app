"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  LoaderCircle,
  Maximize2,
  Mic,
  MicOff,
  Minus,
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  X,
} from "lucide-react";

import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useLanguage } from "@/lib/i18n";
import { reportRealtimeDiagnostics } from "@/lib/realtime-diagnostics";
import { getLocalVideoDirection } from "@/lib/call-video";
import {
  browserCallReducer,
  initialBrowserCallState,
} from "@/lib/browser-call-state";
import {
  CALL_SIGNAL_MAX_ATTEMPTS,
  CALL_SIGNAL_PROTOCOL_VERSION,
  callSignalRetryDelayMs,
  createPendingCallSignal,
  decideOfferCollision,
  isCallSignalEnvelope,
  isDurableCallSignal,
  shouldRetryCallSignal,
} from "@/lib/call-signaling";
import type {
  CallSignalData,
  CallSignalEnvelope,
  PendingCallSignal,
} from "@/lib/call-signaling";
import type {
  CallRecord,
  ParticipantConnectionState,
} from "@/lib/call-types";

type BoardContext = { id: string; name: string };
type CallParticipant = {
  userId: string;
  name: string;
  role: "owner" | "collaborator";
};
type CallPhase =
  | "idle"
  | "choosing"
  | "incoming"
  | "outgoing"
  | "connecting"
  | "connected"
  | "ended"
  | "error";
type CurrentUser = { id: string; name: string; email: string };
type CameraDevice = { deviceId: string; label: string };

type CallContextValue = {
  setBoardContext: (board: BoardContext | null) => void;
};

const CallContext = createContext<CallContextValue | null>(null);

const toParticipantConnectionState = (
  state: RTCPeerConnectionState | RTCIceConnectionState
): ParticipantConnectionState => {
  if (state === "connected" || state === "completed") return "connected";
  if (state === "disconnected") return "reconnecting";
  if (state === "failed" || state === "closed") return "failed";
  return "connecting";
};

const apiRequest = async <T,>(
  path: string,
  options?: RequestInit
): Promise<T> => {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
      ...options?.headers,
    },
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok) throw new Error(data.error || "Call request failed.");
  return data;
};

const readCandidateType = (candidate: RTCIceCandidateInit | RTCIceCandidate) => {
  if ("type" in candidate && typeof candidate.type === "string") {
    return candidate.type;
  }
  return candidate.candidate?.match(/\btyp\s+(host|srflx|prflx|relay)\b/i)?.[1]
    ?.toLowerCase();
};

const waitForIceGathering = async (
  connection: RTCPeerConnection,
  timeoutMs = 4_000
) => {
  if (connection.iceGatheringState === "complete") return;

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      connection.removeEventListener("icegatheringstatechange", handleChange);
      resolve();
    };
    const handleChange = () => {
      if (connection.iceGatheringState === "complete") finish();
    };
    const timeout = window.setTimeout(finish, timeoutMs);
    connection.addEventListener("icegatheringstatechange", handleChange);
  });
};

const getGatheredLocalDescription = async (connection: RTCPeerConnection) => {
  await waitForIceGathering(connection);
  if (!connection.localDescription) {
    throw new Error("LOCAL_DESCRIPTION_MISSING");
  }
  return connection.localDescription.toJSON();
};

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { text: t } = useLanguage();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [board, setBoard] = useState<BoardContext | null>(null);
  const [participants, setParticipants] = useState<CallParticipant[]>([]);
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [browserCallState, dispatchBrowserCall] = useReducer(
    browserCallReducer,
    initialBrowserCallState
  );
  const call = browserCallState.call;
  const [peerName, setPeerName] = useState("");
  const [callBoardName, setCallBoardName] = useState("");
  const [message, setMessage] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [remoteMuted, setRemoteMuted] = useState(false);
  const connectionState = browserCallState.connectionState;
  const setConnectionState = useCallback(
    (state: ParticipantConnectionState | "") =>
      dispatchBrowserCall({ type: "connection", state }),
    []
  );
  const [isRemoteAudioBlocked, setIsRemoteAudioBlocked] = useState(false);
  const [isCallToneBlocked, setIsCallToneBlocked] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isCameraStarting, setIsCameraStarting] = useState(false);
  const [cameraMessage, setCameraMessage] = useState("");
  const [cameraDevices, setCameraDevices] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [isRemoteVideoOn, setIsRemoteVideoOn] = useState(false);
  const [isCallPanelMinimized, setIsCallPanelMinimized] = useState(false);
  const [callPanelPosition, setCallPanelPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);

  const userRef = useRef<CurrentUser | null>(null);
  const callRef = useRef<CallRecord | null>(null);
  const phaseRef = useRef<CallPhase>("idle");
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const callChannelRef = useRef<RealtimeChannel | null>(null);
  const userChannelRef = useRef<RealtimeChannel | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localCameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const localCameraIntentRef = useRef(false);
  const localVideoSenderRef = useRef<RTCRtpSender | null>(null);
  const localVideoTransceiverRef = useRef<RTCRtpTransceiver | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoStreamRef = useRef<MediaStream | null>(null);
  const queuedCandidatesRef = useRef<
    Array<{ generation: number; candidate: RTCIceCandidateInit }>
  >([]);
  const seenSignalsRef = useRef(new Set<string>());
  const negotiationGenerationRef = useRef(0);
  const signalingVersionRef = useRef(1);
  const signalSequenceRef = useRef(0);
  const pendingSignalsRef = useRef(new Map<string, PendingCallSignal>());
  const signalRetryIntervalRef = useRef<number | null>(null);
  const signalingRecoveryRef = useRef<() => void>(() => undefined);
  const makingOfferRef = useRef(false);
  const ignoreOfferRef = useRef(false);
  const settingRemoteAnswerRef = useRef(false);
  const signalHandlerRef = useRef<(payload: unknown) => void>(() => undefined);
  const callPollRef = useRef<number | null>(null);
  const turnRefreshRef = useRef<number | null>(null);
  const connectionRetryRef = useRef<number | null>(null);
  const connectionTimeoutRef = useRef<number | null>(null);
  const callStatsIntervalRef = useRef<number | null>(null);
  const callStatsBusyRef = useRef(false);
  const identityRefreshRef = useRef<Promise<void> | null>(null);
  const identityRefreshQueuedRef = useRef(false);
  const activeCallsRequestRef = useRef<Promise<void> | null>(null);
  const callStatusPollBusyRef = useRef(false);
  const callHeartbeatRef = useRef<number | null>(null);
  const callHeartbeatBusyRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const localCandidateTypesRef = useRef(new Set<string>());
  const remoteCandidateTypesRef = useRef(new Set<string>());
  const isTerminatingCallRef = useRef(false);
  const callAudioContextRef = useRef<AudioContext | null>(null);
  const callSoundIntervalRef = useRef<number | null>(null);
  const activeCallTonesRef = useRef(new Set<OscillatorNode>());
  const callPanelRef = useRef<HTMLElement | null>(null);
  const callPanelDragRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  useEffect(() => {
    userRef.current = user;
  }, [user]);
  useEffect(() => {
    callRef.current = call;
    if (call?.status === "accepted") signalingVersionRef.current = call.version;
  }, [call]);
  useEffect(() => {
    phaseRef.current = phase;
    reportRealtimeDiagnostics({ callStage: phase });
  }, [phase]);

  const stopCallPoll = useCallback(() => {
    if (callPollRef.current !== null) {
      window.clearInterval(callPollRef.current);
      callPollRef.current = null;
    }
  }, []);

  const ensureCallAudioContext = useCallback(async () => {
    if (!callAudioContextRef.current) {
      callAudioContextRef.current = new AudioContext();
    }
    const context = callAudioContextRef.current;
    if (context.state === "suspended") {
      await Promise.race([
        context.resume().catch(() => undefined),
        new Promise<void>((resolve) => window.setTimeout(resolve, 250)),
      ]);
    }
    if (context.state !== "running") {
      setIsCallToneBlocked(true);
      throw new Error("Call sound requires a browser interaction.");
    }
    setIsCallToneBlocked(false);
    return context;
  }, []);

  const stopCallSounds = useCallback(() => {
    if (callSoundIntervalRef.current !== null) {
      window.clearInterval(callSoundIntervalRef.current);
      callSoundIntervalRef.current = null;
    }
    activeCallTonesRef.current.forEach((oscillator) => {
      try {
        oscillator.stop();
      } catch {
        // The tone may already have completed naturally.
      }
    });
    activeCallTonesRef.current.clear();
  }, []);

  const playCallTonePattern = useCallback(
    async (
      notes: Array<{ delay: number; frequency: number; duration: number }>,
      volume = 0.045
    ) => {
      const context = await ensureCallAudioContext();
      const startAt = context.currentTime + 0.015;
      notes.forEach(({ delay, frequency, duration }) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const noteStart = startAt + delay;
        const noteEnd = noteStart + duration;
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, noteStart);
        gain.gain.setValueAtTime(0.0001, noteStart);
        gain.gain.exponentialRampToValueAtTime(volume, noteStart + 0.025);
        gain.gain.setValueAtTime(volume, Math.max(noteStart + 0.03, noteEnd - 0.06));
        gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
        oscillator.connect(gain);
        gain.connect(context.destination);
        activeCallTonesRef.current.add(oscillator);
        oscillator.onended = () => {
          activeCallTonesRef.current.delete(oscillator);
          oscillator.disconnect();
          gain.disconnect();
        };
        oscillator.start(noteStart);
        oscillator.stop(noteEnd + 0.01);
      });
    },
    [ensureCallAudioContext]
  );

  const playIncomingCallTone = useCallback(
    () =>
      playCallTonePattern(
        [
          { delay: 0, frequency: 659.25, duration: 0.18 },
          { delay: 0.23, frequency: 783.99, duration: 0.22 },
        ],
        0.11
      ),
    [playCallTonePattern]
  );

  const playOutgoingCallTone = useCallback(
    () =>
      playCallTonePattern(
        [
          { delay: 0, frequency: 440, duration: 0.34 },
          { delay: 0.4, frequency: 523.25, duration: 0.34 },
        ],
        0.085
      ),
    [playCallTonePattern]
  );

  useEffect(() => {
    const unlockAudio = () => {
      void ensureCallAudioContext()
        .then(() => {
          if (phaseRef.current === "incoming") return playIncomingCallTone();
          if (phaseRef.current === "outgoing") return playOutgoingCallTone();
        })
        .catch(() => undefined);
    };
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, [ensureCallAudioContext, playIncomingCallTone, playOutgoingCallTone]);

  useEffect(() => {
    stopCallSounds();

    const playIncomingRing = () =>
      void playIncomingCallTone().catch(() => undefined);
    const playOutgoingRing = () =>
      void playOutgoingCallTone().catch(() => undefined);

    if (phase === "incoming") {
      playIncomingRing();
      callSoundIntervalRef.current = window.setInterval(playIncomingRing, 2_700);
    } else if (phase === "outgoing") {
      playOutgoingRing();
      callSoundIntervalRef.current = window.setInterval(playOutgoingRing, 2_900);
    } else if (phase === "ended") {
      void playCallTonePattern([
        { delay: 0, frequency: 587.33, duration: 0.16 },
        { delay: 0.15, frequency: 440, duration: 0.18 },
        { delay: 0.32, frequency: 329.63, duration: 0.24 },
      ], 0.1).catch(() => undefined);
    }

    return stopCallSounds;
  }, [phase, playCallTonePattern, playIncomingCallTone, playOutgoingCallTone, stopCallSounds]);

  const clearCallResources = useCallback(() => {
    stopCallSounds();
    stopCallPoll();
    if (turnRefreshRef.current !== null) {
      window.clearTimeout(turnRefreshRef.current);
      turnRefreshRef.current = null;
    }
    if (connectionRetryRef.current !== null) {
      window.clearTimeout(connectionRetryRef.current);
      connectionRetryRef.current = null;
    }
    if (connectionTimeoutRef.current !== null) {
      window.clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
    if (callStatsIntervalRef.current !== null) {
      window.clearInterval(callStatsIntervalRef.current);
      callStatsIntervalRef.current = null;
    }
    callStatsBusyRef.current = false;
    callStatusPollBusyRef.current = false;
    if (callHeartbeatRef.current !== null) {
      window.clearInterval(callHeartbeatRef.current);
      callHeartbeatRef.current = null;
    }
    callHeartbeatBusyRef.current = false;
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    queuedCandidatesRef.current = [];
    seenSignalsRef.current.clear();
    negotiationGenerationRef.current = 0;
    signalingVersionRef.current = 1;
    signalSequenceRef.current = 0;
    pendingSignalsRef.current.clear();
    makingOfferRef.current = false;
    ignoreOfferRef.current = false;
    settingRemoteAnswerRef.current = false;
    if (signalRetryIntervalRef.current !== null) {
      window.clearInterval(signalRetryIntervalRef.current);
      signalRetryIntervalRef.current = null;
    }
    reconnectAttemptsRef.current = 0;
    localCandidateTypesRef.current.clear();
    remoteCandidateTypesRef.current.clear();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    localCameraTrackRef.current = null;
    localCameraIntentRef.current = false;
    localVideoSenderRef.current = null;
    localVideoTransceiverRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    remoteVideoStreamRef.current = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setIsCameraOn(false);
    setIsCameraStarting(false);
    setCameraMessage("");
    setIsRemoteVideoOn(false);
    if (remoteAudioRef.current) {
      remoteAudioRef.current.onloadedmetadata = null;
      remoteAudioRef.current.srcObject = null;
    }
    setIsRemoteAudioBlocked(false);
    const channel = callChannelRef.current;
    callChannelRef.current = null;
    if (channel) void getSupabaseBrowserClient().removeChannel(channel);
  }, [stopCallPoll, stopCallSounds]);

  const persistCallTermination = useCallback(
    async (activeCall: CallRecord, action: "cancel" | "end") => {
      const retryDelays = [0, 1_000, 3_000];
      for (const delay of retryDelays) {
        if (delay) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, delay));
        }
        try {
          if (action === "end") {
            await apiRequest(`/api/calls/${activeCall.id}`, {
              method: "PATCH",
              body: JSON.stringify({
                action: "begin-ending",
                reason: "hangup_requested",
              }),
              keepalive: true,
            });
          }
          await apiRequest(`/api/calls/${activeCall.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              action,
              reason: action === "end" ? "local_hangup" : "caller_cancelled",
            }),
            keepalive: true,
          });
          return;
        } catch {
          // State transitions are idempotent, so a lost response can be retried.
        }
      }
    },
    []
  );

  const resetToIdle = useCallback(() => {
    // Close the UI and invalidate asynchronous call work first. Browser media
    // cleanup can occasionally throw on an already-closed track/connection;
    // that must never leave the terminal panel stuck on screen.
    phaseRef.current = "idle";
    callRef.current = null;
    isTerminatingCallRef.current = false;
    setPhase("idle");
    dispatchBrowserCall({ type: "clear" });
    setPeerName("");
    setCallBoardName("");
    setParticipants([]);
    setMessage("");
    setIsMuted(false);
    setRemoteMuted(false);
    setConnectionState("");
    setIsCallPanelMinimized(false);
    try {
      clearCallResources();
    } catch (error) {
      console.warn("Scriboo call cleanup completed with an error", error);
    }
  }, [clearCallResources, setConnectionState]);

  useEffect(() => {
    if (phase !== "ended") return;

    const timeout = window.setTimeout(resetToIdle, 4_000);
    return () => window.clearTimeout(timeout);
  }, [phase, resetToIdle]);

  const heartbeatCallId = call?.id;
  const heartbeatCallStatus = call?.status;

  useEffect(() => {
    if (
      !heartbeatCallId ||
      !["accepted", "ending"].includes(heartbeatCallStatus ?? "") ||
      !["connecting", "connected"].includes(phase)
    ) {
      return;
    }

    let cancelled = false;
    const sendHeartbeat = async () => {
      if (cancelled || callHeartbeatBusyRef.current) return;
      callHeartbeatBusyRef.current = true;
      try {
        await apiRequest(`/api/calls/${heartbeatCallId}/heartbeat`, {
          method: "POST",
        });
      } catch {
        // Transient failures are tolerated. The server expires a participant
        // only after the heartbeat lease becomes stale.
      } finally {
        callHeartbeatBusyRef.current = false;
      }
    };

    void sendHeartbeat();
    callHeartbeatRef.current = window.setInterval(() => {
      void sendHeartbeat();
    }, 15_000);
    const sendAfterResume = () => void sendHeartbeat();
    window.addEventListener("focus", sendAfterResume);
    document.addEventListener("visibilitychange", sendAfterResume);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", sendAfterResume);
      document.removeEventListener("visibilitychange", sendAfterResume);
      if (callHeartbeatRef.current !== null) {
        window.clearInterval(callHeartbeatRef.current);
        callHeartbeatRef.current = null;
      }
      callHeartbeatBusyRef.current = false;
    };
  }, [heartbeatCallId, heartbeatCallStatus, phase]);

  useEffect(() => {
    const finishOnPageExit = () => {
      const activeCall = callRef.current;
      if (!activeCall || activeCall.status === "ended") return;
      void fetch(`/api/calls/${activeCall.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: ["accepted", "ending"].includes(activeCall.status)
            ? "end"
            : "cancel",
          reason: "page_closed",
        }),
        cache: "no-store",
        keepalive: true,
      });
    };
    window.addEventListener("pagehide", finishOnPageExit);
    return () => window.removeEventListener("pagehide", finishOnPageExit);
  }, []);

  useEffect(() => {
    if (
      !call ||
      call.status !== "ringing" ||
      !["incoming", "outgoing", "connecting"].includes(phase)
    ) {
      return;
    }

    const expireCall = () => {
      if (userRef.current?.id === call.callerUserId) {
        void apiRequest<{ call: CallRecord }>(`/api/calls/${call.id}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "cancel" }),
        }).catch(() => undefined);
      }
      clearCallResources();
      setMessage(t("No answer.", "Brak odpowiedzi."));
      setPhase("ended");
    };

    const remaining = new Date(call.ringExpiresAt).getTime() - Date.now();
    if (remaining <= 0) {
      expireCall();
      return;
    }

    const timeout = window.setTimeout(expireCall, remaining);
    return () => window.clearTimeout(timeout);
  }, [call, clearCallResources, phase, t]);

  const getMicrophone = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        t(
          "This browser cannot access a microphone.",
          "Ta przeglądarka nie może uzyskać dostępu do mikrofonu."
        )
      );
    }

    try {
      const speechConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: { ideal: 1 },
      };

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: speechConstraints,
        video: false,
      });
      stream.getAudioTracks().forEach((track) => {
        try {
          track.contentHint = "speech";
        } catch {
          // Older browsers can expose contentHint as read-only. Audio still works.
        }
      });
      localStreamRef.current = stream;
      return stream;
    } catch {
      throw new Error(
        t(
          "Microphone permission was denied or no microphone is available.",
          "Odmówiono dostępu do mikrofonu lub mikrofon nie jest dostępny."
        )
      );
    }
  }, [t]);

  const sendSignal = useCallback(async (
    data: CallSignalData,
    version = signalingVersionRef.current,
    generation = negotiationGenerationRef.current
  ) => {
    const activeCall = callRef.current;
    const activeUser = userRef.current;
    const channel = callChannelRef.current;
    if (!activeCall || !activeUser || !channel) return;

    signalSequenceRef.current += 1;
    const envelope: CallSignalEnvelope = {
      protocolVersion: CALL_SIGNAL_PROTOCOL_VERSION,
      callId: activeCall.id,
      senderUserId: activeUser.id,
      messageId: crypto.randomUUID(),
      sentAt: Date.now(),
      sequenceNumber: signalSequenceRef.current,
      signalingVersion: version,
      generation,
      data,
    };
    if (isDurableCallSignal(data)) {
      await apiRequest(`/api/calls/${activeCall.id}/signals`, {
        method: "POST",
        body: JSON.stringify(envelope),
      });
    }
    if (data.kind !== "ack") {
      pendingSignalsRef.current.set(
        envelope.messageId,
        createPendingCallSignal(envelope)
      );
    }
    reportRealtimeDiagnostics({ callStage: `sending ${data.kind}`, error: "" });
    await channel.send({ type: "broadcast", event: "signal", payload: envelope });
  }, []);

  const createAndSendOffer = useCallback(async (iceRestart = false) => {
    const connection = peerConnectionRef.current;
    if (!connection || connection.signalingState !== "stable") return;
    const videoTransceiver = localVideoTransceiverRef.current;
    if (videoTransceiver && videoTransceiver.direction !== "stopped") {
      videoTransceiver.direction = getLocalVideoDirection(
        localCameraIntentRef.current && Boolean(localCameraTrackRef.current)
      );
    }
    makingOfferRef.current = true;
    try {
      negotiationGenerationRef.current += 1;
      const offer = await connection.createOffer(
        iceRestart ? { iceRestart: true } : undefined
      );
      await connection.setLocalDescription(offer);
      await sendSignal({
        kind: "offer",
        description: await getGatheredLocalDescription(connection),
      });
    } finally {
      makingOfferRef.current = false;
    }
  }, [sendSignal]);

  const requestRenegotiation = useCallback(async () => {
    const activeCall = callRef.current;
    const activeUser = userRef.current;
    if (!activeCall || !activeUser || phaseRef.current !== "connected") return;
    if (activeUser.id === activeCall.callerUserId) {
      await createAndSendOffer();
    } else {
      await sendSignal({ kind: "renegotiate" });
    }
  }, [createAndSendOffer, sendSignal]);

  const resendPendingSignals = useCallback(() => {
    const channel = callChannelRef.current;
    const activeCallId = callRef.current?.id;
    if (!channel || !activeCallId) return;
    const now = Date.now();
    for (const [messageId, pending] of pendingSignalsRef.current) {
      if (
        pending.envelope.callId !== activeCallId ||
        pending.expiresAt <= now ||
        pending.attempts >= CALL_SIGNAL_MAX_ATTEMPTS
      ) {
        pendingSignalsRef.current.delete(messageId);
        continue;
      }
      if (!shouldRetryCallSignal(pending, now)) continue;
      pending.attempts += 1;
      pending.nextAttemptAt = now + callSignalRetryDelayMs(pending.attempts);
      void channel.send({
        type: "broadcast",
        event: "signal",
        payload: pending.envelope,
      }).catch(() => undefined);
    }
  }, []);

  const connectCallChannel = useCallback(async (activeCall: CallRecord) => {
    const existing = callChannelRef.current;
    if (existing) await getSupabaseBrowserClient().removeChannel(existing);

    const supabase = getSupabaseBrowserClient();
    await supabase.realtime.setAuth();
    const channel = supabase.channel(`call:${activeCall.id}`, {
      config: {
        private: true,
        broadcast: { ack: true },
        presence: { key: userRef.current?.id ?? "participant" },
      },
    });
    channel.on("broadcast", { event: "signal" }, ({ payload }) => {
      signalHandlerRef.current(payload);
    });
    callChannelRef.current = channel;
    let subscribedOnce = false;

    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(
          () => reject(new Error("Realtime connection timed out.")),
          10_000
        );
        channel.subscribe((status, error) => {
          reportRealtimeDiagnostics({
            callStage: `signaling ${status.toLowerCase()}`,
            error: error?.message ?? "",
          });
          if (status === "SUBSCRIBED") {
            window.clearTimeout(timeout);
            if (subscribedOnce) {
              signalingRecoveryRef.current();
              for (const pending of pendingSignalsRef.current.values()) {
                pending.nextAttemptAt = 0;
              }
              resendPendingSignals();
            }
            subscribedOnce = true;
            resolve();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            window.clearTimeout(timeout);
            reject(error ?? new Error("Realtime connection failed."));
          }
        });
      });
    } catch (error) {
      if (callChannelRef.current === channel) callChannelRef.current = null;
      void supabase.removeChannel(channel);
      throw error;
    }
    if (signalRetryIntervalRef.current !== null) {
      window.clearInterval(signalRetryIntervalRef.current);
    }
    signalRetryIntervalRef.current = window.setInterval(resendPendingSignals, 500);
  }, [resendPendingSignals]);

  const refreshTurnConfiguration = useCallback(async (activeCall: CallRecord) => {
    const data = await apiRequest<{
      iceServers: RTCIceServer[];
      expiresAt: string;
    }>(`/api/calls/${activeCall.id}/turn-credentials`, { method: "POST" });
    peerConnectionRef.current?.setConfiguration({ iceServers: data.iceServers });

    if (turnRefreshRef.current !== null) window.clearTimeout(turnRefreshRef.current);
    const refreshIn = Math.max(
      60_000,
      new Date(data.expiresAt).getTime() - Date.now() - 10 * 60 * 1000
    );
    turnRefreshRef.current = window.setTimeout(() => {
      refreshTurnConfiguration(activeCall).catch(() => {
        setMessage(
          t(
            "The network relay could not be refreshed.",
            "Nie udało się odświeżyć połączenia przekaźnikowego."
          )
        );
      });
    }, refreshIn);
    return data.iceServers;
  }, [t]);

  const reportParticipantState = useCallback(
    (state: ParticipantConnectionState, reason: string) => {
      const activeCall = callRef.current;
      if (!activeCall) return;
      void apiRequest(`/api/calls/${activeCall.id}/participant-state`, {
        method: "PATCH",
        body: JSON.stringify({ connectionState: state, reason }),
        keepalive: true,
      }).catch(() => undefined);
    },
    []
  );

  const reportCallFailure = useCallback((reason: string) => {
    const activeCall = callRef.current;
    if (!activeCall || !["accepted", "ending"].includes(activeCall.status)) return;
    void apiRequest(`/api/calls/${activeCall.id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "report-failed", reason }),
      keepalive: true,
    }).catch(() => undefined);
  }, []);

  const flushQueuedCandidates = useCallback(async () => {
    const connection = peerConnectionRef.current;
    if (!connection?.remoteDescription) return;
    const candidates = queuedCandidatesRef.current.splice(0);
    for (const queued of candidates) {
      if (queued.generation > negotiationGenerationRef.current) {
        queuedCandidatesRef.current.push(queued);
      } else if (queued.generation === negotiationGenerationRef.current) {
        await connection.addIceCandidate(queued.candidate).catch(() => undefined);
      }
    }
  }, []);

  const preparePeerConnection = useCallback(
    async (activeCall: CallRecord, callerCreatesOffer: boolean) => {
      if (peerConnectionRef.current) return peerConnectionRef.current;
      setConnectionState("connecting");
      reportParticipantState("connecting", "peer_connection_started");
      const stream = await getMicrophone();
      const credentials = await apiRequest<{
        iceServers: RTCIceServer[];
        expiresAt: string;
      }>(`/api/calls/${activeCall.id}/turn-credentials`, { method: "POST" });
      const connection = new RTCPeerConnection({ iceServers: credentials.iceServers });
      peerConnectionRef.current = connection;
      reportRealtimeDiagnostics({
        callStage: callerCreatesOffer ? "creating caller connection" : "creating recipient connection",
        signalingState: connection.signalingState,
        iceState: connection.iceConnectionState,
        connectionState: connection.connectionState,
        reconnectAttempts: reconnectAttemptsRef.current,
        error: "",
      });
      stream.getTracks().forEach((track) => connection.addTrack(track, stream));
      const videoTransceiver = connection.addTransceiver("video", {
        direction: getLocalVideoDirection(false),
      });
      localVideoTransceiverRef.current = videoTransceiver;
      localVideoSenderRef.current = videoTransceiver.sender;

      connection.ontrack = (event) => {
        if (event.track.kind === "video") {
          const videoStream = event.streams[0] ?? new MediaStream([event.track]);
          remoteVideoStreamRef.current = videoStream;
          setIsRemoteVideoOn(!event.track.muted);
          event.track.onunmute = () => setIsRemoteVideoOn(true);
          event.track.onended = () => {
            if (remoteVideoStreamRef.current === videoStream) {
              remoteVideoStreamRef.current = null;
              setIsRemoteVideoOn(false);
            }
          };
          return;
        }
        const audio = remoteAudioRef.current;
        if (!audio) return;
        audio.srcObject = event.streams[0] ?? new MediaStream([event.track]);
        audio.muted = false;
        audio.volume = 1;
        const playRemoteAudio = () => {
          void audio
            .play()
            .then(() => setIsRemoteAudioBlocked(false))
            .catch(() => setIsRemoteAudioBlocked(true));
        };
        audio.onloadedmetadata = playRemoteAudio;
        event.track.onunmute = playRemoteAudio;
        playRemoteAudio();
      };
      connection.onicecandidate = (event) => {
        if (event.candidate) {
          const candidateType = readCandidateType(event.candidate);
          if (candidateType) localCandidateTypesRef.current.add(candidateType);
          void sendSignal({
            kind: "ice-candidate",
            candidate: event.candidate.toJSON(),
          });
        }
      };
      connection.onconnectionstatechange = () => {
        if (isTerminatingCallRef.current || phaseRef.current === "ended") return;
        setConnectionState(toParticipantConnectionState(connection.connectionState));
        reportRealtimeDiagnostics({
          connectionState: connection.connectionState,
          signalingState: connection.signalingState,
          iceState: connection.iceConnectionState,
          reconnectAttempts: reconnectAttemptsRef.current,
        });
        if (connection.connectionState === "connected") {
          reportParticipantState("connected", "ice_connected");
          if (connectionRetryRef.current !== null) {
            window.clearTimeout(connectionRetryRef.current);
            connectionRetryRef.current = null;
          }
          if (connectionTimeoutRef.current !== null) {
            window.clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = null;
          }
          setPhase("connected");
          setMessage("");
        } else if (connection.connectionState === "disconnected") {
          reportParticipantState("reconnecting", "ice_disconnected");
          const latestCall = callRef.current;
          if (
            latestCall &&
            connectionRetryRef.current === null &&
            userRef.current?.id === latestCall.callerUserId
          ) {
            connectionRetryRef.current = window.setTimeout(() => {
              connectionRetryRef.current = null;
              if (
                connection.connectionState === "connected" ||
                connection.connectionState === "closed"
              ) return;
              reconnectAttemptsRef.current += 1;
              void refreshTurnConfiguration(latestCall)
                .then(async () => {
                  await createAndSendOffer(true);
                })
                .catch(() => {
                  reportParticipantState("failed", "ice_restart_failed");
                  reportCallFailure("ice_restart_failed");
                });
            }, 4_000);
          }
        } else if (connection.connectionState === "failed") {
          reportParticipantState("reconnecting", "ice_restart_started");
          const activeUser = userRef.current;
          const latestCall = callRef.current;
          if (
            activeUser?.id === latestCall?.callerUserId &&
            reconnectAttemptsRef.current < 2
          ) {
            reconnectAttemptsRef.current += 1;
            reportRealtimeDiagnostics({ reconnectAttempts: reconnectAttemptsRef.current });
            void (async () => {
              await createAndSendOffer(true);
            })().catch(() => {
              reportParticipantState("failed", "ice_restart_failed");
              reportCallFailure("ice_restart_failed");
              setMessage(t("Connection lost.", "Połączenie zostało przerwane."));
            });
          } else {
            reportParticipantState("failed", "ice_restart_exhausted");
            reportCallFailure("ice_restart_exhausted");
            setMessage(t("Connection lost.", "Połączenie zostało przerwane."));
          }
        }
      };

      connection.oniceconnectionstatechange = () => {
        if (isTerminatingCallRef.current || phaseRef.current === "ended") return;
        setConnectionState(toParticipantConnectionState(connection.iceConnectionState));
        reportRealtimeDiagnostics({
          iceState: connection.iceConnectionState,
          connectionState: connection.connectionState,
        });
      };

      connection.onsignalingstatechange = () => {
        reportRealtimeDiagnostics({ signalingState: connection.signalingState });
      };

      if (callStatsIntervalRef.current !== null) {
        window.clearInterval(callStatsIntervalRef.current);
      }
      const collectCallStats = async () => {
        const reports = await connection.getStats();
        let packetsSent = 0;
        let packetsReceived = 0;
        let route = "unknown";
        reports.forEach((report) => {
          if (report.type === "outbound-rtp" && report.kind === "audio") {
            packetsSent += Number(report.packetsSent) || 0;
          }
          if (report.type === "inbound-rtp" && report.kind === "audio") {
            packetsReceived += Number(report.packetsReceived) || 0;
          }
          if (
            report.type === "candidate-pair" &&
            report.state === "succeeded" &&
            (report.nominated || report.selected)
          ) {
            const local = reports.get(report.localCandidateId);
            const remote = reports.get(report.remoteCandidateId);
            route =
              local?.candidateType === "relay" || remote?.candidateType === "relay"
                ? "TURN relay"
                : `${local?.candidateType ?? "unknown"} → ${remote?.candidateType ?? "unknown"}`;
          }
        });
        reportRealtimeDiagnostics({
          audioPacketsSent: packetsSent,
          audioPacketsReceived: packetsReceived,
          route,
        });
      };
      callStatsBusyRef.current = true;
      void collectCallStats()
        .catch(() => undefined)
        .finally(() => {
          callStatsBusyRef.current = false;
        });
      callStatsIntervalRef.current = window.setInterval(
        () => {
          if (callStatsBusyRef.current) return;
          callStatsBusyRef.current = true;
          void collectCallStats()
            .catch(() => undefined)
            .finally(() => {
              callStatsBusyRef.current = false;
            });
        },
        2_000
      );

      const refreshIn = Math.max(
        60_000,
        new Date(credentials.expiresAt).getTime() - Date.now() - 10 * 60 * 1000
      );
      turnRefreshRef.current = window.setTimeout(() => {
        refreshTurnConfiguration(activeCall).catch(() => undefined);
      }, refreshIn);

      if (callerCreatesOffer) {
        await createAndSendOffer();
      }

      if (connectionRetryRef.current === null) {
        connectionRetryRef.current = window.setTimeout(() => {
          const latestConnection = peerConnectionRef.current;
          const latestCall = callRef.current;
          if (
            !latestConnection ||
            !latestCall ||
            latestConnection.connectionState === "connected" ||
            userRef.current?.id !== latestCall.callerUserId
          ) {
            return;
          }
          reconnectAttemptsRef.current += 1;
          void refreshTurnConfiguration(latestCall)
            .then(async () => {
              latestConnection.restartIce();
              await createAndSendOffer(true);
            })
            .catch(() => undefined);
        }, 10_000);
      }

      if (connectionTimeoutRef.current === null) {
        connectionTimeoutRef.current = window.setTimeout(() => {
          void (async () => {
            const latestConnection = peerConnectionRef.current;
            const latestCall = callRef.current;
            if (
              !latestCall ||
              latestConnection?.connectionState === "connected" ||
              isTerminatingCallRef.current ||
              phaseRef.current === "ended"
            ) {
              return;
            }

            // A remote hang-up can reach the database at the same moment as the
            // connection diagnostic. Terminal call state must win that race.
            const refreshed = await apiRequest<{ call: CallRecord }>(
              `/api/calls/${latestCall.id}`
            ).catch(() => null);
            if (
              isTerminatingCallRef.current ||
              ["ended"].includes(phaseRef.current) ||
              peerConnectionRef.current?.connectionState === "connected"
            ) {
              return;
            }
            if (refreshed?.call.status === "ended") {
              isTerminatingCallRef.current = true;
              phaseRef.current = "ended";
              clearCallResources();
              setConnectionState("");
              setMessage(
                refreshed.call.outcome === "declined"
                  ? t("Call declined.", "Połączenie odrzucone.")
                  : refreshed.call.outcome === "missed"
                    ? t("No answer.", "Brak odpowiedzi.")
                    : refreshed.call.outcome === "unavailable"
                      ? t("The other person is unavailable.", "Druga osoba jest niedostępna.")
                      : refreshed.call.outcome === "failed"
                        ? t("The connection could not be established.", "Nie udało się nawiązać połączenia.")
                    : t("Call ended.", "Połączenie zakończone.")
              );
              setPhase("ended");
              return;
            }

            const relayAvailable = localCandidateTypesRef.current.has("relay");
            const remoteRelayReceived = remoteCandidateTypesRef.current.has("relay");
            isTerminatingCallRef.current = true;
            void sendSignal({ kind: "ended" }).catch(() => undefined);
            void apiRequest(`/api/calls/${latestCall.id}`, {
              method: "PATCH",
              body: JSON.stringify({
                action: "report-failed",
                reason: "connection_timeout",
              }),
              keepalive: true,
            }).catch(() => undefined);
            clearCallResources();
            setMessage(
              !relayAvailable
                ? t(
                  "The call could not reach the network relay. Check the network and try again. (ICE-R0)",
                  "PoÅ‚Ä…czenie nie mogÅ‚o dotrzeÄ‡ do przekaÅºnika sieciowego. SprawdÅº sieÄ‡ i sprÃ³buj ponownie. (ICE-R0)"
                )
                : !remoteRelayReceived
                  ? t(
                    "The network relay was available, but relay information was not received from the other device. Please try again. (ICE-R1)",
                    "PrzekaÅºnik sieciowy byÅ‚ dostÄ™pny, ale nie otrzymano informacji o przekaÅºniku z drugiego urzÄ…dzenia. SprÃ³buj ponownie. (ICE-R1)"
                  )
                  : t(
                    "Both devices reached the network relay, but the call could not connect. Please try again. (ICE-R2)",
                    "Oba urzÄ…dzenia dotarÅ‚y do przekaÅºnika sieciowego, ale nie udaÅ‚o siÄ™ poÅ‚Ä…czyÄ‡. SprÃ³buj ponownie. (ICE-R2)"
                  )
            );
            setPhase("error");
          })();
        }, 25_000);
      }
      return connection;
    },
    [clearCallResources, createAndSendOffer, getMicrophone, refreshTurnConfiguration, reportCallFailure, reportParticipantState, sendSignal, setConnectionState, t]
  );

  const finishRemoteCall = useCallback(
    (text: string) => {
      if (phaseRef.current === "ended" || isTerminatingCallRef.current) return;
      isTerminatingCallRef.current = true;
      phaseRef.current = "ended";
      clearCallResources();
      setConnectionState("");
      setMessage(text);
      setPhase("ended");
    },
    [clearCallResources, setConnectionState]
  );

  const handleSignal = useCallback(
    async (payload: unknown) => {
      if (!isCallSignalEnvelope(payload)) return;
      const activeCall = callRef.current;
      const activeUser = userRef.current;
      if (
        !activeCall ||
        !activeUser ||
        payload.callId !== activeCall.id ||
        payload.senderUserId === activeUser.id ||
        ![activeCall.callerUserId, activeCall.recipientUserId].includes(
          payload.senderUserId
        ) ||
        Math.abs(Date.now() - payload.sentAt) > 10 * 60 * 1000
      ) {
        return;
      }
      const signal = payload.data;
      if (signal.kind === "ack") {
        const pending = pendingSignalsRef.current.get(signal.acknowledgedMessageId);
        if (
          pending &&
          pending.envelope.sequenceNumber === signal.acknowledgedSequence &&
          pending.envelope.signalingVersion === payload.signalingVersion &&
          pending.envelope.generation === payload.generation
        ) {
          pendingSignalsRef.current.delete(signal.acknowledgedMessageId);
        }
        return;
      }
      const currentVersion = signalingVersionRef.current;
      if (
        (signal.kind === "accepted" && payload.signalingVersion < currentVersion) ||
        (signal.kind !== "accepted" && payload.signalingVersion !== currentVersion)
      ) return;
      void sendSignal(
        {
          kind: "ack",
          acknowledgedMessageId: payload.messageId,
          acknowledgedSequence: payload.sequenceNumber,
        },
        payload.signalingVersion,
        payload.generation
      ).catch(() => undefined);
      if (seenSignalsRef.current.has(payload.messageId)) return;
      seenSignalsRef.current.add(payload.messageId);
      if (seenSignalsRef.current.size > 500) {
        const oldestMessageId = seenSignalsRef.current.values().next().value;
        if (oldestMessageId) seenSignalsRef.current.delete(oldestMessageId);
      }

      if (
        signal.kind === "answer" &&
        payload.generation !== negotiationGenerationRef.current
      ) {
        return;
      }
      if (signal.kind === "offer") {
        if (payload.generation < negotiationGenerationRef.current) return;
        queuedCandidatesRef.current = queuedCandidatesRef.current.filter(
          (queued) => queued.generation >= payload.generation
        );
        negotiationGenerationRef.current = payload.generation;
      }
      reportRealtimeDiagnostics({ callStage: `received ${signal.kind}` });
      if (signal.kind === "accepted") {
        const authoritative = await apiRequest<{ call: CallRecord }>(
          `/api/calls/${activeCall.id}`
        ).catch(() => null);
        if (!authoritative || callRef.current?.id !== activeCall.id) return;
        dispatchBrowserCall({ type: "server-record", call: authoritative.call });
        callRef.current = authoritative.call;
        signalingVersionRef.current = authoritative.call.version;
        if (
          authoritative.call.status === "accepted" &&
          activeUser.id === activeCall.callerUserId
        ) {
          setPhase("connecting");
          await preparePeerConnection(authoritative.call, true);
        }
        return;
      }
      if (signal.kind === "declined") {
        const authoritative = await apiRequest<{ call: CallRecord }>(
          `/api/calls/${activeCall.id}`
        ).catch(() => null);
        if (
          authoritative?.call.status === "ended" &&
          authoritative.call.outcome === "declined" &&
          callRef.current?.id === activeCall.id
        ) {
          finishRemoteCall(t("Call declined.", "Połączenie odrzucone."));
        }
        return;
      }
      if (signal.kind === "ended") {
        const authoritative = await apiRequest<{ call: CallRecord }>(
          `/api/calls/${activeCall.id}`
        ).catch(() => null);
        if (
          authoritative?.call.status === "ended" &&
          callRef.current?.id === activeCall.id
        ) {
          finishRemoteCall(t("Call ended.", "Połączenie zakończone."));
        }
        return;
      }
      if (signal.kind === "mute") {
        setRemoteMuted(signal.muted);
        return;
      }
      if (signal.kind === "video-state") {
        // This signal describes only the other participant. Receiving it must
        // never request permission for or activate this browser's camera.
        if (!signal.enabled) {
          remoteVideoStreamRef.current = null;
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
          setIsRemoteVideoOn(false);
        }
        return;
      }
      if (signal.kind === "renegotiate") {
        if (activeUser.id === activeCall.callerUserId) {
          await createAndSendOffer();
        }
        return;
      }
      if (signal.kind === "offer") {
        if (phaseRef.current !== "connected") setPhase("connecting");
        const connection = await preparePeerConnection(activeCall, false);
        const polite = activeUser.id === activeCall.recipientUserId;
        const collision = decideOfferCollision({
          makingOffer: makingOfferRef.current,
          settingRemoteAnswer: settingRemoteAnswerRef.current,
          signalingState: connection.signalingState,
          polite,
        });
        ignoreOfferRef.current = collision.ignore;
        if (ignoreOfferRef.current) return;
        if (collision.rollback) {
          await connection.setLocalDescription({ type: "rollback" });
        }
        await connection.setRemoteDescription(signal.description);
        const videoTransceiver = localVideoTransceiverRef.current;
        if (videoTransceiver && videoTransceiver.direction !== "stopped") {
          videoTransceiver.direction = getLocalVideoDirection(
            localCameraIntentRef.current && Boolean(localCameraTrackRef.current)
          );
        }
        await flushQueuedCandidates();
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        await sendSignal({
          kind: "answer",
          description: await getGatheredLocalDescription(connection),
        });
        return;
      }
      if (signal.kind === "answer") {
        const connection = peerConnectionRef.current;
        if (!connection) return;
        settingRemoteAnswerRef.current = true;
        try {
          await connection.setRemoteDescription(signal.description);
          await flushQueuedCandidates();
          ignoreOfferRef.current = false;
        } finally {
          settingRemoteAnswerRef.current = false;
        }
        return;
      }
      if (signal.kind === "ice-candidate") {
        if (ignoreOfferRef.current) return;
        if (payload.generation < negotiationGenerationRef.current) return;
        const candidateType = readCandidateType(signal.candidate);
        if (candidateType) remoteCandidateTypesRef.current.add(candidateType);
        const connection = peerConnectionRef.current;
        if (
          payload.generation > negotiationGenerationRef.current ||
          !connection?.remoteDescription
        ) {
          queuedCandidatesRef.current.push({
            generation: payload.generation,
            candidate: signal.candidate,
          });
        } else {
          await connection.addIceCandidate(signal.candidate).catch(() => undefined);
        }
      }
    },
    [createAndSendOffer, finishRemoteCall, flushQueuedCandidates, preparePeerConnection, sendSignal, t]
  );
  signalHandlerRef.current = (payload) => {
    void handleSignal(payload).catch(() => {
      setMessage(t("Could not establish the audio connection.", "Nie udało się nawiązać połączenia audio."));
    });
  };

  const recoverSignaling = useCallback(async () => {
    const activeCall = callRef.current;
    if (!activeCall || activeCall.status !== "accepted") return;
    const version = signalingVersionRef.current;
    const recovered = await apiRequest<{ signals: CallSignalEnvelope[] }>(
      `/api/calls/${activeCall.id}/signals?version=${version}`
    );
    if (callRef.current?.id !== activeCall.id) return;
    for (const envelope of recovered.signals) {
      signalHandlerRef.current(envelope);
    }
  }, []);
  signalingRecoveryRef.current = () => {
    void recoverSignaling().catch(() => undefined);
  };

  useEffect(() => {
    const recoverAfterWake = () => {
      if (document.visibilityState === "hidden" || !navigator.onLine) return;
      void getSupabaseBrowserClient().realtime.setAuth().catch(() => undefined);
      void recoverSignaling().catch(() => undefined);
      for (const pending of pendingSignalsRef.current.values()) {
        pending.nextAttemptAt = 0;
      }
      resendPendingSignals();
    };
    const handleVisibility = () => recoverAfterWake();
    window.addEventListener("online", recoverAfterWake);
    window.addEventListener("pageshow", recoverAfterWake);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("online", recoverAfterWake);
      window.removeEventListener("pageshow", recoverAfterWake);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [recoverSignaling, resendPendingSignals]);

  const loadCallContext = useCallback(async (activeCall: CallRecord) => {
    const context = await apiRequest<{
      board: BoardContext;
      participants: CallParticipant[];
    }>(`/api/boards/${encodeURIComponent(activeCall.boardId)}/call-participants`);
    const otherUserId =
      activeCall.callerUserId === userRef.current?.id
        ? activeCall.recipientUserId
        : activeCall.callerUserId;
    return {
      boardName: context.board.name,
      peerName:
        context.participants.find((participant) => participant.userId === otherUserId)
          ?.name ?? t("Scriboo user", "Użytkownik Scriboo"),
    };
  }, [t]);

  const showIncomingCall = useCallback(
    async (incomingCall: CallRecord) => {
      if (phaseRef.current !== "idle" && callRef.current?.id !== incomingCall.id) return;
      const context = await loadCallContext(incomingCall);
      dispatchBrowserCall({ type: "select", call: incomingCall });
      callRef.current = incomingCall;
      setPeerName(context.peerName);
      setCallBoardName(context.boardName);
      setMessage("");
      setPhase("incoming");
    },
    [loadCallContext]
  );

  const loadActiveCalls = useCallback(async () => {
    if (!userRef.current) return;
    if (activeCallsRequestRef.current) return activeCallsRequestRef.current;
    const request = (async () => {
      const data = await apiRequest<{ calls: CallRecord[] }>("/api/calls");
      const current = callRef.current;
      if (current) {
        const refreshed = data.calls.find((candidate) => candidate.id === current.id);
        if (refreshed) {
          dispatchBrowserCall({ type: "server-record", call: refreshed });
        } else if (["incoming", "outgoing"].includes(phaseRef.current)) {
          clearCallResources();
          setMessage(t("No answer.", "Brak odpowiedzi."));
          setPhase("ended");
        }
        return;
      }
      const incoming = data.calls.find(
        (candidate) =>
          candidate.recipientUserId === userRef.current?.id && candidate.status === "ringing"
      );
      if (incoming) await showIncomingCall(incoming);
    })().finally(() => {
      activeCallsRequestRef.current = null;
    });
    activeCallsRequestRef.current = request;
    return request;
  }, [clearCallResources, showIncomingCall, t]);

  const refreshIdentity = useCallback(async () => {
    if (identityRefreshRef.current) {
      identityRefreshQueuedRef.current = true;
      return identityRefreshRef.current;
    }
    const request = (async () => {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        if (!response.ok) {
          setUser(null);
          return;
        }
        const data = (await response.json()) as { user?: CurrentUser | null };
        setUser(data.user?.id ? data.user : null);
      } catch {
        // A brief network interruption must not log the user out locally and
        // tear down calling while the authenticated session still exists.
      }
    })().finally(() => {
      identityRefreshRef.current = null;
      if (identityRefreshQueuedRef.current) {
        identityRefreshQueuedRef.current = false;
        window.setTimeout(() => void refreshIdentity(), 0);
      }
    });
    identityRefreshRef.current = request;
    return request;
  }, []);

  useEffect(() => {
    void refreshIdentity();
    const handleAppAuthChange = () => {
      void refreshIdentity();
    };
    window.addEventListener("scriboo-auth-changed", handleAppAuthChange);
    const supabase = getSupabaseBrowserClient();
    const { data } = supabase.auth.onAuthStateChange(() => {
      window.setTimeout(() => void refreshIdentity(), 0);
    });
    return () => {
      window.removeEventListener("scriboo-auth-changed", handleAppAuthChange);
      data.subscription.unsubscribe();
    };
  }, [refreshIdentity]);

  useEffect(() => {
    const existing = userChannelRef.current;
    if (existing) {
      void getSupabaseBrowserClient().removeChannel(existing);
      userChannelRef.current = null;
    }
    if (!user) {
      resetToIdle();
      return;
    }

    const supabase = getSupabaseBrowserClient();
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    let notificationReady = false;

    void (async () => {
      // This is a private topic. Subscribe only after the authenticated
      // Realtime token is ready, otherwise slower devices can silently miss
      // the instant event and wait for the polling fallback.
      await supabase.realtime.setAuth();
      if (cancelled) return;

      const nextChannel = supabase.channel(`user:${user.id}:calls`, {
        config: { private: true, broadcast: { ack: true } },
      });
      channel = nextChannel;
      nextChannel.on("broadcast", { event: "incoming-call" }, () => {
        reportRealtimeDiagnostics({ incomingCallStatus: "event received" });
        void loadActiveCalls().catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "Unknown API error";
          console.error("Scriboo could not load the incoming call", error);
          reportRealtimeDiagnostics({
            incomingCallStatus: "event load failed",
            error: `Incoming call load failed: ${message}`,
          });
        });
      });
      nextChannel.subscribe((status, subscriptionError) => {
        notificationReady = status === "SUBSCRIBED";
        const message = subscriptionError?.message?.trim();
        reportRealtimeDiagnostics({
          incomingCallStatus: status.toLowerCase(),
          error:
            status === "CHANNEL_ERROR" || status === "TIMED_OUT"
              ? `Incoming-call realtime ${status.toLowerCase()}${
                  message ? `: ${message}` : " (no server details returned)"
                }`
              : "",
        });
        if (subscriptionError) {
          console.error("Scriboo incoming-call subscription failed", {
            status,
            userId: user.id,
            error: subscriptionError,
          });
        }
      });
      userChannelRef.current = nextChannel;
    })().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Unknown setup error";
      console.error("Scriboo incoming-call realtime setup failed", error);
      reportRealtimeDiagnostics({
        incomingCallStatus: "setup error",
        error: `Incoming-call setup failed: ${message}`,
      });
    });

    let lastFallbackPollAt = 0;
    const pollForCalls = () => {
      const now = Date.now();
      // Realtime should deliver incoming calls instantly. Retain a slow safety
      // poll for missed events, and poll quickly only while the channel is down.
      if (notificationReady && now - lastFallbackPollAt < 30_000) return;
      lastFallbackPollAt = now;
      void loadActiveCalls().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Unknown API error";
        console.error("Scriboo incoming-call polling failed", error);
        reportRealtimeDiagnostics({
          incomingCallStatus: "poll failed",
          error: `Incoming-call polling failed: ${message}`,
        });
      });
    };
    pollForCalls();
    const poll = window.setInterval(
      pollForCalls,
      2_000
    );

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      if (userChannelRef.current === channel) userChannelRef.current = null;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [loadActiveCalls, resetToIdle, user]);

  const startStatusPoll = useCallback(
    (activeCall: CallRecord) => {
      stopCallPoll();
      callPollRef.current = window.setInterval(() => {
        if (callStatusPollBusyRef.current) return;
        callStatusPollBusyRef.current = true;
        void apiRequest<{ call: CallRecord }>(`/api/calls/${activeCall.id}`)
          .then(async ({ call: refreshed }) => {
            if (
              callRef.current?.id !== activeCall.id ||
              phaseRef.current === "idle" ||
              phaseRef.current === "ended"
            ) {
              return;
            }
            if (refreshed.version < (callRef.current?.version ?? 0)) return;
            dispatchBrowserCall({ type: "server-record", call: refreshed });
            callRef.current = refreshed;
            if (refreshed.status === "accepted") {
              signalingVersionRef.current = refreshed.version;
            }
            if (
              refreshed.status === "ringing" &&
              new Date(refreshed.ringExpiresAt).getTime() <= Date.now()
            ) {
              if (userRef.current?.id === refreshed.callerUserId) {
                void apiRequest(`/api/calls/${refreshed.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ action: "cancel" }),
                }).catch(() => undefined);
              }
              finishRemoteCall(t("No answer.", "Brak odpowiedzi."));
            } else if (
              refreshed.status === "accepted" &&
              userRef.current?.id === refreshed.callerUserId &&
              !peerConnectionRef.current
            ) {
              setPhase("connecting");
              await preparePeerConnection(refreshed, true);
            } else if (
              refreshed.status === "ended" &&
              refreshed.outcome === "declined"
            ) {
              finishRemoteCall(t("Call declined.", "Połączenie odrzucone."));
            } else if (refreshed.status === "ended") {
              finishRemoteCall(
                refreshed.outcome === "missed"
                  ? t("No answer.", "Brak odpowiedzi.")
                  : refreshed.outcome === "unavailable"
                    ? t("The other person is unavailable.", "Druga osoba jest niedostępna.")
                    : refreshed.outcome === "failed"
                      ? t("The connection could not be established.", "Nie udało się nawiązać połączenia.")
                  : t("Call ended.", "Połączenie zakończone.")
              );
            }
          })
          .catch(() => undefined)
          .finally(() => {
            callStatusPollBusyRef.current = false;
          });
      }, 2_000);
    },
    [finishRemoteCall, preparePeerConnection, stopCallPoll, t]
  );

  const startCall = useCallback(
    async (participant: CallParticipant) => {
      if (!board || !user) return;
      if (!navigator.onLine) {
        setMessage(t("You are offline.", "Jesteś offline."));
        setPhase("error");
        return;
      }
      phaseRef.current = "connecting";
      setParticipants([]);
      setMessage("");
      setPeerName(participant.name);
      setCallBoardName(board.name);
      setPhase("connecting");
      let createdCall: CallRecord | null = null;
      try {
        // Start the authorized call request and microphone preparation in
        // parallel. This removes the usual getUserMedia startup delay before
        // the recipient receives the incoming-call notification.
        const microphoneResult = getMicrophone().then(
          () => ({ error: null as Error | null }),
          (error: unknown) => ({
            error:
              error instanceof Error
                ? error
                : new Error("Could not access the microphone."),
          })
        );
        const data = await apiRequest<{ call: CallRecord }>("/api/calls", {
          method: "POST",
          body: JSON.stringify({
            boardId: board.id,
            recipientUserId: participant.userId,
            clientRequestId: crypto.randomUUID(),
          }),
        });
        createdCall = data.call;
        dispatchBrowserCall({ type: "select", call: data.call });
        callRef.current = data.call;
        setPhase("outgoing");
        const microphone = await microphoneResult;
        if (microphone.error) throw microphone.error;
        await connectCallChannel(data.call);
        startStatusPoll(data.call);
      } catch (error) {
        if (createdCall) {
          void persistCallTermination(createdCall, "cancel");
        }
        clearCallResources();
        setMessage(error instanceof Error ? error.message : "Could not start the call.");
        setPhase("error");
      }
    },
    [board, clearCallResources, connectCallChannel, getMicrophone, persistCallTermination, startStatusPoll, t, user]
  );

  const openCallChooser = useCallback(async () => {
    if (!board || !user || phaseRef.current !== "idle") return;
    phaseRef.current = "choosing";
    setMessage("");
    setPhase("choosing");
    try {
      const data = await apiRequest<{
        board: BoardContext;
        participants: CallParticipant[];
      }>(`/api/boards/${encodeURIComponent(board.id)}/call-participants`);
      if (data.participants.length === 0) {
        throw new Error(
          t(
            "Share this board with someone before starting a call.",
            "Udostępnij tę tablicę przed rozpoczęciem połączenia."
          )
        );
      }
      if (data.participants.length === 1) {
        await startCall(data.participants[0]);
        return;
      }
      setParticipants(data.participants);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not prepare the call.");
      setPhase("error");
    }
  }, [board, startCall, t, user]);

  const acceptCall = useCallback(async () => {
    const activeCall = callRef.current;
    if (!activeCall) return;
    if (phaseRef.current === "connecting" || phaseRef.current === "connected") return;
    phaseRef.current = "connecting";
    setMessage("");
    setPhase("connecting");
    setConnectionState("accepting");
    reportParticipantState("accepting", "accept_clicked");
    try {
      await getMicrophone();
      await connectCallChannel(activeCall);
      const data = await apiRequest<{ call: CallRecord }>(
        `/api/calls/${activeCall.id}`,
        { method: "PATCH", body: JSON.stringify({ action: "accept" }) }
      );
      dispatchBrowserCall({ type: "server-record", call: data.call });
      callRef.current = data.call;
      signalingVersionRef.current = data.call.version;
      await preparePeerConnection(data.call, false);
      await sendSignal({ kind: "accepted" });
      startStatusPoll(data.call);
    } catch (error) {
      const latestCall = callRef.current;
      if (latestCall?.id === activeCall.id) {
        void apiRequest(`/api/calls/${activeCall.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            action:
              latestCall.status === "accepted"
                ? "report-failed"
                : "report-unavailable",
            reason:
              latestCall.status === "accepted"
                ? "connection_setup_failed"
                : "media_unavailable",
          }),
          keepalive: true,
        }).catch(() => undefined);
      }
      clearCallResources();
      setMessage(error instanceof Error ? error.message : "Could not accept the call.");
      setPhase("error");
    }
  }, [clearCallResources, connectCallChannel, getMicrophone, preparePeerConnection, reportParticipantState, sendSignal, setConnectionState, startStatusPoll]);

  const declineCall = useCallback(async () => {
    const activeCall = callRef.current;
    if (!activeCall) return resetToIdle();
    // Close locally first. A slow API must never make Decline look frozen.
    resetToIdle();
    void apiRequest(`/api/calls/${activeCall.id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "decline" }),
    }).catch(() => undefined);
  }, [resetToIdle]);

  const endCall = useCallback(async () => {
    const activeCall = callRef.current;
    if (!activeCall) return resetToIdle();
    if (isTerminatingCallRef.current || phaseRef.current === "ended") return;
    isTerminatingCallRef.current = true;
    phaseRef.current = "ended";
    // Signal and persist in the background; local media and UI must close on
    // the click even when Realtime acknowledgement is delayed or unavailable.
    void sendSignal({ kind: "ended" }).catch(() => undefined);
    const action = activeCall.status === "accepted" ? "end" : "cancel";
    void persistCallTermination(activeCall, action);
    clearCallResources();
    setConnectionState("");
    setMessage(t("Call ended.", "Połączenie zakończone."));
    setPhase("ended");
  }, [clearCallResources, persistCallTermination, resetToIdle, sendSignal, setConnectionState, t]);

  const toggleMute = useCallback(() => {
    const nextMuted = !isMuted;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);
    void sendSignal({ kind: "mute", muted: nextMuted });
  }, [isMuted, sendSignal]);

  const stopCamera = useCallback(async () => {
    const cameraTrack = localCameraTrackRef.current;
    const videoSender = localVideoSenderRef.current;
    const videoTransceiver = localVideoTransceiverRef.current;
    localCameraTrackRef.current = null;
    localCameraIntentRef.current = false;
    if (cameraTrack) {
      cameraTrack.onended = null;
      localStreamRef.current?.removeTrack(cameraTrack);
      cameraTrack.stop();
    }
    if (videoSender) await videoSender.replaceTrack(null).catch(() => undefined);
    if (videoTransceiver && videoTransceiver.direction !== "stopped") {
      videoTransceiver.direction = getLocalVideoDirection(false);
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    setIsCameraOn(false);
    setIsCameraStarting(false);
    setCameraMessage("");
    if (phaseRef.current === "connected") {
      await sendSignal({ kind: "video-state", enabled: false }).catch(() => undefined);
      await requestRenegotiation().catch(() => undefined);
    }
  }, [requestRenegotiation, sendSignal]);

  const refreshCameraDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices
      .filter((device) => device.kind === "videoinput")
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `${t("Camera", "Kamera")} ${index + 1}`,
      }));
    setCameraDevices(cameras);
    setSelectedCameraId((current) =>
      current && cameras.some((camera) => camera.deviceId === current)
        ? current
        : cameras[0]?.deviceId ?? ""
    );
  }, [t]);

  useEffect(() => {
    if (phase !== "connected" || !navigator.mediaDevices) return;
    void refreshCameraDevices().catch(() => undefined);
    const handleDeviceChange = () => {
      void refreshCameraDevices().catch(() => undefined);
    };
    navigator.mediaDevices.addEventListener?.("devicechange", handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener?.("devicechange", handleDeviceChange);
    };
  }, [phase, refreshCameraDevices]);

  const startCamera = useCallback(async (cameraId = selectedCameraId) => {
    if (isCameraStarting || localCameraTrackRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraMessage(
        t(
          "This browser cannot access a camera.",
          "Ta przeglądarka nie może uzyskać dostępu do kamery."
        )
      );
      return;
    }

    setIsCameraStarting(true);
    localCameraIntentRef.current = true;
    setCameraMessage("");
    let cameraStream: MediaStream | null = null;
    try {
      const openCamera = (deviceId?: string) =>
        navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 24, max: 30 },
            facingMode: { ideal: "user" },
          },
        });

      try {
        cameraStream = await openCamera(cameraId || undefined);
      } catch (initialError) {
        if (
          initialError instanceof DOMException &&
          ["NotAllowedError", "SecurityError"].includes(initialError.name)
        ) {
          throw initialError;
        }

        // A laptop's default/integrated camera can be disabled or busy while a
        // USB webcam is healthy. Try every other detected camera before failing.
        const devices = await navigator.mediaDevices.enumerateDevices();
        const alternateCameraIds = devices
          .filter(
            (device) =>
              device.kind === "videoinput" &&
              Boolean(device.deviceId) &&
              device.deviceId !== cameraId
          )
          .map((device) => device.deviceId);
        for (const alternateCameraId of alternateCameraIds) {
          try {
            cameraStream = await openCamera(alternateCameraId);
            break;
          } catch {
            // Continue until all connected cameras have been tried.
          }
        }

        if (!cameraStream && cameraId) {
          try {
            cameraStream = await navigator.mediaDevices.getUserMedia({
              audio: false,
              video: true,
            });
          } catch {
            // Report the original error below; it best describes the failure.
          }
        }
        if (!cameraStream) throw initialError;
      }
      const cameraTrack = cameraStream.getVideoTracks()[0];
      if (!cameraTrack) throw new Error("CAMERA_TRACK_MISSING");
      const activeCameraId = cameraTrack.getSettings().deviceId;
      if (activeCameraId) setSelectedCameraId(activeCameraId);
      void refreshCameraDevices().catch(() => undefined);
      try {
        cameraTrack.contentHint = "motion";
      } catch {
        // The camera remains usable when a browser does not support content hints.
      }
      cameraTrack.onended = () => {
        if (localCameraTrackRef.current === cameraTrack) {
          void stopCamera();
          setCameraMessage(
            t("The camera was disconnected.", "Kamera została odłączona.")
          );
        }
      };
      localCameraTrackRef.current = cameraTrack;
      localStreamRef.current?.addTrack(cameraTrack);
      const connection = peerConnectionRef.current;
      if (!connection) throw new Error("PEER_CONNECTION_MISSING");
      let videoTransceiver = localVideoTransceiverRef.current;
      if (!videoTransceiver || videoTransceiver.direction === "stopped") {
        videoTransceiver = connection.addTransceiver(cameraTrack, {
          direction: getLocalVideoDirection(true),
          streams: [localStreamRef.current ?? cameraStream],
        });
        localVideoTransceiverRef.current = videoTransceiver;
        localVideoSenderRef.current = videoTransceiver.sender;
      } else {
        videoTransceiver.direction = getLocalVideoDirection(true);
        await videoTransceiver.sender.replaceTrack(cameraTrack);
        localVideoSenderRef.current = videoTransceiver.sender;
      }
      setIsCameraOn(true);
      try {
        await sendSignal({ kind: "video-state", enabled: true });
        await requestRenegotiation();
      } catch {
        // The camera opened successfully. A transient signaling failure must
        // not be presented as a missing camera or tear down the local preview.
        setCameraMessage(
          t(
            "Your camera is on, but the video connection could not be updated. Try turning video off and on again.",
            "Kamera jest włączona, ale nie udało się zaktualizować połączenia wideo. Wyłącz i włącz wideo ponownie."
          )
        );
      }
    } catch (error) {
      const failedTrack = localCameraTrackRef.current;
      const failedSender = localVideoSenderRef.current;
      const failedTransceiver = localVideoTransceiverRef.current;
      localCameraTrackRef.current = null;
      localCameraIntentRef.current = false;
      if (failedSender) await failedSender.replaceTrack(null).catch(() => undefined);
      if (failedTransceiver && failedTransceiver.direction !== "stopped") {
        failedTransceiver.direction = getLocalVideoDirection(false);
      }
      if (failedTrack) {
        failedTrack.onended = null;
        localStreamRef.current?.removeTrack(failedTrack);
        failedTrack.stop();
      }
      cameraStream?.getTracks().forEach((track) => {
        if (track !== failedTrack) track.stop();
      });
      setIsCameraOn(false);
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        setCameraMessage(
          t(
            "Camera access is blocked. Click the lock icon beside the address, allow Camera, then reload Scriboo.",
            "Dostęp do kamery jest zablokowany. Kliknij kłódkę obok adresu, zezwól na kamerę i odśwież Scriboo."
          )
        );
        return;
      }
      if (error instanceof DOMException && error.name === "NotReadableError") {
        setCameraMessage(
          t(
            "Windows can see the camera, but it is busy or unavailable. Close Camera, Zoom, Teams, OBS, or Discord, reconnect the USB webcam, then try again.",
            "Windows widzi kamerę, ale jest ona zajęta lub niedostępna. Zamknij aplikacje Kamera, Zoom, Teams, OBS lub Discord, podłącz ponownie kamerę USB i spróbuj jeszcze raz."
          )
        );
        return;
      }
      if (
        error instanceof DOMException &&
        ["NotFoundError", "OverconstrainedError"].includes(error.name)
      ) {
        setCameraMessage(
          t(
            "The selected camera is no longer available. Reconnect it or choose another camera from the list.",
            "Wybrana kamera nie jest już dostępna. Podłącz ją ponownie lub wybierz inną kamerę z listy."
          )
        );
        return;
      }
      setCameraMessage(
        t(
          "Camera permission was denied or no camera is available. Audio is still connected.",
          "Odmówiono dostępu do kamery lub kamera nie jest dostępna. Dźwięk nadal jest połączony."
        )
      );
    } finally {
      setIsCameraStarting(false);
    }
  }, [isCameraStarting, refreshCameraDevices, requestRenegotiation, selectedCameraId, sendSignal, stopCamera, t]);

  useEffect(() => {
    if (!isCameraOn || !localCameraTrackRef.current || !localVideoRef.current) return;
    localVideoRef.current.srcObject = new MediaStream([localCameraTrackRef.current]);
    void localVideoRef.current.play().catch(() => undefined);
  }, [isCameraOn]);

  useEffect(() => {
    const video = remoteVideoRef.current;
    if (!isRemoteVideoOn || !remoteVideoStreamRef.current || !video) return;
    video.srcObject = remoteVideoStreamRef.current;
    void video.play().catch(() => undefined);
  }, [isRemoteVideoOn]);

  useEffect(() => {
    return () => {
      clearCallResources();
      const audioContext = callAudioContextRef.current;
      callAudioContextRef.current = null;
      if (audioContext && audioContext.state !== "closed") {
        void audioContext.close().catch(() => undefined);
      }
      const channel = userChannelRef.current;
      if (channel) void getSupabaseBrowserClient().removeChannel(channel);
    };
  }, [clearCallResources]);

  const contextValue = useMemo(
    () => ({ setBoardContext: setBoard }),
    []
  );

  const statusText =
    phase === "incoming"
      ? t("Incoming call", "Połączenie przychodzące")
      : phase === "outgoing"
        ? t("Ringing…", "Dzwonienie…")
        : phase === "connecting"
          ? t("Connecting…", "Łączenie…")
          : phase === "connected"
            ? remoteMuted
              ? t("Connected · participant muted", "Połączono · uczestnik wyciszony")
              : t("Connected", "Połączono")
            : message;

  const beginCallPanelDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (
      (event.target as HTMLElement).closest(
        "button, input, select, option, label, video, audio, a"
      )
    ) return;
    const panel = callPanelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    callPanelDragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    setCallPanelPosition({ left: rect.left, top: rect.top });
  };

  const moveCallPanel = (event: React.PointerEvent<HTMLElement>) => {
    const drag = callPanelDragRef.current;
    const panel = callPanelRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !panel) return;
    event.preventDefault();
    const margin = 8;
    const rect = panel.getBoundingClientRect();
    setCallPanelPosition({
      left: Math.min(
        Math.max(margin, event.clientX - drag.offsetX),
        Math.max(margin, window.innerWidth - rect.width - margin)
      ),
      top: Math.min(
        Math.max(margin, event.clientY - drag.offsetY),
        Math.max(margin, window.innerHeight - rect.height - margin)
      ),
    });
  };

  const endCallPanelDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    callPanelDragRef.current = null;
  };

  return (
    <CallContext.Provider value={contextValue}>
      {children}
      <audio ref={remoteAudioRef} autoPlay playsInline hidden />

      {user && !board && phase === "idle" && (
        <button
          type="button"
          aria-label="Audio call is loading"
          disabled
          style={{
            position: "fixed",
            top: "7px",
            left: "112px",
            zIndex: 72,
            width: "34px",
            height: "34px",
            border: "none",
            borderRadius: "10px",
            background: "transparent",
            color: "#ffffff",
            display: "grid",
            placeItems: "center",
            opacity: 0.72,
            padding: 0,
          }}
        >
          <Phone size={16} />
        </button>
      )}

      {user && board && phase === "idle" && (
        <button
          type="button"
          aria-label={t(`Call from ${board.name}`, `Zadzwoń z tablicy ${board.name}`)}
          title={t("Start audio call", "Rozpocznij połączenie audio")}
          onClick={() => void openCallChooser()}
          style={{
            position: "fixed",
            top: "7px",
            left: "112px",
            zIndex: 72,
            width: "34px",
            height: "34px",
            borderRadius: "10px",
            border: "none",
            background: "transparent",
            backgroundColor: "transparent",
            backgroundImage: "none",
            color: "#ffffff",
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
            backdropFilter: "none",
            boxShadow: "none",
            outline: "none",
            appearance: "none",
            padding: 0,
            lineHeight: 0,
          }}
        >
          <Phone size={16} />
        </button>
      )}

      {phase === "choosing" && participants.length === 0 && (
        <div style={overlayStyle}>
          <div className="scriboo-call-dialog" style={dialogStyle} role="status" aria-live="polite">
            <LoaderCircle size={22} className="scriboo-call-spinner" />
            <span>{t("Preparing call…", "Przygotowywanie połączenia…")}</span>
          </div>
        </div>
      )}

      {phase === "choosing" && participants.length > 0 && (
        <div style={overlayStyle} role="presentation">
          <div className="scriboo-call-dialog" style={{ ...dialogStyle, width: "min(420px, calc(100vw - 32px))" }} role="dialog" aria-modal="true">
            <button type="button" aria-label={t("Close", "Zamknij")} onClick={resetToIdle} style={closeButtonStyle}>
              <X size={17} />
            </button>
            <strong style={{ fontSize: "18px" }}>{t("Who would you like to call?", "Do kogo chcesz zadzwonić?")}</strong>
            <span style={{ color: "#64748b", fontSize: "13px" }}>{board?.name}</span>
            <div style={{ display: "grid", gap: "8px", width: "100%" }}>
              {participants.map((participant) => (
                <button key={participant.userId} type="button" onClick={() => void startCall(participant)} style={participantButtonStyle}>
                  <Phone size={15} />
                  <span>{participant.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {phase !== "idle" && phase !== "choosing" && (
        <section
          ref={callPanelRef}
          className="scriboo-call-panel"
          aria-label={t("Audio call", "Połączenie audio")}
          onPointerDown={beginCallPanelDrag}
          onPointerMove={moveCallPanel}
          onPointerUp={endCallPanelDrag}
          onPointerCancel={endCallPanelDrag}
          style={{
            position: "fixed",
            right: callPanelPosition ? "auto" : "18px",
            left: callPanelPosition ? `${callPanelPosition.left}px` : "auto",
            top: callPanelPosition ? `${callPanelPosition.top}px` : "74px",
            zIndex: 210,
            width: "min(350px, calc(100vw - 36px))",
            maxHeight: "calc(100dvh - 92px)",
            overflowY: isCallPanelMinimized ? "hidden" : "auto",
            padding: isCallPanelMinimized ? "10px 12px" : "18px",
            borderRadius: "20px",
            border: "1px solid rgba(203,213,225,0.88)",
            background: "rgba(255,255,255,0.97)",
            color: "#0f172a",
            boxShadow: "0 24px 70px rgba(15,23,42,0.24)",
            backdropFilter: "blur(18px)",
            display: "grid",
            gap: isCallPanelMinimized ? 0 : "13px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: isCallPanelMinimized ? "9px" : "12px",
              cursor: callPanelDragRef.current ? "grabbing" : "grab",
              touchAction: "none",
              userSelect: "none",
            }}
          >
            <span style={{ width: "42px", height: "42px", borderRadius: "999px", background: "linear-gradient(135deg,#7c3aed,#60a5fa)", color: "white", display: "grid", placeItems: "center", flex: "0 0 auto" }}>
              <Phone size={18} />
            </span>
            <div style={{ minWidth: 0, display: "grid", gap: "3px", flex: 1 }}>
              <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{peerName || t("Audio call", "Połączenie audio")}</strong>
              <span style={{ color: "#64748b", fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{callBoardName}</span>
            </div>
            <button
              type="button"
              aria-label={isCallPanelMinimized ? t("Restore call panel", "Przywróć panel połączenia") : t("Minimize call panel", "Zminimalizuj panel połączenia")}
              title={isCallPanelMinimized ? t("Restore", "Przywróć") : t("Minimize", "Zminimalizuj")}
              onClick={() => setIsCallPanelMinimized((isMinimized) => !isMinimized)}
              style={{
                width: "32px",
                height: "32px",
                flex: "0 0 auto",
                border: "1px solid #e2e8f0",
                borderRadius: "9px",
                background: "#f8fafc",
                color: "#475569",
                display: "grid",
                placeItems: "center",
                padding: 0,
                cursor: "pointer",
              }}
            >
              {isCallPanelMinimized ? <Maximize2 size={15} /> : <Minus size={16} />}
            </button>
          </div>
          {!isCallPanelMinimized && (
            <>
          <div aria-live="polite" style={{ color: phase === "error" ? "#b91c1c" : "#475569", fontSize: "13px", fontWeight: 650 }}>
            {statusText || connectionState}
          </div>
          {phase === "connected" && (
            <label
              style={{
                display: "grid",
                gap: "8px",
                padding: "12px",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                background: "#f8fafc",
              }}
            >
              <span
                style={{
                  color: "#475569",
                  fontSize: "13px",
                  fontWeight: 650,
                }}
              >
                {t("Call volume", "Głośność rozmowy")}
              </span>

              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                defaultValue="1"
                aria-label={t("Call volume", "Głośność rozmowy")}
                onChange={(event) => {
                  if (remoteAudioRef.current) {
                    remoteAudioRef.current.volume = Number(event.target.value);
                  }
                }}
                style={{
                  width: "100%",
                  accentColor: "#7c3aed",
                  cursor: "pointer",
                }}
              />
            </label>
          )}
          {isCallToneBlocked && (phase === "incoming" || phase === "outgoing") && (
            <button
              type="button"
              onClick={() => {
                const playTone =
                  phase === "incoming" ? playIncomingCallTone : playOutgoingCallTone;
                void playTone().catch(() => undefined);
              }}
              style={{
                ...callActionStyle,
                minHeight: "38px",
                background: "#ede9fe",
                color: "#6d28d9",
              }}
            >
              {t("Enable call sound", "Włącz dźwięk połączenia")}
            </button>
          )}

          {phase === "connected" && isRemoteAudioBlocked && (
            <button
              type="button"
              onClick={() => {
                const audio = remoteAudioRef.current;
                if (!audio) return;
                void audio
                  .play()
                  .then(() => setIsRemoteAudioBlocked(false))
                  .catch(() => setIsRemoteAudioBlocked(true));
              }}
              style={{
                ...callActionStyle,
                background: "#ede9fe",
                color: "#6d28d9",
              }}
            >
              <Phone size={17} /> {t("Play audio", "Włącz dźwięk")}
            </button>
          )}

          {phase === "connected" && isRemoteVideoOn && (
            <div
              style={{
                position: "relative",
                overflow: "hidden",
                aspectRatio: "16 / 9",
                borderRadius: "14px",
                background: "#0f172a",
              }}
            >
              <video
                ref={remoteVideoRef}
                autoPlay
                muted
                playsInline
                aria-label={t("Participant video", "Wideo uczestnika")}
                style={{ width: "100%", height: "100%", display: "block", objectFit: "cover" }}
              />
              <span
                style={{
                  position: "absolute",
                  left: "9px",
                  bottom: "8px",
                  padding: "4px 8px",
                  borderRadius: "999px",
                  background: "rgba(15,23,42,0.68)",
                  color: "#ffffff",
                  fontSize: "10px",
                  fontWeight: 700,
                }}
              >
                {peerName || t("Participant", "Uczestnik")}
              </span>
            </div>
          )}

          {phase === "connected" && isCameraOn && (
            <div
              style={{
                position: "relative",
                overflow: "hidden",
                aspectRatio: "16 / 9",
                borderRadius: "14px",
                background: "#0f172a",
              }}
            >
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                aria-label={t("Your camera preview", "Podgląd Twojej kamery")}
                style={{
                  width: "100%",
                  height: "100%",
                  display: "block",
                  objectFit: "cover",
                  transform: "scaleX(-1)",
                }}
              />
              <span
                style={{
                  position: "absolute",
                  left: "9px",
                  bottom: "8px",
                  padding: "4px 8px",
                  borderRadius: "999px",
                  background: "rgba(15,23,42,0.68)",
                  color: "#ffffff",
                  fontSize: "10px",
                  fontWeight: 700,
                }}
              >
                {t("Local preview only", "Tylko lokalny podgląd")}
              </span>
            </div>
          )}

          {phase === "connected" && cameraMessage && (
            <div role="alert" style={{ color: "#b45309", fontSize: "12px", lineHeight: 1.45 }}>
              {cameraMessage}
            </div>
          )}

          {phase === "connected" && cameraDevices.length > 0 && (
            <label
              style={{
                display: "grid",
                gap: "5px",
                color: "#475569",
                fontSize: "11px",
                fontWeight: 700,
              }}
            >
              {t("Camera", "Kamera")}
              <select
                value={selectedCameraId}
                disabled={isCameraOn || isCameraStarting}
                onChange={(event) => {
                  setSelectedCameraId(event.target.value);
                  setCameraMessage("");
                }}
                style={{
                  width: "100%",
                  minWidth: 0,
                  height: "34px",
                  padding: "0 9px",
                  border: "1px solid #cbd5e1",
                  borderRadius: "9px",
                  background: isCameraOn ? "#f1f5f9" : "#ffffff",
                  color: "#334155",
                  fontSize: "12px",
                }}
              >
                {cameraDevices.map((camera) => (
                  <option key={camera.deviceId} value={camera.deviceId}>
                    {camera.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {phase === "incoming" ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "9px" }}>
              <button type="button" onClick={() => void declineCall()} style={{ ...callActionStyle, background: "#fee2e2", color: "#b91c1c" }}>
                <PhoneOff size={17} /> {t("Decline", "Odrzuć")}
              </button>
              <button type="button" onClick={() => void acceptCall()} style={{ ...callActionStyle, background: "#dcfce7", color: "#166534" }}>
                <Phone size={17} /> {t("Accept", "Odbierz")}
              </button>
            </div>
          ) : phase === "error" || phase === "ended" ? (
            <button type="button" onClick={resetToIdle} style={{ ...callActionStyle, background: "#f1f5f9", color: "#334155" }}>
              {t("Close", "Zamknij")}
            </button>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: phase === "outgoing" ? "1fr" : phase === "connected" ? "1fr 1fr 1fr" : "1fr 1fr", gap: "9px" }}>
              {phase !== "outgoing" && (
                <button type="button" onClick={toggleMute} aria-pressed={isMuted} style={{ ...callActionStyle, background: isMuted ? "#ede9fe" : "#f1f5f9", color: isMuted ? "#6d28d9" : "#334155" }}>
                  {isMuted ? <MicOff size={17} /> : <Mic size={17} />}
                  {isMuted ? t("Unmute", "Włącz mikrofon") : t("Mute", "Wycisz")}
                </button>
              )}
              {phase === "connected" && (
                <button
                  type="button"
                  onClick={() => (isCameraOn ? void stopCamera() : void startCamera(selectedCameraId))}
                  disabled={isCameraStarting}
                  aria-pressed={isCameraOn}
                  style={{
                    ...callActionStyle,
                    padding: "0 8px",
                    background: isCameraOn ? "#ede9fe" : "#f1f5f9",
                    color: isCameraOn ? "#6d28d9" : "#334155",
                    opacity: isCameraStarting ? 0.68 : 1,
                  }}
                >
                  {isCameraOn ? <VideoOff size={17} /> : <Video size={17} />}
                  {isCameraStarting
                    ? t("Starting…", "Uruchamianie…")
                    : isCameraOn
                      ? t("Stop video", "Wyłącz wideo")
                      : t("Start video", "Włącz wideo")}
                </button>
              )}
              <button type="button" onClick={() => void endCall()} style={{ ...callActionStyle, background: "#fee2e2", color: "#b91c1c" }}>
                <PhoneOff size={17} /> {phase === "outgoing" ? t("Cancel", "Anuluj") : t("End", "Zakończ")}
              </button>
            </div>
          )}
            </>
          )}
        </section>
      )}
    </CallContext.Provider>
  );
}

export function useCall() {
  const context = useContext(CallContext);
  if (!context) throw new Error("useCall must be used inside CallProvider");
  return context;
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 205,
  display: "grid",
  placeItems: "center",
  padding: "16px",
  background: "rgba(15,23,42,0.34)",
  backdropFilter: "blur(6px)",
};
const dialogStyle: React.CSSProperties = {
  position: "relative",
  minWidth: "240px",
  padding: "22px",
  borderRadius: "18px",
  background: "#ffffff",
  color: "#0f172a",
  boxShadow: "0 28px 80px rgba(15,23,42,0.28)",
  display: "grid",
  justifyItems: "center",
  gap: "12px",
};
const closeButtonStyle: React.CSSProperties = {
  position: "absolute",
  top: "10px",
  right: "10px",
  width: "32px",
  height: "32px",
  borderRadius: "9px",
  border: "1px solid #e2e8f0",
  background: "#ffffff",
  color: "#475569",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
};
const participantButtonStyle: React.CSSProperties = {
  minHeight: "46px",
  padding: "0 14px",
  borderRadius: "12px",
  border: "1px solid #ddd6fe",
  background: "#f5f3ff",
  color: "#5b21b6",
  display: "flex",
  alignItems: "center",
  gap: "10px",
  fontSize: "14px",
  fontWeight: 750,
  cursor: "pointer",
};
const callActionStyle: React.CSSProperties = {
  minHeight: "42px",
  padding: "0 13px",
  borderRadius: "12px",
  border: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "7px",
  fontSize: "13px",
  fontWeight: 800,
  cursor: "pointer",
};
