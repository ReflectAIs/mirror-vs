import type { ExperimentId } from "@mirror-vs/types"

import { ExtensionStateContextType } from "@/context/ExtensionStateContext"

export type SetCachedStateField<K extends keyof ExtensionStateContextType> = (
	field: K,
	value: ExtensionStateContextType[K],
	isUserAction?: boolean,
) => void

export type SetExperimentEnabled = (id: ExperimentId, enabled: boolean) => void
