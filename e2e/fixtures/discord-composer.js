/*
 * Plays Discord's composer on the stand-in page, the way its client code behaves:
 * - files put on the hidden upload input and announced with a change event join the message a moment
 *   later, listed in the "attachments" tray, as the upload button does;
 * - Enter in the text box, without Shift, sends the message with its text and attachments.
 * Sent messages are kept in `discordSent` for tests to read.
 */

globalThis.discordSent = [];

let uploads = 0;

document.addEventListener("change", (event) => {
  const input = event.target;

  if (!(input instanceof HTMLInputElement) || input.type !== "file") {
    return;
  }

  const composer = input.closest("form");
  const files = [...input.files ?? []];

  input.value = "";

  // Discord reads the files first, then lists them.
  setTimeout(() => {
    let tray = composer.querySelector("[data-list-id=\"attachments\"]");

    if (!tray) {
      tray = document.createElement("ul");
      tray.setAttribute("data-list-id", "attachments");
      composer.prepend(tray);
    }

    for (const file of files) {
      const item = document.createElement("li");

      item.setAttribute("data-list-item-id", `attachments___${++uploads}`);
      item.textContent = file.name;
      item.file = file;
      tray.append(item);
    }
  }, 50);
});

document.addEventListener("keydown", (event) => {
  const box = event.target instanceof Element ? event.target.closest("[role=\"textbox\"]") : null;

  if (!box || event.key !== "Enter" || event.shiftKey) {
    return;
  }

  const composer = box.closest("form");
  const tray = composer.querySelector("[data-list-id=\"attachments\"]");
  const files = tray ? [...tray.children].map(item => item.file) : [];
  const text = box.textContent.trim();

  if (files.length || text) {
    event.preventDefault();
    globalThis.discordSent.push({ text, files });
    tray?.remove();
  }
});
