export function openCommandPalette() {
  window.dispatchEvent(new Event("command-palette:open"));
}