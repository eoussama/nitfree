import type { TClickAction, TSuggestionsAt } from "~/lib/settings";

import { autocomplete, clickAction, playAnimations, suggestionsAt } from "~/lib/settings";



type TPreferences = {
  clickAction: TClickAction;
  playAnimations: boolean;
  autocomplete: boolean;
  suggestionsAt: TSuggestionsAt;
};

/**
 * The popup's settings the panel follows, kept in step with extension storage.
 */
export const preferences: TPreferences = $state({ clickAction: "send", playAnimations: true, autocomplete: true, suggestionsAt: "end" });

/**
 * Reads the settings and follows changes made in the popup.
 *
 * @returns A function that stops following.
 */
export function followPreferences(): () => void {
  let stopped = false;

  void Promise.all([clickAction.getValue(), playAnimations.getValue(), autocomplete.getValue(), suggestionsAt.getValue()]).then(([action, play, suggest, at]) => {
    if (!stopped) {
      preferences.clickAction = action;
      preferences.playAnimations = play;
      preferences.autocomplete = suggest;
      preferences.suggestionsAt = at;
    }
  });

  const stops = [
    clickAction.watch((value) => {
      preferences.clickAction = value;
    }),
    playAnimations.watch((value) => {
      preferences.playAnimations = value;
    }),
    autocomplete.watch((value) => {
      preferences.autocomplete = value;
    }),
    suggestionsAt.watch((value) => {
      preferences.suggestionsAt = value;
    }),
  ];

  return () => {
    stopped = true;
    stops.forEach(stop => stop());
  };
}
