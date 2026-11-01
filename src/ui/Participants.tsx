import { useState } from "react";
import { CircleCheck, Eye, Move, Pencil, UserRound } from "lucide-react";
import type { UserInfo } from "../collab/project";

const STATUS = {
  self: { label: "TÚ", icon: CircleCheck },
  watching: { label: "MIRANDO", icon: Eye },
  editing: { label: "EDITANDO", icon: Pencil },
  moving: { label: "MOVIENDO", icon: Move },
} as const;

export function ParticipantRow({
  user,
  status,
}: {
  user: UserInfo;
  status: keyof typeof STATUS;
}) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const photo = user.image && user.image !== failedImage ? user.image : null;
  const Icon = STATUS[status].icon;
  return (
    <li className="participant-row">
      <span
        className="avatar participant-avatar"
        style={{ background: photo ? user.color : undefined }}
      >
        {photo ? (
          <img
            src={photo}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setFailedImage(photo)}
          />
        ) : (
          <UserRound size={16} aria-hidden="true" />
        )}
      </span>
      <span className="participant-name" title={user.name}>
        {user.name}
      </span>
      <span className={`participant-status is-${status}`}>
        <Icon size={12} aria-hidden="true" />
        {STATUS[status].label}
      </span>
    </li>
  );
}
