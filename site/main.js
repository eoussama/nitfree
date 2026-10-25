/*
 * Shows the page's parts as they scroll into view, and loads the trailer from YouTube only once it is
 * played. Without this script, the page shows in full and the trailer opens on YouTube.
 */

/**
 * What fades in as it comes into view.
 */
const REVEALED = ".hero-copy, .hero-shot, .section-title, .feature-copy, .feature-shot, .card, .video, .privacy, .cta";

/**
 * How far apart the cards of one row show, in milliseconds.
 */
const STAGGER = 80;

const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      entry.target.classList.add("shown");
      observer.unobserve(entry.target);
    }
  }
}, { rootMargin: "0px 0px -10% 0px" });

for (const element of document.querySelectorAll(REVEALED)) {
  if (element.classList.contains("card")) {
    element.style.transitionDelay = `${[...element.parentElement.children].indexOf(element) * STAGGER}ms`;
  }

  element.dataset.reveal = "";
  observer.observe(element);
}

// The privacy-friendly player, which keeps no cookies until the video plays.
for (const link of document.querySelectorAll("[data-youtube]")) {
  link.addEventListener("click", (event) => {
    event.preventDefault();

    const player = document.createElement("div");
    const frame = document.createElement("iframe");

    player.className = "video shown";
    player.dataset.reveal = "";
    frame.src = `https://www.youtube-nocookie.com/embed/${link.dataset.youtube}?autoplay=1&rel=0`;
    frame.title = "Nitfree trailer";
    frame.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    frame.allowFullscreen = true;
    player.append(frame);
    link.replaceWith(player);
  });
}
