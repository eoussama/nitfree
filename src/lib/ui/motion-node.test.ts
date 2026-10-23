import { describe, expect, it } from "vitest";

import { motion } from "./motion.svelte";



describe("motion without a page", () => {
  it("is not reduced where there is no document to ask", () => {
    expect(typeof document).toBe("undefined");
    expect(motion.reduced).toBe(false);
  });
});
