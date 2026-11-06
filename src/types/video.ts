import type { Keyframe } from "./course";

export interface VideoPlayerHandle {
  seekTo: (seconds: number) => void;
  pause: () => void;
  setKeyframes: (keyframes: Keyframe[]) => void;
}
