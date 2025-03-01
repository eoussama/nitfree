import { inject } from "~/core";
import App from "./views/App.vue";



(() => {
  inject(App, "[class^=\"channelBottomBarArea_\"] [class^=\"channelTextArea_\"] [class^=\"buttons_\"]", __NAME__);
})();
