/** Keep editor-only input and audio behavior scoped to the test-world editor. */
export function isPlaygroundEditor(pathname: string, search: string) {
  return pathname === "/playground" && new URLSearchParams(search).has("inspector");
}
