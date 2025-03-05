declare const __NAME__: string;

export class PickerHelper {
  static isOpen(): boolean {
    return document.getElementById("[class*=\"expressionPickerPositionLayer__\"]") !== null;
  } 

  static toggle(): void {
    const root = document.getElementById(__NAME__);
    const btn = root?.previousSibling?.childNodes[0] as HTMLButtonElement;

    if (btn) {
      btn.click();
    }
  }
}
