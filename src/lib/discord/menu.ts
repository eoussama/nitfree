import { CLASS_PATTERNS } from "./selectors";



/**
 * How a Discord context menu's items look, for an item Nitfree adds.
 */
export type TMenuLook = {
  item: string;
  label: string;
  iconContainer: string;
  icon: string;
  focused: string;
  separator: string;

  /**
   * Whether the items show their icon before their label, as Discord's newer menus do.
   */
  iconFirst: boolean;

  /**
   * The label's font and the icon's size, measured: Discord sets them through classes on inner
   * wrappers that change more often than the item's own.
   */
  font: string;
  iconSize: number;
};

/**
 * Discord's icon size in menus, for when there is no icon to measure.
 */
const ICON_SIZE = 18;

function firstClass(elements: Iterable<Element>, pattern: RegExp): string {
  for (const element of elements) {
    const name = [...element.classList].find(found => pattern.test(found));

    if (name) {
      return name;
    }
  }

  return "";
}

/**
 * Reads how a Discord context menu's items look, so an item Nitfree adds looks like the others.
 * The highlight and separator classes come from Discord's same stylesheet, so when no item is
 * highlighted or no separator shows, they are named after the item's.
 *
 * @param menu - The open menu.
 * @returns The look, with empty classes when Discord's markup has changed.
 */
export function readMenuLook(menu: Element): TMenuLook {
  const items = [...menu.querySelectorAll("[role=\"menuitem\"]")];
  // A plain item with an icon, not red like Delete, and not highlighted.
  const plain = items.filter(item => [...item.classList].some(name => name.startsWith("colorDefault_")));
  const model = plain.find(item => item.querySelector("svg")) ?? plain[0] ?? items[0];
  // Stryker disable next-line ArrayDeclaration: a menu with no item has no class to keep, whatever stands in.
  const item = [...model?.classList ?? []].filter(name => CLASS_PATTERNS.menuItem.test(name));
  const suffix = item.find(name => name.startsWith("item_"))?.slice("item_".length);
  const descendants = [...model?.querySelectorAll("*") ?? []];
  const leftIcon = firstClass(descendants, CLASS_PATTERNS.menuIconContainerLeft);
  const label = descendants.find(element => [...element.classList].some(name => CLASS_PATTERNS.menuLabel.test(name)));
  // The innermost element with the text, which carries the font.
  // Stryker disable next-line OptionalChaining: an element's text is never missing, only empty.
  const text = label && [label, ...label.querySelectorAll("*")].findLast(element => element.textContent?.trim());
  const style = text && getComputedStyle(text);
  const icon = model?.querySelector("svg")?.getBoundingClientRect().width;

  return {
    item: item.join(" "),
    label: label ? firstClass([label], CLASS_PATTERNS.menuLabel) : "",
    iconContainer: leftIcon || firstClass(descendants, CLASS_PATTERNS.menuIconContainer),
    icon: firstClass(descendants, CLASS_PATTERNS.menuIcon),
    focused: firstClass(items, CLASS_PATTERNS.menuFocused) || (suffix ? `focused_${suffix}` : ""),
    separator: firstClass(menu.querySelectorAll("[role=\"separator\"]"), CLASS_PATTERNS.menuSeparator) || (suffix ? `separator_${suffix}` : ""),
    iconFirst: Boolean(leftIcon),
    font: style ? `font-size: ${style.fontSize}; font-weight: ${style.fontWeight}; line-height: ${style.lineHeight};` : "",
    iconSize: icon || ICON_SIZE,
  };
}
