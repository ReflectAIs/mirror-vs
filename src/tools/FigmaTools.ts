import axios from 'axios';

export interface FigmaNode {
    id: string;
    name: string;
    type: string;
    layoutMode?: 'HORIZONTAL' | 'VERTICAL';
    primaryAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
    counterAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'BASELINE';
    itemSpacing?: number;
    paddingLeft?: number;
    paddingRight?: number;
    paddingTop?: number;
    paddingBottom?: number;
    fills?: any[];
    cornerRadius?: number;
    children?: FigmaNode[];
    characters?: string;
    style?: any;
    strokeWeight?: number;
    strokes?: any[];
}

export class FigmaTools {
    private static BASE_URL = 'https://api.figma.com/v1';

    static async getLayout(fileId: string, nodeId: string, token: string): Promise<string> {
        if (!token) return "Error: Figma Access Token missing in settings.";
        
        try {
            const encodedNodeId = encodeURIComponent(nodeId);
            const response = await axios.get(`${this.BASE_URL}/files/${fileId}/nodes?ids=${encodedNodeId}`, {
                headers: { 'X-Figma-Token': token }
            });

            if (!response.data.nodes) {
                return `Error: No nodes returned for ID ${nodeId}. Check if the ID is correct.`;
            }

            const nodeResponse = response.data.nodes[nodeId] || Object.values(response.data.nodes)[0];
            if (!nodeResponse || !nodeResponse.document) {
                return `Error: Node "${nodeId}" not found.`;
            }

            // 1. Extract Theme Metadata (Colors & Fonts across the entire tree)
            const theme = this.extractTheme(nodeResponse.document);
            let themeHeader = "--- PROJECT THEME SUMMARY ---\n";
            themeHeader += `COLORS: ${Array.from(theme.colors).join(', ')}\n`;
            themeHeader += `FONTS: ${Array.from(theme.fonts).join(', ')}\n`;
            themeHeader += "----------------------------\n\n";

            // 2. Generate Enhanced Pseudo-DOM
            const layout = this.processNode(nodeResponse.document);
            
            return themeHeader + layout;
        } catch (error: any) {
            return `Error fetching Figma layout: ${error.message}`;
        }
    }

    // Deprecated for Free plans - Redirecting to Unified Layout
    static async getColors(fileId: string, token: string): Promise<string> {
        return "INFO: get_figma_colors is deprecated for Free plans. Please use <get_figma_layout> on your main container to see all project colors in the Theme Summary.";
    }

    static async getTypography(fileId: string, token: string): Promise<string> {
        return "INFO: get_figma_typography is deprecated for Free plans. Please use <get_figma_layout> on your main container to see all typography in the Theme Summary.";
    }

    private static extractTheme(node: FigmaNode, theme: { colors: Set<string>, fonts: Set<string> } = { colors: new Set(), fonts: new Set() }) {
        if (node.fills) {
            node.fills.forEach(f => {
                if (f.type === 'SOLID' && f.color) theme.colors.add(this.rgbaToHex(f.color));
            });
        }
        if (node.type === 'TEXT' && node.style) {
            if (node.style.fontFamily) theme.fonts.add(node.style.fontFamily);
        }
        if (node.children) {
            node.children.forEach(c => this.extractTheme(c, theme));
        }
        return theme;
    }

    private static processNode(node: FigmaNode, depth: number = 0): string {
        const indent = '  '.repeat(depth);
        const twClasses = this.mapToTailwind(node);
        const tag = node.type === 'TEXT' ? 'p' : (node.name.toLowerCase().includes('button') ? 'button' : 'div');
        
        let contentInfo = '';
        if (node.type === 'TEXT' && node.characters) {
            contentInfo = ` "${node.characters.replace(/\n/g, ' ')}"`;
        }

        let result = `${indent}${node.type}${contentInfo} ("${node.name}") (${tag}) [Tailwind: ${twClasses}]\n`;

        if (node.children) {
            node.children.forEach(child => {
                result += this.processNode(child, depth + 1);
            });
        }

        return result;
    }

    private static mapToTailwind(node: FigmaNode): string {
        const classes: string[] = [];

        // 1. Text Properties
        if (node.type === 'TEXT' && node.style) {
            if (node.style.fontSize) classes.push(`text-[${Math.round(node.style.fontSize)}px]`);
            if (node.style.fontWeight) classes.push(`font-[${node.style.fontWeight}]`);
            if (node.style.lineHeightPx) classes.push(`leading-[${Math.round(node.style.lineHeightPx)}px]`);
            if (node.style.textAlignHorizontal === 'CENTER') classes.push('text-center');
        }

        // 2. Colors
        if (node.fills && node.fills.length > 0) {
            const fill = node.fills[0];
            if (fill.type === 'SOLID') {
                const hex = this.rgbaToHex(fill.color);
                classes.push(node.type === 'TEXT' ? `text-[${hex}]` : `bg-[${hex}]`);
            }
        }

        // 3. Layout (Flexbox)
        if (node.layoutMode === 'HORIZONTAL') classes.push('flex', 'flex-row');
        if (node.layoutMode === 'VERTICAL') classes.push('flex', 'flex-col');
        
        if (node.itemSpacing) classes.push(`gap-[${node.itemSpacing}px]`);

        // Padding
        if (node.paddingTop) classes.push(`pt-[${node.paddingTop}px]`);
        if (node.paddingBottom) classes.push(`pb-[${node.paddingBottom}px]`);
        if (node.paddingLeft) classes.push(`pl-[${node.paddingLeft}px]`);
        if (node.paddingRight) classes.push(`pr-[${node.paddingRight}px]`);

        // Alignment
        if (node.primaryAxisAlignItems === 'CENTER') classes.push('justify-center');
        if (node.counterAxisAlignItems === 'CENTER') classes.push('items-center');

        // 4. Borders & Radius
        if (node.cornerRadius) classes.push(`rounded-[${node.cornerRadius}px]`);
        if (node.strokeWeight) {
            classes.push(`border-[${node.strokeWeight}px]`);
            if (node.strokes && node.strokes.length > 0 && node.strokes[0].color) {
                classes.push(`border-[${this.rgbaToHex(node.strokes[0].color)}]`);
            }
        }

        // 5. Dimension Awareness (Hugging/Fixed)
        // If no layout mode but has width/height, it's absolute
        // but here we just give a hint
        return classes.join(' ');
    }

    private static rgbaToHex(color: any): string {
        if (!color) return '#000000';
        const r = Math.round(color.r * 255).toString(16).padStart(2, '0');
        const g = Math.round(color.g * 255).toString(16).padStart(2, '0');
        const b = Math.round(color.b * 255).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
    }
}
