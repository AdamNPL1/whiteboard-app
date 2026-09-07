/** Reserve both video directions for the call; track presence controls privacy. */
export const getReservedVideoDirection = (): RTCRtpTransceiverDirection =>
  "sendrecv";
