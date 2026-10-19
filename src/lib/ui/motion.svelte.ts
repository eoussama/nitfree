function readReduced(): boolean {
  return typeof document !== "undefined" && document.documentElement.dataset.nfReducedMotion === "true";
}

/**
 * Whether Discord asks for reduced motion. The theme engine marks it on <html>, which styles inside
 * Nitfree's shadow roots cannot see, so components read it from here.
 */
export const motion = $state({ reduced: readReduced() });

if (typeof document !== "undefined") {
  new MutationObserver(() => {
    motion.reduced = readReduced();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-nf-reduced-motion"] });
}
