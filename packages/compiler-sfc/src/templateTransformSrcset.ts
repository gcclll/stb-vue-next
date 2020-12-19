import { NodeTransform } from '@vue/compiler-dom'
import {
  AssetURLOptions,
  defaultAssetUrlOptions
} from './templateTransformAssetUrl'

export const createSrcsetTransformWithOptions = (
  options: Required<AssetURLOptions>
): NodeTransform => {
  return (node, context) =>
    (transformSrcset as Function)(node, context, options)
}

export const transformSrcset: NodeTransform = (
  node,
  context,
  options: Required<AssetURLOptions> = defaultAssetUrlOptions
) => {}
