/// <reference types="vinxi/types/server" />
import {
  getRouterManifest,
} from '@tanstack/start/router-manifest'
import { createStartHandler, defaultStreamHandler } from '@tanstack/start/server'
import { createRouter } from './router'

const handler = createStartHandler({
  createRouter,
  getRouterManifest,
})

export default handler({
  default: defaultStreamHandler,
})
