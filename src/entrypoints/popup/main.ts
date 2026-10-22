import { invariant } from "@eoussama/core";
import { mount } from "svelte";

import { loadDiscordFont } from "~/lib/theme";
import { mountOverlay } from "~/lib/ui/inject";

import App from "./App.svelte";



import "./popup.css";



const target = document.getElementById("app");

invariant(target, "Popup root element is missing");

// Discord's typeface, when a Discord tab has shared it; the bundled Noto Sans shows until then.
void loadDiscordFont().catch(() => undefined);

// The add dialog, the same as on Discord, over the popup.
mountOverlay();

export default mount(App, { target });
