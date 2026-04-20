export const SCREENSHOT_TARGET = `async function pageScreenshotCapture(page, options) {
  const client = await getCdpSession(page);
  const format = options.format === "png" ? "png" : "jpeg";
  const result = await client.send("Page.captureScreenshot", {
    format,
    quality: format === "jpeg" ? options.quality ?? 80 : void 0,
    fromSurface: true,
    captureBeyondViewport: false,
    optimizeForSpeed: true
  });
  return Buffer.from(result.data, "base64");
}`;

export const SCREENSHOT_REPLACEMENT = `async function pageScreenshotCapture(page, options) {
  const type = options.format === "png" ? "png" : "jpeg";
  return page.screenshot({
    type,
    quality: type === "jpeg" ? options.quality ?? 80 : void 0,
    fullPage: false
  });
}`;

export const ENCODER_TARGET = `      else args.push("-crf", String(quality));
      const xParamsFlag = codec === "h264" ? "-x264-params" : "-x265-params";
      const colorParams = "colorprim=bt709:transfer=bt709:colormatrix=bt709";`;

export const ENCODER_REPLACEMENT = `      else args.push("-crf", String(quality));
      if (codec === "h264") {
        args.push("-g", String(fps), "-keyint_min", String(fps), "-sc_threshold", "0", "-bf", "0");
      }
      const xParamsFlag = codec === "h264" ? "-x264-params" : "-x265-params";
      const colorParams = "colorprim=bt709:transfer=bt709:colormatrix=bt709";`;

export const PREPARE_TARGET = `  await page.evaluate((t3) => {
    if (window.__hf && typeof window.__hf.seek === "function") {
      window.__hf.seek(t3);
    }
  }, quantizedTime);`;

export const PREPARE_REPLACEMENT = `  await page.evaluate(async (t3) => {
    if (window.__hf && typeof window.__hf.seek === "function") {
      window.__hf.seek(t3);
      if (typeof window.__hf.settle === "function") {
        await window.__hf.settle();
        return;
      }
    }
    if (typeof requestAnimationFrame === "function") {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }
  }, quantizedTime);`;

export const VIDEO_READY_TARGET = `document.querySelectorAll("video").length === 0 || Array.from(document.querySelectorAll("video")).every(v => v.readyState >= 1)`;

export const VIDEO_READY_REPLACEMENT = `Array.from(document.querySelectorAll("video")).every((v) => {
        const hasSource = Boolean(v.currentSrc || v.getAttribute("src") || v.querySelector("source[src]"));
        if (!hasSource) return true;
        if (v.readyState >= 1) return true;
        if (v.error) return true;
        return v.networkState === 3;
      })`;

function replaceSnippet(source, target, replacement, errorLabel, { replaceAll = false } = {}) {
  if (source.includes(target)) {
    return replaceAll
      ? source.replaceAll(target, replacement)
      : source.replace(target, replacement);
  }

  if (source.includes(replacement)) {
    return source;
  }

  throw new Error(errorLabel);
}

export function patchHyperframesCliSource(source) {
  let patched = source;

  patched = replaceSnippet(
    patched,
    SCREENSHOT_TARGET,
    SCREENSHOT_REPLACEMENT,
    'Screenshot target snippet not found',
  );

  patched = replaceSnippet(
    patched,
    ENCODER_TARGET,
    ENCODER_REPLACEMENT,
    'Encoder target snippet not found',
    { replaceAll: true },
  );

  patched = replaceSnippet(
    patched,
    PREPARE_TARGET,
    PREPARE_REPLACEMENT,
    'prepareFrameForCapture target snippet not found',
  );

  patched = replaceSnippet(
    patched,
    VIDEO_READY_TARGET,
    VIDEO_READY_REPLACEMENT,
    'video ready target snippet not found',
    { replaceAll: true },
  );

  return patched;
}
