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
}

export class FigmaTools {
    private static BASE_URL = 'https://api.figma.com/v1';

    static async getLayout(fileId: string, nodeId: string, token: string): Promise<string> {
        if (!token) return "Error: Figma Access Token missing in settings.";
        
        try {
            // URL encode nodeId as it often contains special chars like : or -
            const encodedNodeId = encodeURIComponent(nodeId);
            const response = await axios.get(`${this.BASE_URL}/files/${fileId}/nodes?ids=${encodedNodeId}`, {
                headers: { 'X-Figma-Token': token }
            });

            if (!response.data.nodes) {
                return `Error: No nodes returned from Figma for ID ${nodeId}. Check if the ID is correct.`;
            }

            // The API sometimes returns nodes with a slightly different ID format (e.g., swapping - for :)
            // We take the first available node if our exact ID isn't a direct key
            const nodeResponse = response.data.nodes[nodeId] || Object.values(response.data.nodes)[0];
            
            if (!nodeResponse || !nodeResponse.document) {
                return `Error: Node "${nodeId}" not found in response. Available IDs: ${Object.keys(response.data.nodes).join(', ')}`;
            }

            return this.processNode(nodeResponse.document);
        } catch (error: any) {
            return `Error fetching Figma layout: ${error.message}`;
        }
    }

    static async getColors(fileId: string, token: string): Promise<string> {
        if (!token) return "Error: Figma Access Token missing.";
        try {
            const response = await axios.get(`${this.BASE_URL}/files/${fileId}/variables/local`, {
                headers: { 'X-Figma-Token': token }
            });
            
            const variables = response.data.meta?.variables || [];
            let css = "@theme {\n";
            variables.forEach((v: any) => {
                if (v.resolvedType === 'COLOR') {
                    css += `  --color-${v.name.toLowerCase().replace(/\//g, '-')}: ${this.rgbaToHex(v.valuesByMode[Object.keys(v.valuesByMode)[0]])};\n`;
                }
            });
            css += "}";
            return css;
        } catch (error: any) {
            if (error.response?.status === 403) {
                return `[FIGMA_PLAN_RESTRICTION] 403 Forbidden: The Figma Variables API is restricted to Pro/Enterprise plans.
RECOVERY HINT: Proceed by using <get_figma_layout> instead. You can extract individual 'fills' (background colors) directly from the Pseudo-DOM layout tree. Do NOT try to use get_figma_colors again for this file.`;
            }
            return `Error fetching Figma colors: ${error.message}`;
        }
    }

    static async getTypography(fileId: string, token: string): Promise<string> {
        if (!token) return "Error: Figma Access Token missing.";
        try {
            const response = await axios.get(`${this.BASE_URL}/files/${fileId}?depth=1`, {
                headers: { 'X-Figma-Token': token }
            });
            
            const styles = response.data.styles || {};
            let output = "Figma Typography Tokens:\n";
            Object.keys(styles).forEach(id => {
                if (styles[id].styleType === 'TEXT') {
                    output += `- ${styles[id].name}: font-sans text-[size] leading-[height]\n`;
                }
            });
            return output;
        } catch (error: any) {
            return `Error fetching typography: ${error.message}`;
        }
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

        // 1. Colors (Differentiates between Text and Frame)
        if (node.fills && node.fills.length > 0) {
            const fill = node.fills[0];
            if (fill.type === 'SOLID') {
                const hex = this.rgbaToHex(fill.color);
                if (node.type === 'TEXT') {
                    classes.push(`text-[${hex}]`);
                } else {
                    classes.push(`bg-[${hex}]`);
                }
            }
        }

        // 2. Typography (Only for TEXT nodes)
        if (node.type === 'TEXT' && node.style) {
            if (node.style.fontSize) classes.push(`text-[${Math.round(node.style.fontSize)}px]`);
            if (node.style.fontWeight && node.style.fontWeight > 400) {
                classes.push(`font-[${node.style.fontWeight}]`);
            }
        }

        // 3. Layout (Only for Frames/Components)
        if (node.layoutMode === 'HORIZONTAL') classes.push('flex', 'flex-row');
        if (node.layoutMode === 'VERTICAL') classes.push('flex', 'flex-col');
        
        if (node.itemSpacing) classes.push(`gap-${Math.round(node.itemSpacing / 4)}`);

        // Padding
        if (node.paddingTop) classes.push(`pt-${Math.round(node.paddingTop / 4)}`);
        if (node.paddingBottom) classes.push(`pb-${Math.round(node.paddingBottom / 4)}`);
        if (node.paddingLeft) classes.push(`pl-${Math.round(node.paddingLeft / 4)}`);
        if (node.paddingRight) classes.push(`pr-${Math.round(node.paddingRight / 4)}`);

        // Alignment
        if (node.primaryAxisAlignItems === 'CENTER') classes.push('justify-center');
        if (node.counterAxisAlignItems === 'CENTER') classes.push('items-center');

        // Border Radius
        if (node.cornerRadius) classes.push('rounded-xl');
        
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
