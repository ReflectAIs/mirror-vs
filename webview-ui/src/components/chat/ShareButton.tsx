import { type HistoryItem } from "@mirror-vs/types"

interface ShareButtonProps {
	item?: HistoryItem
	disabled?: boolean
}

export const ShareButton = ({ item, disabled = false }: ShareButtonProps) => {
	void item
	void disabled
	return null
}
