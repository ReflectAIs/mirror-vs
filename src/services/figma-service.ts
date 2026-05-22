import * as https from 'https';

export class FigmaService {
  /**
   * Fetches the specified node from a Figma file and simplifies the resulting JSON tree for LLM consumption.
   */
  public async getSimplifiedNode(fileKey: string, nodeId: string, token: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${nodeId}`;
      const options = {
        headers: {
          'X-Figma-Token': token,
        },
      };

      https
        .get(url, options, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 400) {
              return reject(new Error(`Figma API Error: ${res.statusCode} - ${data}`));
            }

            try {
              const json = JSON.parse(data);
              if (!json.nodes || !json.nodes[nodeId]) {
                return reject(new Error('Node not found in Figma response.'));
              }

              const rootNode = json.nodes[nodeId].document;
              const simplified = this.simplifyNode(rootNode);
              resolve(JSON.stringify(simplified, null, 2));
            } catch (err: any) {
              reject(new Error(`Failed to parse Figma response: ${err.message}`));
            }
          });
        })
        .on('error', (err) => {
          reject(err);
        });
    });
  }

  /**
   * Recursively strips away noise from the massive Figma JSON payload.
   * We only keep type, name, layout properties, text characters, colors, and bounding boxes.
   */
  private simplifyNode(node: any): any {
    if (!node) return null;

    const simplified: any = {
      type: node.type,
      name: node.name,
    };

    if (node.characters) {
      simplified.text = node.characters;
    }

    if (node.absoluteBoundingBox) {
      simplified.box = {
        width: Math.round(node.absoluteBoundingBox.width),
        height: Math.round(node.absoluteBoundingBox.height),
      };
    }

    // Capture flex/auto-layout properties
    if (node.layoutMode && node.layoutMode !== 'NONE') {
      simplified.layoutMode = node.layoutMode; // 'HORIZONTAL' | 'VERTICAL'
      if (node.primaryAxisAlignItems) simplified.alignItems = node.primaryAxisAlignItems;
      if (node.counterAxisAlignItems) simplified.justifyContent = node.counterAxisAlignItems;
      if (node.paddingLeft) simplified.padding = node.paddingLeft;
      if (node.itemSpacing) simplified.gap = node.itemSpacing;
    }

    // Capture basic fills (colors)
    if (node.fills && Array.isArray(node.fills)) {
      const solidFills = node.fills.filter((f: any) => f.type === 'SOLID' && f.visible !== false);
      if (solidFills.length > 0) {
        const f = solidFills[0].color;
        simplified.color = this.rgbaToHex(f.r, f.g, f.b, f.a);
      }
    }

    // Typography styles
    if (node.style) {
      if (node.style.fontFamily) simplified.fontFamily = node.style.fontFamily;
      if (node.style.fontWeight) simplified.fontWeight = node.style.fontWeight;
      if (node.style.fontSize) simplified.fontSize = node.style.fontSize;
    }

    if (node.children && Array.isArray(node.children)) {
      const simplifiedChildren = node.children.map((child: any) => this.simplifyNode(child)).filter(Boolean);
      if (simplifiedChildren.length > 0) {
        simplified.children = simplifiedChildren;
      }
    }

    return simplified;
  }

  private rgbaToHex(r: number, g: number, b: number, a: number = 1): string {
    const toHex = (c: number) => {
      const hex = Math.round(c * 255).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    if (a < 1) {
      return `#${toHex(r)}${toHex(g)}${toHex(b)}${toHex(a)}`;
    }
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
}
