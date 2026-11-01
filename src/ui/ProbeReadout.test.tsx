import { afterEach, describe, expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { ProbeReadout } from "./ProbeReadout";
import { useUi } from "./store";
const state = vi.hoisted(() => ({
  running: false,
  voltage: 5 as number | null,
}));
vi.mock("./context", () => ({
  useEditor: () => ({ engine: { voltageAt: () => state.voltage } }),
  useDisplaySnapshot: () => ({
    parts: [
      {
        id: "board",
        type: "breadboard-full",
        props: { label: "Control board" },
      },
    ],
  }),
  useSimStatus: () => ({ running: state.running }),
}));
vi.mock("./Overlays", () => ({
  HintButton: (props: Record<string, unknown>) => <button {...props} />,
}));
let view: ReactTestRenderer | undefined;
afterEach(() => {
  act(() => view?.unmount());
  view = undefined;
  state.running = false;
  state.voltage = 5;
  useUi.getState().pinSignal(null);
  useUi.getState().setLabPanel(null);
});
function mount() {
  useUi.getState().pinSignal("board:tp35");
  act(() => {
    view = create(<ProbeReadout />);
  });
}
describe("pinned probe", () => {
  it("does not present retained voltage or a HIGH indication when simulation is stopped", () => {
    mount();
    const output = JSON.stringify(view!.toJSON());
    expect(output).toContain("Sin simular");
    expect(output).not.toContain("5.000");
    expect(output).not.toContain("is-high");
    expect(output).toContain("Columna");
  });
  it("shows an active reading and keeps analysis and dismissal actions functional", () => {
    state.running = true;
    mount();
    expect(JSON.stringify(view!.toJSON())).toContain("5.000");
    expect(JSON.stringify(view!.toJSON())).toContain("HIGH");
    act(() =>
      view!.root
        .findAllByType("button")
        .find(
          (b) => b.props["aria-label"] === "Ver esta señal en el analizador",
        )!
        .props.onClick(),
    );
    expect(useUi.getState().labPanel).toBe("signals");
    act(() =>
      view!.root
        .findAllByType("button")
        .find((b) => b.props["aria-label"] === "Quitar sonda fijada")!
        .props.onClick(),
    );
    expect(view!.toJSON()).toBeNull();
  });
});
