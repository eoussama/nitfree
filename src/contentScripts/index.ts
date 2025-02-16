import { inject } from "~/core";
import App from "./views/App.vue";



(() => {
  if (document.getElementById(__NAME__)) {
    return;
  }

  inject(App, "[class^=\"channelBottomBarArea_\"] [class^=\"channelTextArea_\"] [class^=\"buttons_\"]", __NAME__);
})();
