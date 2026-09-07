/** Reserve both video directions for the call; track presence controls privacy. */
export const getReservedVideoDirection = (): RTCRtpTransceiverDirection =>
  "sendrecv";

/** Find the video m-line that has actually been associated with remote SDP. */
export const findNegotiatedVideoTransceiver = (
  transceivers: readonly RTCRtpTransceiver[]
) => transceivers.find(
  (transceiver) =>
    transceiver.mid !== null && transceiver.receiver.track.kind === "video"
) ?? null;
