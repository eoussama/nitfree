import { invariant } from "@eoussama/core";
import { mount } from "svelte";

import App from "./App.svelte";



const target = document.getElementById("app");

invariant(target, "Popup root element is missing");

export default mount(App, { target });
