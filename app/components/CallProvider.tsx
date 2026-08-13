"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  LoaderCircle,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  X,
} from "lucide-react";

import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useLanguage } from "@/lib/i18n";

type BoardContext = { id: string; name: string };
type CallParticipant = {
  userId: string;
  name: string;
  role: "owner" | "collaborator";
};
type CallStatus =
  | "ringing"
  | "accepted"
  | "declined"
  | "cancelled"
  | "missed"
  | "ended";
type CallRecord = {
  id: string;
  boardId: string;
  callerUserId: string;
  recipientUserId: string;
  status: CallStatus;
  createdAt: string;
  updatedAt: string;
  ringExpiresAt: string;
  expiresAt: string;
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
type SignalData =
  | { kind: "accepted" }
  | { kind: "declined" }
  | { kind: "ended" }
  | { kind: "mute"; muted: boolean }
  | { kind: "video-state"; enabled: boolean }
  | { kind: "renegotiate" }
  | { kind: "offer"; description: RTCSessionDescriptionInit }
  | { kind: "answer"; description: RTCSessionDescriptionInit }
  | { kind: "ice-candidate"; candidate: RTCIceCandidateInit };
type SignalEnvelope = {
  callId: string;
  senderUserId: string;
  messageId: string;
  sentAt: number;
  data: SignalData;
};
type CurrentUser = { id: string; name: string; email: string };

type CallContextValue = {
  setBoardContext: (board: BoardContext | null) => void;
};

const CallContext = createContext<CallContextValue | null>(null);

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

const isSignalEnvelope = (value: unknown): value is SignalEnvelope => {
  if (!value || typeof value !== "object") return false;
  const signal = value as Partial<SignalEnvelope>;
  return (
    typeof signal.callId === "string" &&
    typeof signal.senderUserId === "string" &&
    typeof signal.messageId === "string" &&
    typeof signal.sentAt === "number" &&
    Boolean(signal.data && typeof signal.data === "object")
  );
};

const readCandidateType = (candidate: RTCIceCandidateInit | RTCIceCandidate) => {
  if ("type" in candidate && typeof candidate.type === "string") {
    return candidate.type;
  }
  return candidate.candidate?.match(/\btyp\s+(host|srflx|prflx|relay)\b/i)?.[1]
    ?.toLowerCase();
};

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { text: t } = useLanguage();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [board, setBoard] = useState<BoardContext | null>(null);
  const [participants, setParticipants] = useState<CallParticipant[]>([]);
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [call, setCall] = useState<CallRecord | null>(null);
  const [peerName, setPeerName] = useState("");
  const [callBoardName, setCallBoardName] = useState("");
  const [message, setMessage] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [remoteMuted, setRemoteMuted] = useState(false);
  const [connectionState, setConnectionState] = useState("");
  const [isRemoteAudioBlocked, setIsRemoteAudioBlocked] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isCameraStarting, setIsCameraStarting] = useState(false);
  const [cameraMessage, setCameraMessage] = useState("");
  const [isRemoteVideoOn, setIsRemoteVideoOn] = useState(false);

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
  const localVideoSenderRef = useRef<RTCRtpSender | null>(null);
  const localVideoTransceiverRef = useRef<RTCRtpTransceiver | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoStreamRef = useRef<MediaStream | null>(null);
  const queuedCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const seenSignalsRef = useRef(new Set<string>());
  const signalHandlerRef = useRef<(payload: unknown) => void>(() => undefined);
  const callPollRef = useRef<number | null>(null);
  const turnRefreshRef = useRef<number | null>(null);
  const connectionRetryRef = useRef<number | null>(null);
  const connectionTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const localCandidateTypesRef = useRef(new Set<string>());
  const remoteCandidateTypesRef = useRef(new Set<string>());
  const isTerminatingCallRef = useRef(false);

  useEffect(() => {
    userRef.current = user;
  }, [user]);
  useEffect(() => {
    callRef.current = call;
  }, [call]);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const stopCallPoll = useCallback(() => {
    if (callPollRef.current !== null) {
      window.clearInterval(callPollRef.current);
      callPollRef.current = null;
    }
  }, []);

  const clearCallResources = useCallback(() => {
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
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    queuedCandidatesRef.current = [];
    reconnectAttemptsRef.current = 0;
    localCandidateTypesRef.current.clear();
    remoteCandidateTypesRef.current.clear();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    localCameraTrackRef.current = null;
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
  }, [stopCallPoll]);

  const resetToIdle = useCallback(() => {
    clearCallResources();
    setCall(null);
    setPeerName("");
    setCallBoardName("");
    setParticipants([]);
    setMessage("");
    setIsMuted(false);
    setRemoteMuted(false);
    setConnectionState("");
    isTerminatingCallRef.current = false;
    setPhase("idle");
  }, [clearCallResources]);

  useEffect(() => {
    if (phase !== "ended") return;

    const timeout = window.setTimeout(resetToIdle, 4_000);
    return () => window.clearTimeout(timeout);
  }, [phase, resetToIdle]);

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

  const sendSignal = useCallback(async (data: SignalData) => {
    const activeCall = callRef.current;
    const activeUser = userRef.current;
    const channel = callChannelRef.current;
    if (!activeCall || !activeUser || !channel) return;

    const envelope: SignalEnvelope = {
      callId: activeCall.id,
      senderUserId: activeUser.id,
      messageId: crypto.randomUUID(),
      sentAt: Date.now(),
      data,
    };
    await channel.send({ type: "broadcast", event: "signal", payload: envelope });
  }, []);

  const createAndSendOffer = useCallback(async () => {
    const connection = peerConnectionRef.current;
    if (!connection || connection.signalingState !== "stable") return;
    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    await sendSignal({ kind: "offer", description: offer });
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

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(
        () => reject(new Error("Realtime connection timed out.")),
        10_000
      );
      channel.subscribe((status, error) => {
        if (status === "SUBSCRIBED") {
          window.clearTimeout(timeout);
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          window.clearTimeout(timeout);
          reject(error ?? new Error("Realtime connection failed."));
        }
      });
    });
    callChannelRef.current = channel;
  }, []);

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

  const flushQueuedCandidates = useCallback(async () => {
    const connection = peerConnectionRef.current;
    if (!connection?.remoteDescription) return;
    const candidates = queuedCandidatesRef.current.splice(0);
    for (const candidate of candidates) {
      await connection.addIceCandidate(candidate).catch(() => undefined);
    }
  }, []);

  const preparePeerConnection = useCallback(
    async (activeCall: CallRecord, callerCreatesOffer: boolean) => {
      if (peerConnectionRef.current) return peerConnectionRef.current;
      const stream = await getMicrophone();
      const credentials = await apiRequest<{
        iceServers: RTCIceServer[];
        expiresAt: string;
      }>(`/api/calls/${activeCall.id}/turn-credentials`, { method: "POST" });
      const connection = new RTCPeerConnection({ iceServers: credentials.iceServers });
      peerConnectionRef.current = connection;
      stream.getTracks().forEach((track) => connection.addTrack(track, stream));
      const videoTransceiver = connection.addTransceiver("video", {
        direction: "recvonly",
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
        setConnectionState(connection.connectionState);
        if (connection.connectionState === "connected") {
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
        } else if (connection.connectionState === "failed") {
          const activeUser = userRef.current;
          const latestCall = callRef.current;
          if (
            activeUser?.id === latestCall?.callerUserId &&
            reconnectAttemptsRef.current < 2
          ) {
            reconnectAttemptsRef.current += 1;
            void (async () => {
              const offer = await connection.createOffer({ iceRestart: true });
              await connection.setLocalDescription(offer);
              await sendSignal({ kind: "offer", description: offer });
            })().catch(() => {
              setMessage(t("Connection lost.", "Połączenie zostało przerwane."));
            });
          } else {
            setMessage(t("Connection lost.", "Połączenie zostało przerwane."));
          }
        }
      };

      connection.oniceconnectionstatechange = () => {
        if (isTerminatingCallRef.current || phaseRef.current === "ended") return;
        setConnectionState(connection.iceConnectionState);
      };

      const refreshIn = Math.max(
        60_000,
        new Date(credentials.expiresAt).getTime() - Date.now() - 10 * 60 * 1000
      );
      turnRefreshRef.current = window.setTimeout(() => {
        refreshTurnConfiguration(activeCall).catch(() => undefined);
      }, refreshIn);

      if (callerCreatesOffer) {
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        await sendSignal({ kind: "offer", description: offer });
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
              const retryOffer = await latestConnection.createOffer({ iceRestart: true });
              await latestConnection.setLocalDescription(retryOffer);
              await sendSignal({ kind: "offer", description: retryOffer });
            })
            .catch(() => undefined);
        }, 10_000);
      }

      if (connectionTimeoutRef.current === null) {
        connectionTimeoutRef.current = window.setTimeout(() => {
          const latestConnection = peerConnectionRef.current;
          const latestCall = callRef.current;
          if (!latestCall || latestConnection?.connectionState === "connected") return;

          const relayAvailable = localCandidateTypesRef.current.has("relay");
          const remoteRelayReceived = remoteCandidateTypesRef.current.has("relay");
          void sendSignal({ kind: "ended" }).catch(() => undefined);
          void apiRequest(`/api/calls/${latestCall.id}`, {
            method: "PATCH",
            body: JSON.stringify({ action: "end" }),
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
        }, 25_000);
      }
      return connection;
    },
    [clearCallResources, getMicrophone, refreshTurnConfiguration, sendSignal, t]
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
    [clearCallResources]
  );

  const handleSignal = useCallback(
    async (payload: unknown) => {
      if (!isSignalEnvelope(payload)) return;
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
        Math.abs(Date.now() - payload.sentAt) > 2 * 60 * 1000 ||
        seenSignalsRef.current.has(payload.messageId)
      ) {
        return;
      }
      seenSignalsRef.current.add(payload.messageId);
      if (seenSignalsRef.current.size > 500) seenSignalsRef.current.clear();

      const signal = payload.data;
      if (signal.kind === "accepted") {
        if (activeUser.id === activeCall.callerUserId) {
          setPhase("connecting");
          await preparePeerConnection(activeCall, true);
        }
        return;
      }
      if (signal.kind === "declined") {
        finishRemoteCall(t("Call declined.", "Połączenie odrzucone."));
        return;
      }
      if (signal.kind === "ended") {
        finishRemoteCall(t("Call ended.", "Połączenie zakończone."));
        return;
      }
      if (signal.kind === "mute") {
        setRemoteMuted(signal.muted);
        return;
      }
      if (signal.kind === "video-state") {
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
        if (connection.signalingState !== "stable") return;
        await connection.setRemoteDescription(signal.description);
        await flushQueuedCandidates();
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        await sendSignal({ kind: "answer", description: answer });
        return;
      }
      if (signal.kind === "answer") {
        const connection = peerConnectionRef.current;
        if (!connection) return;
        await connection.setRemoteDescription(signal.description);
        await flushQueuedCandidates();
        return;
      }
      if (signal.kind === "ice-candidate") {
        const candidateType = readCandidateType(signal.candidate);
        if (candidateType) remoteCandidateTypesRef.current.add(candidateType);
        const connection = peerConnectionRef.current;
        if (!connection?.remoteDescription) {
          queuedCandidatesRef.current.push(signal.candidate);
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
      setCall(incomingCall);
      setPeerName(context.peerName);
      setCallBoardName(context.boardName);
      setMessage("");
      setPhase("incoming");
    },
    [loadCallContext]
  );

  const loadActiveCalls = useCallback(async () => {
    if (!userRef.current) return;
    const data = await apiRequest<{ calls: CallRecord[] }>("/api/calls");
    const current = callRef.current;
    if (current) {
      const refreshed = data.calls.find((candidate) => candidate.id === current.id);
      if (refreshed) {
        setCall(refreshed);
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
  }, [clearCallResources, showIncomingCall, t]);

  const refreshIdentity = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      if (!response.ok) {
        setUser(null);
        return;
      }
      const data = (await response.json()) as { user?: CurrentUser | null };
      setUser(data.user?.id ? data.user : null);
    } catch {
      setUser(null);
    }
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
    void supabase.realtime.setAuth();
    const channel = supabase.channel(`user:${user.id}:calls`, {
      config: { private: true, broadcast: { ack: true } },
    });
    channel.on("broadcast", { event: "incoming-call" }, () => {
      void loadActiveCalls().catch(() => undefined);
    });
    channel.subscribe();
    userChannelRef.current = channel;
    void loadActiveCalls().catch(() => undefined);
    const poll = window.setInterval(
      () => void loadActiveCalls().catch(() => undefined),
      15_000
    );

    return () => {
      window.clearInterval(poll);
      if (userChannelRef.current === channel) userChannelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [loadActiveCalls, resetToIdle, user]);

  const startStatusPoll = useCallback(
    (activeCall: CallRecord) => {
      stopCallPoll();
      callPollRef.current = window.setInterval(() => {
        void apiRequest<{ call: CallRecord }>(`/api/calls/${activeCall.id}`)
          .then(async ({ call: refreshed }) => {
            setCall(refreshed);
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
            } else if (refreshed.status === "declined") {
              finishRemoteCall(t("Call declined.", "Połączenie odrzucone."));
            } else if (
              ["cancelled", "missed", "ended"].includes(refreshed.status)
            ) {
              finishRemoteCall(
                refreshed.status === "missed"
                  ? t("No answer.", "Brak odpowiedzi.")
                  : t("Call ended.", "Połączenie zakończone.")
              );
            }
          })
          .catch(() => undefined);
      }, 2_000);
    },
    [finishRemoteCall, preparePeerConnection, stopCallPoll, t]
  );

  const startCall = useCallback(
    async (participant: CallParticipant) => {
      if (!board || !user) return;
      setParticipants([]);
      setMessage("");
      setPeerName(participant.name);
      setCallBoardName(board.name);
      setPhase("connecting");
      try {
        await getMicrophone();
        const data = await apiRequest<{ call: CallRecord }>("/api/calls", {
          method: "POST",
          body: JSON.stringify({
            boardId: board.id,
            recipientUserId: participant.userId,
          }),
        });
        setCall(data.call);
        callRef.current = data.call;
        setPhase("outgoing");
        await connectCallChannel(data.call);
        startStatusPoll(data.call);
      } catch (error) {
        clearCallResources();
        setMessage(error instanceof Error ? error.message : "Could not start the call.");
        setPhase("error");
      }
    },
    [board, clearCallResources, connectCallChannel, getMicrophone, startStatusPoll, user]
  );

  const openCallChooser = useCallback(async () => {
    if (!board || !user || phaseRef.current !== "idle") return;
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
    setMessage("");
    setPhase("connecting");
    try {
      await getMicrophone();
      await connectCallChannel(activeCall);
      const data = await apiRequest<{ call: CallRecord }>(
        `/api/calls/${activeCall.id}`,
        { method: "PATCH", body: JSON.stringify({ action: "accept" }) }
      );
      setCall(data.call);
      callRef.current = data.call;
      await preparePeerConnection(data.call, false);
      await sendSignal({ kind: "accepted" });
      startStatusPoll(data.call);
    } catch (error) {
      clearCallResources();
      setMessage(error instanceof Error ? error.message : "Could not accept the call.");
      setPhase("error");
    }
  }, [clearCallResources, connectCallChannel, getMicrophone, preparePeerConnection, sendSignal, startStatusPoll]);

  const declineCall = useCallback(async () => {
    const activeCall = callRef.current;
    if (!activeCall) return resetToIdle();
    await apiRequest(`/api/calls/${activeCall.id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "decline" }),
    }).catch(() => undefined);
    resetToIdle();
  }, [resetToIdle]);

  const endCall = useCallback(async () => {
    const activeCall = callRef.current;
    if (!activeCall) return resetToIdle();
    if (isTerminatingCallRef.current || phaseRef.current === "ended") return;
    isTerminatingCallRef.current = true;
    phaseRef.current = "ended";
    await sendSignal({ kind: "ended" }).catch(() => undefined);
    const action = activeCall.status === "accepted" ? "end" : "cancel";
    void apiRequest(`/api/calls/${activeCall.id}`, {
      method: "PATCH",
      body: JSON.stringify({ action }),
      keepalive: true,
    }).catch(() => undefined);
    clearCallResources();
    setConnectionState("");
    setMessage(t("Call ended.", "Połączenie zakończone."));
    setPhase("ended");
  }, [clearCallResources, resetToIdle, sendSignal, t]);

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
    if (cameraTrack) {
      cameraTrack.onended = null;
      localStreamRef.current?.removeTrack(cameraTrack);
      cameraTrack.stop();
    }
    if (videoSender) await videoSender.replaceTrack(null).catch(() => undefined);
    if (videoTransceiver && videoTransceiver.direction !== "stopped") {
      videoTransceiver.direction = "recvonly";
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

  const startCamera = useCallback(async () => {
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
    setCameraMessage("");
    try {
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 24, max: 30 },
          facingMode: { ideal: "user" },
        },
      });
      const cameraTrack = cameraStream.getVideoTracks()[0];
      if (!cameraTrack) throw new Error("CAMERA_TRACK_MISSING");
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
          direction: "sendrecv",
          streams: [localStreamRef.current ?? cameraStream],
        });
        localVideoTransceiverRef.current = videoTransceiver;
        localVideoSenderRef.current = videoTransceiver.sender;
      } else {
        videoTransceiver.direction = "sendrecv";
        await videoTransceiver.sender.replaceTrack(cameraTrack);
        localVideoSenderRef.current = videoTransceiver.sender;
      }
      setIsCameraOn(true);
      await sendSignal({ kind: "video-state", enabled: true });
      await requestRenegotiation();
    } catch {
      const failedTrack = localCameraTrackRef.current;
      const failedSender = localVideoSenderRef.current;
      const failedTransceiver = localVideoTransceiverRef.current;
      localCameraTrackRef.current = null;
      if (failedSender) await failedSender.replaceTrack(null).catch(() => undefined);
      if (failedTransceiver && failedTransceiver.direction !== "stopped") {
        failedTransceiver.direction = "recvonly";
      }
      if (failedTrack) {
        failedTrack.onended = null;
        localStreamRef.current?.removeTrack(failedTrack);
        failedTrack.stop();
      }
      setIsCameraOn(false);
      setCameraMessage(
        t(
          "Camera permission was denied or no camera is available. Audio is still connected.",
          "Odmówiono dostępu do kamery lub kamera nie jest dostępna. Dźwięk nadal jest połączony."
        )
      );
    } finally {
      setIsCameraStarting(false);
    }
  }, [isCameraStarting, requestRenegotiation, sendSignal, stopCamera, t]);

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
          className="scriboo-call-panel"
          aria-label={t("Audio call", "Połączenie audio")}
          style={{
            position: "fixed",
            right: "18px",
            top: "74px",
            zIndex: 210,
            width: "min(350px, calc(100vw - 36px))",
            maxHeight: "calc(100dvh - 92px)",
            overflowY: "auto",
            padding: "18px",
            borderRadius: "20px",
            border: "1px solid rgba(203,213,225,0.88)",
            background: "rgba(255,255,255,0.97)",
            color: "#0f172a",
            boxShadow: "0 24px 70px rgba(15,23,42,0.24)",
            backdropFilter: "blur(18px)",
            display: "grid",
            gap: "13px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ width: "42px", height: "42px", borderRadius: "999px", background: "linear-gradient(135deg,#7c3aed,#60a5fa)", color: "white", display: "grid", placeItems: "center", flex: "0 0 auto" }}>
              <Phone size={18} />
            </span>
            <div style={{ minWidth: 0, display: "grid", gap: "3px" }}>
              <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{peerName || t("Audio call", "Połączenie audio")}</strong>
              <span style={{ color: "#64748b", fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{callBoardName}</span>
            </div>
          </div>
          <div aria-live="polite" style={{ color: phase === "error" ? "#b91c1c" : "#475569", fontSize: "13px", fontWeight: 650 }}>
            {statusText || connectionState}
          </div>

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
                  onClick={() => (isCameraOn ? void stopCamera() : void startCamera())}
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
