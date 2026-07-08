import { useTranslation } from "react-i18next"
import { Sparkles, Code2, Compass, ShieldCheck } from "lucide-react"
import { vscode } from "@src/utils/vscode"

const MirrorTips = () => {
    const { t } = useTranslation("chat")

    const handleOpenSettings = () => {
        vscode.postMessage({ type: "switchTab", tab: "settings" })
    }

    const handleOpenHistory = () => {
        vscode.postMessage({ type: "switchTab", tab: "history" })
    }

    return (
        <div className="flex flex-col gap-5 max-w-[500px]">
            {/* Main Premium Greeting Card */}
            <div className="mirror-glass-card p-5 border border-vscode-editorGroup-border/50 bg-vscode-editor-background/60 flex flex-col gap-3 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 bg-gradient-to-bl from-mirror-brand-via/10 to-transparent rounded-bl-full pointer-events-none" />
                <h3 className="text-md font-bold text-vscode-foreground m-0 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-mirror-brand-via animate-pulse" />
                    Next-Gen AI Pair Programming
                </h3>
                <p className="text-xs text-vscode-descriptionForeground leading-relaxed m-0">
                    Welcome to your cybernetic development environment. Mirror VS works alongside you with customizable agent profiles, full terminal automation, and smart project awareness.
                </p>
            </div>

            {/* Feature Cards Grid */}
            <div className="grid grid-cols-2 gap-3">
                <div 
                    onClick={handleOpenSettings}
                    className="mirror-glass-card p-3 border border-vscode-editorGroup-border/40 hover:border-mirror-brand-via/50 cursor-pointer flex flex-col gap-1.5 transition-all duration-200"
                >
                    <div className="flex items-center gap-2 text-vscode-foreground font-semibold text-xs">
                        <Code2 className="w-3.5 h-3.5 text-mirror-brand-from" />
                        Custom Modes
                    </div>
                    <span className="text-[10px] text-vscode-descriptionForeground leading-normal">
                        Switch between Architect, Developer, and customized system personas.
                    </span>
                </div>

                <div 
                    onClick={handleOpenHistory}
                    className="mirror-glass-card p-3 border border-vscode-editorGroup-border/40 hover:border-mirror-brand-via/50 cursor-pointer flex flex-col gap-1.5 transition-all duration-200"
                >
                    <div className="flex items-center gap-2 text-vscode-foreground font-semibold text-xs">
                        <ShieldCheck className="w-3.5 h-3.5 text-mirror-brand-to" />
                        Safe Execution
                    </div>
                    <span className="text-[10px] text-vscode-descriptionForeground leading-normal">
                        Full auto-approve controls for terminal, file, and browser actions.
                    </span>
                </div>
            </div>
        </div>
    )
}

export default MirrorTips
