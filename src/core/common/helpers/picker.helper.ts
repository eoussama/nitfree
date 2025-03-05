export class PickerHelper {
  static isOpen(): boolean {
    return document.getElementById("[class*=\"expressionPickerPositionLayer__\"]") !== null;
  } 
}
