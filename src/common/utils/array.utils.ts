/**
 * Selects a random element from the provided array.
 *
 * @param collection - The array to sample from.
 * @returns A random element from the array, or undefined if the array is empty.
 */
export function sample<T>(collection: T[]): T | undefined {
  if (collection.length === 0) {
    return undefined
  }
  const randomIndex = Math.floor(Math.random() * collection.length)
  return collection[randomIndex]
}
