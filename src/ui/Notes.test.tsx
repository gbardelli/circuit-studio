import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import * as Y from "yjs";
import { Project } from "../collab/project";
import { EditorContext } from "./context";
import type { SimClient } from "../sim/client";
import { Notes, circuitNotes } from "./Notes";
import { useUi } from "./store";

vi.mock("../cloud", () => ({
  CLOUD: false,
  sessionUser: () => null,
  sessionToken: async () => null,
  colorFor: () => "#888",
}));
vi.mock("./Overlays", () => ({
  HintButton: (props: Record<string, unknown>) => <button {...props} />,
}));
const projects: Project[] = [];
beforeEach(() => {
  vi.stubEnv("DEV", false);
  vi.stubEnv("VITE_COLLAB_URL", "");
});
let view: ReactTestRenderer | undefined;
async function open(role: "owner" | "viewer" = "owner") {
  const p = new Project(crypto.randomUUID(), role);
  projects.push(p);
  await p.persistence.whenSynced;
  return p;
}
function mount(p: Project) {
  act(() => {
    view = create(
      <EditorContext.Provider value={{ project: p, engine: {} as SimClient }}>
        <Notes />
      </EditorContext.Provider>,
    );
  });
}
function button(text: string) {
  return view!.root
    .findAllByType("button")
    .find((b) => b.children.includes(text))!;
}
afterEach(() => {
  act(() => view?.unmount());
  view = undefined;
  projects.splice(0).forEach((p) => p.destroy());
  useUi.getState().select([]);
  vi.unstubAllEnvs();
});

describe("circuit comments", () => {
  it("creates an anchored comment, replies to its original piece, and resolves the thread", async () => {
    const p = await open(),
      part = p.addPart("resistor", 0, 0);
    useUi.getState().select([part]);
    mount(p);
    act(() =>
      view!.root
        .findByType("textarea")
        .props.onChange({ target: { value: "Check the resistance." } }),
    );
    act(() => button("Comentar").props.onClick());
    const root = circuitNotes(p.meta.entries())[0];
    expect(root.part).toBe(part);
    expect(root.text).toBe("Check the resistance.");
    act(() => button("Responder").props.onClick());
    act(() => useUi.getState().select([]));
    act(() =>
      view!.root
        .findByType("textarea")
        .props.onChange({ target: { value: "Confirmed." } }),
    );
    act(() =>
      view!.root
        .findAllByType("button")
        .find((b) => b.props.className === "btn primary")!
        .props.onClick(),
    );
    expect(
      circuitNotes(p.meta.entries()).find((n) => n.parent === root.id),
    ).toMatchObject({ part, text: "Confirmed." });
    await act(async () => button("Resolver").props.onClick());
    expect(
      circuitNotes(p.meta.entries()).find((n) => n.id === root.id)?.resolved,
    ).toBe(true);
    expect(view!.root.findAllByType("article")).toHaveLength(0);
    act(() =>
      view!.root
        .findByType("input")
        .props.onChange({ target: { checked: true } }),
    );
    expect(view!.root.findAllByType("article")).toHaveLength(1);
  });
  it("shows a read-only explanation without an unusable comment form", async () => {
    const owner = await open();
    owner.addPart("resistor", 0, 0);
    const viewer = await open("viewer");
    Y.applyUpdate(viewer.doc, Y.encodeStateAsUpdate(owner.doc));
    const before = viewer.meta.toJSON();
    mount(viewer);
    expect(view!.root.findAllByType("textarea")).toHaveLength(0);
    expect(JSON.stringify(view!.toJSON())).toContain("Solo lectura");
    expect(viewer.meta.toJSON()).toEqual(before);
  });
});
