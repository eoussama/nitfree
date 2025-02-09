import { createApp } from "vue";

import { setupApp } from "~/core";

import "../styles";
import App from "./Sidepanel.vue";



const app = createApp(App);

setupApp(app);
app.mount("#app");
