/**
 * Browser-safe exports for the core package. These can safely be used
 * in browser environments (React, Next.js, webview-ui) and Figma plugins.
 */

export * from "./agent/index.js"
export * from "./custom-tools/tool-registry.js"
export * from "./custom-tools/serialize.js"
export * from "./custom-tools/format-native.js"
export { defineTool, defineCustomTool } from "@mirror-vs/types"
export * from "./message-utils/index.js"
