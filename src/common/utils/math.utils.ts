/**
 * Generates a random number between the inclusive lower and upper bounds.
 * If either lower or upper is a floating-point number, a floating-point number is returned.
 * Otherwise, an integer is returned.
 *
 * @param lower - The lower bound of the range.
 * @param upper - The upper bound of the range.
 * @returns A random number between lower and upper.
 */
export function random(lower: number, upper: number) {
  const low = lower > upper ? upper : lower
  const high = lower > upper ? lower : upper

  // Determine if a floating number should be returned
  const isFloating = !Number.isInteger(low) || !Number.isInteger(high)

  if (isFloating) {
    // Generate floating-point number
    return Math.random() * (high - low) + low
  }
  // Generate integer
  return Math.floor(Math.random() * (high - low + 1)) + low
}

/**
 * Clamps a number within the inclusive lower and upper bounds.
 *
 * @param value - The number to clamp.
 * @param lower - The lower bound.
 * @param upper - The upper bound.
 * @returns The clamped number.
 */
export function clamp(value: number, lower: number, upper: number) {
  if (lower > upper) {
    throw new Error('Lower bound cannot be greater than upper bound.')
  }

  if (value < lower) {
    return lower
  }
  if (value > upper) {
    return upper
  }

  return value
}

/**
 * Rounds a number to a specified precision.
 *
 * @param value - The number to round.
 * @param precision - The number of decimal places to round to.
 * @returns The rounded number.
 */
export function round(value: number, precision = 0) {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}
