// Renders the on-screen A4 prescription (#print-root) to a PDF and stores it with the
// prescription (Google Drive → "Prescription PDFs/<doctor>/<patient>/" in the Google build).
// html2canvas-pro is used because it understands the modern colour functions Tailwind emits.

import { api, blobToBase64 } from "@/lib/api-client";

const A4_W = 595.28; // pt
const A4_H = 841.89;

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

export async function renderPrescriptionPdf(): Promise<Blob> {
  const el = document.getElementById("print-root");
  if (!el) throw new Error("The preview is not visible — open the Preview tab and try again");
  await nextFrame();
  if (document.fonts?.ready) await document.fonts.ready;

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
  const canvas = await html2canvas(el, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    width: el.scrollWidth,
    windowWidth: el.scrollWidth,
    onclone: (doc) => {
      const wrap = doc.querySelector(".a4-scale-wrap") as HTMLElement | null;
      if (wrap) {
        wrap.style.transform = "none"; // the on-screen sheet is scaled to fit — capture it at 100 %
        wrap.style.height = "auto";
      }
      const sheet = doc.getElementById("print-root");
      if (sheet) sheet.style.boxShadow = "none";
    },
  });

  const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const pxPerPage = Math.floor((A4_H * canvas.width) / A4_W);
  // a sheet that is a few pixels taller than A4 (rounding) must not spill a blank second page
  const pages = canvas.height <= pxPerPage * 1.02 ? 1 : Math.ceil(canvas.height / pxPerPage);
  for (let p = 0; p < pages; p++) {
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = pages === 1 ? canvas.height : Math.min(pxPerPage, canvas.height - p * pxPerPage);
    const ctx = slice.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, p * pxPerPage, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
    if (p > 0) pdf.addPage();
    pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, A4_W, Math.min(A4_H, (slice.height * A4_W) / canvas.width));
  }
  return pdf.output("blob");
}

/** Generate the PDF of the prescription currently on screen and attach it to the prescription. */
export async function savePrescriptionPdf(prescriptionId: string, code: string, version: number) {
  const blob = await renderPrescriptionPdf();
  const dataBase64 = await blobToBase64(blob);
  const { file } = await api.uploadFile({
    kind: "PRESCRIPTION_PDF",
    relatedType: "PRESCRIPTION",
    relatedId: prescriptionId,
    name: `${code}_v${version}.pdf`,
    mimeType: "application/pdf",
    dataBase64,
  });
  return file;
}
