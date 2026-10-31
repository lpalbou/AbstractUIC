import React from "react";
import { ActivityAvatar, type ActivityAvatarProps } from "./activity_avatar.js";

/** Compatibility name for Apple-derived designs, presented by the shared generator. */
export function AppleActivityAvatar(props: ActivityAvatarProps): React.ReactElement {
  return <ActivityAvatar {...props} design={props.design ?? "watch-halo"} />;
}
