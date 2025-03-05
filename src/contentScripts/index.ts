import { inject } from "~/core";
import App from "./views/App.vue";



(() => {
  const target = "[class^=\"channelBottomBarArea_\"] [class^=\"channelTextArea_\"] [class^=\"buttons_\"]";

  inject(App, target, __NAME__);
})();
