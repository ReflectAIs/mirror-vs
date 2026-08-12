import { useMemo } from "react"
import { useExtensionState } from "@src/context/ExtensionStateContext"

/**
 * Custom hook that creates and returns the auto-approval toggles object
 * This encapsulates the logic for creating the toggles object from extension state
 */
export function useAutoApprovalToggles() {
	const {
		alwaysAllowReadOnly,
		alwaysAllowWrite,
		alwaysAllowExecute,
		alwaysAllowGitCommit,
		alwaysAllowMcp,
		alwaysAllowModeSwitch,
		alwaysAllowSubtasks,
		alwaysAllowFollowupQuestions,
		alwaysAllowBrowser,
	} = useExtensionState()

	const toggles = useMemo(
		() => ({
			alwaysAllowReadOnly,
			alwaysAllowWrite,
			alwaysAllowExecute,
			alwaysAllowGitCommit,
			alwaysAllowMcp,
			alwaysAllowModeSwitch,
			alwaysAllowSubtasks,
			alwaysAllowFollowupQuestions,
			alwaysAllowBrowser,
		}),
		[
			alwaysAllowReadOnly,
			alwaysAllowWrite,
			alwaysAllowExecute,
			alwaysAllowGitCommit,
			alwaysAllowMcp,
			alwaysAllowModeSwitch,
			alwaysAllowSubtasks,
			alwaysAllowFollowupQuestions,
			alwaysAllowBrowser,
		],
	)

	return toggles
}
