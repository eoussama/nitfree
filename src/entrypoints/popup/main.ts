import { invariant } from "@eoussama/core";
import { mount } from "svelte";

import { mountOverlay } from "~/lib/ui/inject";

import App from "./App.svelte";



const target = document.getElementById("app");

invariant(target, "Popup root element is missing");

// The add dialog, the same as on Discord, over the popup.
mountOverlay();

export default mount(App, { target });
