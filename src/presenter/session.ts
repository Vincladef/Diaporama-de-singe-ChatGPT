import type { SlideDocument } from "../domain/slide";
import type { PlaybackPosition } from "../animation/timeline";

/** Messages confined to one same-origin, randomly identified presentation session. */
export type SessionSlide = { id: string; document: SlideDocument; notes: string };
export type PresenterMessage =
  | { type: "hello"; sessionId: string }
  | { type: "init"; sessionId: string; title: string; slides: SessionSlide[];
      position: PlaybackPosition; blackout: boolean; busy: boolean }
  | { type: "state"; sessionId: string; position: PlaybackPosition; blackout: boolean; busy: boolean }
  | { type: "command"; sessionId: string;
      command: "next" | "previous" | "goto" | "toggleBlackout"; slide?: number }
  | { type: "close"; sessionId: string };

export function isSessionId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function presenterChannel(id: string): string {
  return "singe-presenter:" + id;
}
