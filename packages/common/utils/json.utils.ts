export const safeJSONParse = (src?: string | Blob) => {
  try {
    return JSON.parse(src?.toString() as string)
  } catch (e) {
    return null
  }
}
