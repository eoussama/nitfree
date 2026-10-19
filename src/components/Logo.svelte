<svelte:options css="injected" />

<!--
  Nitfree's logo drawn as SVG, so its eyes can blink. Shapes and colors match src/assets/logo.png.
  Lively, as in the popup, it blinks now and then and its eyes follow the pointer; with reduced
  motion it stays still.
-->
<script lang="ts">
  import { motion } from "~/lib/ui/motion.svelte";



  type TProps = {
    lively?: boolean;
  };

  const { lively = false }: TProps = $props();

  /**
   * How far the eyes move toward the pointer, in the logo's units (it is 1080 wide).
   */
  const REACH = { x: 32, y: 44 };

  /**
   * How far the pointer must be, in CSS pixels, for the eyes to look all the way.
   */
  const FULL_LOOK = 160;

  let svg: SVGSVGElement | undefined = $state();
  let look = $state({ x: 0, y: 0 });
  let blinking = $state(false);

  const active = $derived(lively && !motion.reduced);

  // The eyes turn toward the pointer, more the farther it is, and back to the middle when it leaves.
  $effect(() => {
    if (!active) {
      look = { x: 0, y: 0 };

      return;
    }

    const onMove = (event: PointerEvent): void => {
      if (!svg) {
        return;
      }

      const box = svg.getBoundingClientRect();
      const dx = event.clientX - (box.left + box.width / 2);
      const dy = event.clientY - (box.top + box.height / 2);
      const distance = Math.hypot(dx, dy);
      const strength = Math.min(distance / FULL_LOOK, 1);

      look = distance === 0 ? { x: 0, y: 0 } : { x: (dx / distance) * strength * REACH.x, y: (dy / distance) * strength * REACH.y };
    };

    const onLeave = (): void => {
      look = { x: 0, y: 0 };
    };

    window.addEventListener("pointermove", onMove);
    document.documentElement.addEventListener("pointerleave", onLeave);

    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  });

  // A blink every few seconds, now and then a double one.
  $effect(() => {
    if (!active) {
      return;
    }

    let timer: ReturnType<typeof setTimeout>;

    const blink = (times: number): void => {
      blinking = true;
      timer = setTimeout(() => {
        blinking = false;
        timer = times > 1 ? setTimeout(blink, 120, times - 1) : setTimeout(next, 0);
      }, 200);
    };

    function next(): void {
      timer = setTimeout(blink, 2500 + Math.random() * 4000, Math.random() < 0.2 ? 2 : 1);
    }

    next();

    return () => {
      clearTimeout(timer);
      blinking = false;
    };
  });
</script>

<svg bind:this={svg} class="logo" class:blinking viewBox="0 0 1080 1080" aria-hidden="true">
  <rect width="1080" height="1080" fill="#6990ff" />
  <g class="look" style:transform="translate({look.x}px, {look.y}px)">
    <ellipse class="eye" cx="145" cy="476" rx="55.5" ry="58.5" />
    <ellipse class="eye" cx="934.5" cy="476" rx="55.5" ry="58.5" />
  </g>
  <rect x="276" y="363" width="516" height="353" rx="165" ry="176.5" fill="#b8cdff" />
  <rect x="383" y="570" width="104" height="68" rx="34" fill="#6990ff" />
  <rect x="594" y="570" width="104" height="68" rx="34" fill="#6990ff" />
</svg>

<style>
  .logo {
    display: block;
    width: 100%;
    height: 100%;
  }

  .look {
    transition: transform 0.12s ease-out;
  }

  .eye {
    fill: #000;
    transform-box: fill-box;
    transform-origin: center;
    transition: transform 0.1s ease-in-out;
  }

  .blinking .eye {
    transform: scaleY(0.1);
  }
</style>
