/**
 * Re-exports from telegram.utils for backward compatibility.
 * The actual implementation lives in telegram.utils.ts to avoid circular imports.
 */
export {
  type MediaFileRef,
  collectMediaFileRefs,
  collectMessageImageFileIds,
} from './telegram.utils'
