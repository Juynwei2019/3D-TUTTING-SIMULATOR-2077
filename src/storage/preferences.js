// Preserve raw encodings and let each caller retain its existing fallback/error UI.
export function createPreferences(getStorage){
  return {
    getItem: key => getStorage().getItem(key),
    setItem: (key, value) => getStorage().setItem(key, value),
  };
}
