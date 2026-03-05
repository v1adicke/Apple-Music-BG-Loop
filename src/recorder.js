(function initRecorderModule(globalScope) {
  const recordCanvasLoop = (opts) => new Promise((resolve, reject) => {
    // здесь просто пишем ровно один цикл анимации и сразу скачиваем
    const canvas = opts.canvas;
    const durationMs = opts.durationMs ?? 10000;
    const fps = opts.fps ?? 60;
    const bitrate = opts.bitrate ?? 25000000;
    const mimeType = opts.mimeType ?? "video/webm; codecs=vp9";
    const fileName = opts.fileName ?? "apple-music-loop-10s.webm";

    if (!globalScope.MediaRecorder) {
      reject(new Error("MediaRecorder is not supported."));
      return;
    }
    if (!globalScope.MediaRecorder.isTypeSupported(mimeType)) {
      reject(new Error("Requested mimeType is not supported."));
      return;
    }

    // стримим прямо из canvas без промежуточных файлов
    const stream = canvas.captureStream(fps);
    const chunks = [];
    let recorder;

    try {
      recorder = new globalScope.MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate });
    } catch (err) {
      for (const track of stream.getTracks()) track.stop();
      reject(err);
      return;
    }

    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunks.push(ev.data);
    };

    recorder.onerror = (ev) => {
      const e = ev.error || ev;
      for (const track of stream.getTracks()) track.stop();
      reject(e);
    };

    recorder.onstop = () => {
      // по стопу собираем blob и дергаем авто скачивание
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      for (const track of stream.getTracks()) track.stop();
      resolve();
    };

    recorder.start();
    globalScope.setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, durationMs);
  });

  globalScope.AppRecorder = { recordCanvasLoop };
})(window);
