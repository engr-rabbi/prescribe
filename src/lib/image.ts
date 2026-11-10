// Downscale big profile images before they are sent to the Google backend (keeps requests
// small and lets the backend cache them). Keeps PNG (signatures / logos may be transparent).

export async function shrinkDataUrl(dataUrl: string, maxDim = 640): Promise<string> {
  if (!dataUrl.startsWith("data:image/") || dataUrl.length < 60_000) return dataUrl;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("bad image"));
      i.src = dataUrl;
    });
    const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * ratio));
    canvas.height = Math.max(1, Math.round(img.height * ratio));
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const png = dataUrl.startsWith("data:image/png");
    const out = canvas.toDataURL(png ? "image/png" : "image/jpeg", 0.85);
    return out.length < dataUrl.length ? out : dataUrl;
  } catch {
    return dataUrl;
  }
}
