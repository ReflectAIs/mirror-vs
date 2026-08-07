import { useState } from "react"
import { Box, Text, useInput } from "ink"
import * as theme from "../theme.js"

export interface SuggestionOption {
	label: string
	value: string
}

export interface SuggestionSelectProps {
	options: SuggestionOption[]
	onSelect: (value: string) => void
	isActive?: boolean
}

export function SuggestionSelect({ options, onSelect, isActive = true }: SuggestionSelectProps) {
	const [selectedIndex, setSelectedIndex] = useState(0)

	useInput(
		(input, key) => {
			if (key.upArrow) {
				setSelectedIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1))
			} else if (key.downArrow) {
				setSelectedIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0))
			} else if (key.return) {
				const selectedOption = options[selectedIndex]
				if (selectedOption) {
					onSelect(selectedOption.value)
				}
			}
		},
		{ isActive },
	)

	return (
		<Box flexDirection="column">
			{options.map((option, index) => {
				const isSelected = index === selectedIndex
				return (
					<Box key={option.value} paddingLeft={1}>
						<Text color={isSelected ? theme.focusColor : theme.dimText} bold={isSelected}>
							{isSelected ? "❯ " : "  "}
							{option.label}
						</Text>
					</Box>
				)
			})}
		</Box>
	)
}
