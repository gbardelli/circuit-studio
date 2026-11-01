import { describe, expect, it } from "vitest";
import { terminalFields } from "./TerminalLocation";

describe("physical terminal coordinates", () => {
  it("separates power rail position, polarity and column", () => {
    expect(terminalFields("tp12", true)).toEqual([
      { label: "Riel", value: "+ Superior" },
      { label: "Columna", value: "12" },
    ]);
    expect(terminalFields("bn2", true)).toEqual([
      { label: "Riel", value: "− Inferior" },
      { label: "Columna", value: "2" },
    ]);
  });
  it("shows a breadboard row independently of its column", () => {
    expect(terminalFields("j63", true)).toEqual([
      { label: "Fila", value: "J" },
      { label: "Columna", value: "63" },
    ]);
  });
  it("preserves electrical pin identifiers outside a breadboard", () => {
    expect(terminalFields("a12", false)).toEqual([
      { label: "Pin", value: "a12" },
    ]);
    expect(terminalFields("/RESET", false)).toEqual([
      { label: "Pin", value: "/RESET" },
    ]);
  });
  it("does not invent coordinates for missing or unknown terminals", () => {
    expect(terminalFields(undefined, true)).toEqual([
      { label: "Terminal", value: "Sin conectar" },
    ]);
    expect(terminalFields("OUT", true)).toEqual([
      { label: "Pin", value: "OUT" },
    ]);
  });
});
