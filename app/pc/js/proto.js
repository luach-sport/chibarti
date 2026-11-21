/* The same messages as phone to phone (android-native/Proto.java): [type][body], JSON for control, binary for data. */
(function () {
  'use strict';
  const PC = window.PC;
  PC.T = { HELLO: 1, APPROVED: 2, DENIED: 3, PING: 4, PONG: 5, BYE: 6, TEXT: 10, OFFER: 20, OFFER_REPLY: 21, CHUNK: 22, FILE_END: 23, FILE_ACK: 24, CANCEL: 25, PAUSE: 26, RESUME: 27,
    MIRROR_OFFER: 30, MIRROR_REPLY: 31, MIRROR_STOP: 32, KEY_REQUEST: 33, MIRROR_STATS: 34, CONTROL_ASK: 35, CONTROL_REPLY: 36, CONTROL_STOP: 37, INPUT: 38, VIDEO_CONFIG: 40, VIDEO_FRAME: 41, AUDIO_CONFIG: 42, AUDIO_FRAME: 43, AUDIO_OPUS_CONFIG: 44 };
  const enc = new TextEncoder(), dec = new TextDecoder();
  PC.frame = (type, body) => {
    const b = body instanceof Uint8Array ? body : enc.encode(JSON.stringify(body || {}));
    const out = new Uint8Array(b.length + 1);
    out[0] = type;
    out.set(b, 1);
    return out;
  };
  PC.json = (u8) => { try { return JSON.parse(dec.decode(u8)); } catch (e) { return {}; } };
  // CHUNK: [tid 4][fid 4][offset 8][data]
  PC.chunk = (tid, fid, off, data) => {
    const b = new Uint8Array(16 + data.length), v = new DataView(b.buffer);
    v.setInt32(0, tid); v.setInt32(4, fid); v.setUint32(8, Math.floor(off / 4294967296)); v.setUint32(12, off >>> 0);
    b.set(data, 16);
    return b;
  };
  PC.readChunk = (b) => { const v = new DataView(b.buffer, b.byteOffset, b.byteLength); return { tid: v.getInt32(0), fid: v.getInt32(4), off: v.getUint32(8) * 4294967296 + v.getUint32(12), data: b.subarray(16) }; };
  // VIDEO_FRAME / AUDIO_FRAME: [flags 1][pts µs 8][data]
  PC.media = (flags, pts, data) => {
    const b = new Uint8Array(9 + data.length), v = new DataView(b.buffer);
    b[0] = flags; v.setUint32(1, Math.floor(pts / 4294967296)); v.setUint32(5, pts >>> 0);
    b.set(data, 9);
    return b;
  };
  PC.readMedia = (b) => { const v = new DataView(b.buffer, b.byteOffset, b.byteLength); return { flags: b[0], pts: v.getUint32(1) * 4294967296 + v.getUint32(5), data: b.subarray(9) }; };
  // VIDEO_CONFIG / AUDIO_CONFIG: [a 4][b 4][len 4][csd0][len 4][csd1]
  PC.config = (a, b2, c0, c1) => {
    c0 = c0 || new Uint8Array(0); c1 = c1 || new Uint8Array(0);
    const b = new Uint8Array(16 + c0.length + c1.length), v = new DataView(b.buffer);
    v.setInt32(0, a); v.setInt32(4, b2); v.setInt32(8, c0.length); b.set(c0, 12); v.setInt32(12 + c0.length, c1.length); b.set(c1, 16 + c0.length);
    return b;
  };
  PC.readConfig = (b) => {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength), n0 = v.getInt32(8);
    const c0 = b.slice(12, 12 + n0), n1 = v.getInt32(12 + n0);
    return { a: v.getInt32(0), b: v.getInt32(4), csd0: c0, csd1: b.slice(16 + n0, 16 + n0 + n1) };
  };
})();
