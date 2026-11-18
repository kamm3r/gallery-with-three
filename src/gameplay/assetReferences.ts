export function validModelAsset(url: unknown): url is string {
  if (
    typeof url !== "string" ||
    url.length > 1024 ||
    !url.startsWith("/assets/") ||
    !/\.(glb|gltf)$/i.test(url) ||
    /[?#\\\0]/.test(url)
  )
    return false;
  try {
    const path = decodeURIComponent(url);
    return !/[?#\\\0]/.test(path) && !path.split("/").some((part) => part === ".." || part === ".");
  } catch {
    return false;
  }
}
