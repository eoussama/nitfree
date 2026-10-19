import type { TClickAction } from "~/lib/settings";

import { clickAction, playAnimations } from "~/lib/settings";



type TPreferences = {
  clickAction: TClickAction;
  playAnimations: boolean;
};

/**
 * The popup's settings the panel follows, kept in step with extension storage.
 */
export const preferences: TPreferences = $state({ clickAction: "send", playAnimations: true });

/**
 * Reads the settings and follows changes made in the popup.
 *
 * @returns A function that stops following.
 */
export function followPreferences(): () => void {
  let stopped = false;

  void Promise.all([clickAction.getValue(), playAnimations.getValue()]).then(([action, play]) => {
    if (!stopped) {
      preferences.clickAction = action;
      preferences.playAnimations = play;
    }
  });

  const stops = [
    clickAction.watch((value) => {
      preferences.clickAction = value;
    }),
    playAnimations.watch((value) => {
      preferences.playAnimations = value;
    }),
  ];

  return () => {
    stopped = true;
    stops.forEach(stop => stop());
  };
}
