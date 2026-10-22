/**
 * Saves a file through the browser's download, as the user would from a link.
 *
 * @param file - The file's content.
 * @param name - The name to save it under.
 */
export function download(file: Blob, name: string): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");

  link.href = url;
  link.download = name;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();

  // The download starts on the click; the address is only needed until then.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Makes a title safe to use as a file name on every system.
 *
 * @param title - A title, such as an item's.
 * @returns The title without characters file systems reject, or "file" when nothing is left.
 */
export function safeFileName(title: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = title.replace(/[\u0000-\u001F<>:"/\\|?*]/g, "").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "");

  return cleaned.slice(0, 100) || "file";
}

/**
 * The name an export is saved under, dated so repeated exports do not overwrite one another.
 *
 * @param extension - The extension, with its dot.
 * @param date - The export date.
 * @returns A name such as "nitfree-2026-10-22.nitfree".
 */
export function exportName(extension: string, date = new Date()): string {
  const day = [date.getFullYear(), date.getMonth() + 1, date.getDate()].map(part => String(part).padStart(2, "0")).join("-");

  return `nitfree-${day}${extension}`;
}
