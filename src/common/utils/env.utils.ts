export const getOptionalEnv = (name: string): string | undefined => {
  const value = process.env[name]?.trim()

  // Treat blank or whitespace-only env values as unset.
  return value || undefined
}

export const getRequiredEnv = (name: string): string => {
  const value = getOptionalEnv(name)
  if (!value) {
    throw new Error(`${name} is not set`)
  }

  return value
}
