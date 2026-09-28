import { Package } from "../../shared/package"

export const DEFAULT_HEADERS = {
	"HTTP-Referer": "https://github.com/ReflectAIs/mirror-vs",
	"X-Title": "Mirror VS",
	"X-OpenRouter-Title": "Mirror VS",
	"X-OpenRouter-Categories": "ide-extension,cli-agent",
	"User-Agent": `MirrorVS/${Package.version}`,
}
