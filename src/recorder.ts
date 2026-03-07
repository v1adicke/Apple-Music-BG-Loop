export interface RecordCanvasOptions {
  canvas: HTMLCanvasElement;
  durationMs?: number;
  fps?: number;
  bitrate?: number;
  mimeType?: string;
  fileName?: string;
}

export const recordCanvasLoop = (opts: RecordCanvasOptions): Promise<void> =>
  new Promise((resolve, reject) => {
    const durationMs = opts.durationMs ?? 10_000;
    const fps = opts.fps ?? 60;
    const bitrate = opts.bitrate ?? 25_000_000;
    const mimeType = opts.mimeType ?? "video/webm; codecs=vp9";
    const fileName = opts.fileName ?? "apple-music-loop-10s.webm";

    if (typeof MediaRecorder === "undefined") {
      reject(new Error("MediaRecorder is not supported."));
      return;
    }
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      reject(new Error("Requested mimeType is not supported."));
      return;
    }

    const stream = opts.canvas.captureStream(fps);
    const chunks: BlobPart[] = [];
    let recorder: MediaRecorder;

    try {
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate });
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      reject(error);
      return;
    }

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.onerror = (event) => {
      stream.getTracks().forEach((track) => track.stop());
      reject(event.error ?? event);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      stream.getTracks().forEach((track) => track.stop());
      resolve();
    };

    recorder.start();
    window.setTimeout(() => {
      if (recorder.state === "recording") {
        recorder.stop();
      }
    }, durationMs);
  });
