import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import type { CircuitSnapshot } from "../core/types";
import { materials } from "./lab-utils";
import {
  assemblyEndLabel,
  buildAssemblyPlan,
  holeLabel,
  orientationText,
  partTitle,
} from "./assembly-plan";

export interface AssemblyPdfInput {
  name: string;
  snapshot: CircuitSnapshot;
  currency: string;
  prices: Record<string, number>;
  purchased: Record<string, number>;
  partsDone?: Record<string, string>;
  wiresDone?: Record<string, string>;
  scope: "materials" | "guide";
  diagram?: string;
  date?: Date;
}
type FontFiles = [Uint8Array, Uint8Array];
let fontFiles: Promise<FontFiles> | undefined;
function loadFonts() {
  if (!fontFiles)
    fontFiles = Promise.all(
      ["Regular", "Bold"].map(async (weight) => {
        const response = await fetch(`/fonts/NotoSans-${weight}.ttf`);
        if (!response.ok)
          throw new Error("No se pudo cargar la tipografía del PDF.");
        return new Uint8Array(await response.arrayBuffer());
      }),
    )
      .then((files) => files as FontFiles)
      .catch((error) => {
        fontFiles = undefined;
        throw error;
      });
  return fontFiles;
}
function base64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

/** Produces selectable text and repeating, paginated tables, independent of screen size. */
export async function buildAssemblyPdf(
  input: AssemblyPdfInput,
  fonts?: FontFiles,
) {
  const files = fonts ?? (await loadFonts());
  const doc = new jsPDF({
    orientation: input.scope === "guide" ? "landscape" : "portrait",
    unit: "pt",
    format: "a4",
    compress: true,
  });
  files.forEach((file, i) => {
    const name = `NotoSans-${i ? "Bold" : "Regular"}.ttf`;
    doc.addFileToVFS(name, base64(file));
    doc.addFont(name, "NotoSans", i ? "bold" : "normal");
  });
  doc.setProperties({
    title: `${input.name} · ${input.scope === "guide" ? "Guía de montaje" : "Materiales"}`,
    author: "Circuit Studio",
    subject: "Documentación del circuito",
  });
  const width = doc.internal.pageSize.getWidth(),
    height = doc.internal.pageSize.getHeight(),
    margin = 40;
  const rows = materials(input.snapshot),
    plan = buildAssemblyPlan(input.snapshot);
  const hasPrices = rows.some((row) => input.prices[row.key] !== undefined);
  const price = (value: number) =>
    new Intl.NumberFormat("es-PE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  const stamp = (input.date ?? new Date()).toLocaleDateString("es-PE");
  const title = (section: string, subtitle: string) => {
    doc
      .setFont("NotoSans", "bold")
      .setFontSize(11)
      .setTextColor(39, 105, 77)
      .text("circuitstudio", margin, 35);
    doc
      .setFont("NotoSans", "normal")
      .setFontSize(9)
      .setTextColor(107, 114, 123)
      .text(stamp, width - margin, 35, { align: "right" });
    doc
      .setFont("NotoSans", "bold")
      .setFontSize(25)
      .setTextColor(26, 31, 37)
      .text(section, margin, 78);
    doc.setFont("NotoSans", "normal").setFontSize(11).setTextColor(75, 83, 94);
    const project = doc.splitTextToSize(input.name, width - margin * 2);
    doc.text(`${project[0]}${project.length > 1 ? "…" : ""}`, margin, 99);
    doc.setFontSize(9.5).text(subtitle, margin, 119);
  };
  const table = (heading: string[], body: string[][], startY: number) =>
    autoTable(doc, {
      head: [heading],
      body,
      startY,
      margin: { top: 58, right: margin, bottom: 48, left: margin },
      theme: "plain",
      showHead: "everyPage",
      rowPageBreak: "avoid",
      styles: {
        font: "NotoSans",
        fontSize: 10,
        cellPadding: { top: 8, right: 8, bottom: 8, left: 8 },
        textColor: [38, 45, 54],
        lineColor: [225, 229, 233],
        lineWidth: { bottom: 0.4 },
        overflow: "linebreak",
        valign: "middle",
      },
      columnStyles:
        heading[0] === "Paso"
          ? {
              0: { cellWidth: 38 },
              1: { cellWidth: 175 },
              2: { cellWidth: width - margin * 2 - 283 },
              3: { cellWidth: 70 },
            }
          : {},
      headStyles: {
        fillColor: [236, 239, 242],
        textColor: [61, 70, 82],
        fontStyle: "bold",
        fontSize: 9,
      },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      didDrawPage: (data) => {
        if (data.pageNumber > 1)
          doc
            .setFont("NotoSans", "normal")
            .setFontSize(9)
            .setTextColor(104, 113, 124)
            .text(`${input.name.slice(0, 75)} · Circuit Studio`, margin, 32);
      },
    });
  if (input.scope === "guide") {
    title(
      "Plano de montaje",
      `${input.snapshot.parts.length} componentes · ${plan.wires} conexiones · ${plan.steps.length} pasos`,
    );
    if (input.diagram)
      doc.addImage(
        input.diagram,
        "PNG",
        margin,
        143,
        width - margin * 2,
        height - 220,
        undefined,
        "FAST",
      );
    doc
      .setFont("NotoSans", "normal")
      .setFontSize(10)
      .setTextColor(75, 83, 94)
      .text(
        "Comprueba la orientación de las piezas y la continuidad de los rieles al montar.",
        margin,
        height - 55,
      );
    doc.addPage();
  }
  title(
    "Lista de materiales",
    `${rows.length} referencias · ${input.snapshot.parts.length} componentes · ${plan.wires} cables`,
  );
  const heading = ["Componente", "Referencia / valor", "Cant.", "Compra"];
  if (hasPrices)
    heading.push(`Unit. ${input.currency}`, `Subtotal ${input.currency}`);
  const body = rows.map((row) => {
    const line = [
      row.name,
      row.reference || "—",
      String(row.quantity),
      (input.purchased[row.key] ?? 0) >= row.quantity ? "Listo" : "Pendiente",
    ];
    if (hasPrices)
      line.push(
        input.prices[row.key] === undefined
          ? "—"
          : price(input.prices[row.key]),
        input.prices[row.key] === undefined
          ? "—"
          : price(input.prices[row.key] * row.quantity),
      );
    return line;
  });
  table(heading, body, 142);
  if (hasPrices) {
    let y =
      (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable
        .finalY + 22;
    if (y > height - 85) {
      doc.addPage();
      y = 80;
    }
    const total = rows.reduce(
      (sum, row) => sum + (input.prices[row.key] ?? 0) * row.quantity,
      0,
    );
    doc
      .setFont("NotoSans", "bold")
      .setFontSize(12)
      .setTextColor(26, 31, 37)
      .text(
        `Subtotal con precio: ${input.currency} ${price(total)}`,
        width - margin,
        y,
        { align: "right" },
      );
    doc
      .setFont("NotoSans", "normal")
      .setFontSize(9)
      .setTextColor(104, 113, 124)
      .text(
        "Importes introducidos por el usuario. Las referencias sin precio no están incluidas.",
        margin,
        y + 22,
      );
  }
  if (input.scope === "guide") {
    doc.addPage();
    title(
      "Montaje paso a paso",
      "Confirma cada paso después de realizarlo en el circuito físico.",
    );
    table(
      ["Paso", "Elemento", "Indicaciones", "Estado"],
      plan.steps.map((step, i) => {
        const done =
          step.kind === "part"
            ? input.partsDone?.[step.part.id] === step.signature
            : input.wiresDone?.[step.wire.id] === step.signature;
        const boards = new Map(
          input.snapshot.parts.map((part) => [part.id, part]),
        );
        const groups = new Map<string, string[]>();
        if (step.kind === "part")
          for (const pin of step.placements)
            groups.set(pin.board, [
              ...(groups.get(pin.board) ?? []),
              `${pin.pin}: ${holeLabel(pin.hole)}`,
            ]);
        const instruction =
          step.kind === "part"
            ? `${orientationText(step.part)}\n${[...groups].map(([board, pins]) => `${boards.has(board) ? partTitle(boards.get(board)!) : board}\n${pins.join("; ")}`).join("\n")}`
            : `Origen: ${assemblyEndLabel(step.wire.a, input.snapshot)}\nDestino: ${assemblyEndLabel(step.wire.b, input.snapshot)}`;
        return [
          String(i + 1),
          step.kind === "part"
            ? step.title
            : `Cable · ${step.phase === "power" ? "Alimentación" : "Señal"}`,
          instruction,
          done ? "Hecho" : "Pendiente",
        ];
      }),
      142,
    );
  }
  const count = doc.getNumberOfPages();
  for (let page = 1; page <= count; page++) {
    doc
      .setPage(page)
      .setDrawColor(221, 226, 231)
      .setLineWidth(0.5)
      .line(margin, height - 32, width - margin, height - 32);
    doc
      .setFont("NotoSans", "normal")
      .setFontSize(8.5)
      .setTextColor(106, 115, 126)
      .text(
        input.scope === "materials"
          ? "Lista de compra · Circuit Studio"
          : "Guía de montaje · Circuit Studio",
        margin,
        height - 17,
      );
    doc.text(`${page} / ${count}`, width - margin, height - 17, {
      align: "right",
    });
  }
  return doc;
}

export async function renderAssemblyDiagram(snapshot: CircuitSnapshot) {
  const [{ renderToStaticMarkup }, { createElement }, { CircuitPreview }] =
    await Promise.all([
      import("react-dom/server"),
      import("react"),
      import("./Preview"),
    ]);
  const defs =
    document.querySelector("#g-metal")?.parentElement?.outerHTML ?? "";
  const svg = renderToStaticMarkup(
    createElement(CircuitPreview, { snapshot, labels: true }),
  )
    .replace(
      "<svg ",
      '<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1300" style="--text:#fff;--accent:#499dff;" ',
    )
    .replace(/(<svg[^>]*>)/, "$1" + defs);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("No se pudo dibujar el plano."));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 2400;
    canvas.height = 1300;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No se pudo preparar el plano.");
    context.fillStyle = "#101216";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}
