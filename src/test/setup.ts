import { beforeEach, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";

import { version } from "../../package.json";

import { stubMessages } from "./i18n";



// Before every test, since tests that restore their mocks take the stubs away with them.
beforeEach(() => {
  stubMessages();
  vi.spyOn(fakeBrowser.runtime, "getManifest").mockReturnValue({ manifest_version: 3, name: "Nitfree", version });
});
