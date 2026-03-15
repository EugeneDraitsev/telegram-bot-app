/**
 * Re-exports from telegram.utils for backward compatibility.
 * The actual implementation lives in telegram.utils.ts to avoid circular imports.
 */
export {
  collectMediaFileRefs,
  collectMessageImageFileIds,
  type MediaFileRef,
} from './telegram.utils'
