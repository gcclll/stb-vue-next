import { DebuggerEvent } from '@vue/reactivity'
import { ComponentPublicInstance } from './componentPublicInstance'

export type DebuggerHook = (e: DebuggerEvent) => void

export type ErrorCapturedHook = (
  err: unknown,
  instance: ComponentPublicInstance | null,
  info: string
) => boolean | void
