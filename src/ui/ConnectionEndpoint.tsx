import type { PartData, WireEnd } from "../core/types";
import { PARTS } from "../parts";
import { holeLabel } from "./assembly-plan";

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
  const terminal = !end.pin
    ? "Sin conectar"
    : part?.type.startsWith("breadboard")
      ? holeLabel(end.pin)
      : `Pin ${end.pin}`;
  return (
    <div className="connection-endpoint">
      <span className="endpoint-label">{label}</span>
      <strong className="endpoint-terminal" title={terminal}>
        {terminal}
      </strong>
      <span className="endpoint-owner" title={name}>
        {name}
      </span>
    </div>
  );
}
