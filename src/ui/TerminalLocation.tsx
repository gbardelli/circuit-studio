export function terminalFields(pin: string | undefined, breadboard: boolean) {
  if (!pin) return [{ label: "Terminal", value: "Sin conectar" }];
  if (breadboard) {
    const rail = /^([tb])([pn])(\d+)$/i.exec(pin);
    if (rail)
      return [
        {
          label: "Riel",
          value: `${rail[2].toLowerCase() === "p" ? "+" : "−"} ${rail[1].toLowerCase() === "t" ? "Superior" : "Inferior"}`,
        },
        { label: "Columna", value: rail[3] },
      ];
    const hole = /^([a-j])(\d+)$/i.exec(pin);
    if (hole)
      return [
        { label: "Fila", value: hole[1].toUpperCase() },
        { label: "Columna", value: hole[2] },
      ];
  }
  return [{ label: "Pin", value: pin }];
}

/** Each physical coordinate has its own label and value. */
export function TerminalLocation({
  pin,
  breadboard = false,
}: {
  pin?: string;
  breadboard?: boolean;
}) {
  return (
    <dl className="terminal-location">
      {terminalFields(pin, breadboard).map((field) => (
        <div key={field.label}>
          <dt>{field.label}</dt>
          <dd>{field.value}</dd>
        </div>
      ))}
    </dl>
  );
}
