import type { TClickAction, TSuggestionsAt } from "~/lib/settings";
import type { TShortcut } from "~/lib/shortcut";

import { autocomplete, clickAction, playAnimations, shortcut, shortcutKeys, suggestionsAt } from "~/lib/settings";
import { DEFAULT_SHORTCUT } from "~/lib/shortcut";



type TPreferences = {
  clickAction: TClickAction;
  playAnimations: boolean;
  autocomplete: boolean;
  suggestionsAt: TSuggestionsAt;
  shortcut: TShortcut | null;
};

/**
 * The popup's settings the panel follows, kept in step with extension storage. The shortcut is null
 * while turned off.
 */
export const preferences: TPreferences = $state({ clickAction: "send", playAnimations: true, autocomplete: true, suggestionsAt: "end", shortcut: DEFAULT_SHORTCUT });

/**
 * Reads the settings and follows changes made in the popup.
 *
 * @returns A function that stops following.
 */
export function followPreferences(): () => void {
  let stopped = false;
  let useShortcut = true;
  let keys = DEFAULT_SHORTCUT;

  const setShortcut = (): void => {
    preferences.shortcut = useShortcut ? keys : null;
  };

  void Promise.all([clickAction.getValue(), playAnimations.getValue(), autocomplete.getValue(), suggestionsAt.getValue(), shortcut.getValue(), shortcutKeys.getValue()]).then(([action, play, suggest, at, on, combination]) => {
    if (!stopped) {
      preferences.clickAction = action;
      preferences.playAnimations = play;
      preferences.autocomplete = suggest;
      preferences.suggestionsAt = at;
      useShortcut = on;
      keys = combination;
      setShortcut();
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
    shortcut.watch((value) => {
      useShortcut = value;
      setShortcut();
    }),
    shortcutKeys.watch((value) => {
      keys = value;
      setShortcut();
    }),
  ];

  return () => {
    stopped = true;
    stops.forEach(stop => stop());
  };
}
