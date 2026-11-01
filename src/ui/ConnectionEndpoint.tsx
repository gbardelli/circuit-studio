import type { PartData, WireEnd } from "../core/types";
import { PARTS } from "../parts";
import { TerminalLocation } from "./TerminalLocation";

/** Physical terminal first; its owning board is supporting context. */
export function ConnectionEndpoint({
  end,
  part,
  label,
}: {
  end: WireEnd;
  part?: PartData;
  label: string;
}) {
  const name = part
    ? String(
        part.props.label ||
          PARTS[part.type]?.partNumber ||
          PARTS[part.type]?.name ||
          part.type,
      )
    : "Extremo libre";
  return (
    <div className="connection-endpoint">
      <span className="endpoint-label">{label}</span>
      <TerminalLocation
        pin={end.pin}
        breadboard={part?.type.startsWith("breadboard")}
      />
      <span className="endpoint-owner" title={name}>
        {name}
      </span>
    </div>
  );
}
