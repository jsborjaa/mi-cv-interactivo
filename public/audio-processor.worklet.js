/**
 * AudioWorklet processor for Gemini Live API voice capture.
 *
 * - Runs in the AudioWorkletGlobalScope (separate thread from main JS).
 * - Receives Float32 samples from the microphone at whatever sample rate
 *   the AudioContext was created with (target: 16 kHz).
 * - Converts to Int16 PCM and batches into ~100 ms chunks before posting
 *   them to the main thread as a transferable ArrayBuffer (zero-copy).
 * - The main thread labels each chunk with audio/pcm;rate={sampleRate} when
 *   sending to the Gemini WebSocket.
 */
class PCMCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // sampleRate is a read-only property of the AudioWorkletGlobalScope
    // Target ~100 ms per chunk (e.g. 1600 samples at 16 kHz)
    this._chunkSamples = Math.round(sampleRate * 0.1); // eslint-disable-line no-undef
    this._buffer = [];
    this._bufferSize = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel || channel.length === 0) return true;

    // Convert Float32 [-1, 1] → Int16 [-32768, 32767]
    const int16 = new Int16Array(channel.length);
    for (let i = 0; i < channel.length; i++) {
      const s = channel[i] < -1 ? -1 : channel[i] > 1 ? 1 : channel[i];
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    this._buffer.push(int16);
    this._bufferSize += int16.length;

    if (this._bufferSize >= this._chunkSamples) {
      // Merge all buffered arrays into one contiguous Int16Array
      const merged = new Int16Array(this._bufferSize);
      let offset = 0;
      for (const arr of this._buffer) {
        merged.set(arr, offset);
        offset += arr.length;
      }

      // Transfer ownership to main thread (zero-copy via Transferable)
      this.port.postMessage(
        { pcm: merged.buffer, sampleRate }, // eslint-disable-line no-undef
        [merged.buffer]
      );

      this._buffer = [];
      this._bufferSize = 0;
    }

    return true; // keep processor alive
  }
}

registerProcessor("pcm-capture", PCMCaptureProcessor); // eslint-disable-line no-undef
