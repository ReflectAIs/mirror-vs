import React from "react"
import { render, screen } from "@/utils/test-utils"

import MirrorTips from "../MirrorTips"

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}))

describe("MirrorTips Component", () => {
    beforeEach(() => {
        render(<MirrorTips />)
    })

    test("renders greeting card heading", () => {
        expect(screen.getByText("Next-Gen AI Pair Programming")).toBeInTheDocument()
    })

    test("renders Custom Modes card", () => {
        expect(screen.getByText("Custom Modes")).toBeInTheDocument()
    })

    test("renders Safe Execution card", () => {
        expect(screen.getByText("Safe Execution")).toBeInTheDocument()
    })
})
