function isTagFullyClosed(text, toolName) {
  const openTag = `<${toolName}`;
  const startIdx = text.toLowerCase().indexOf(openTag);
  if (startIdx === -1) return false;

  let inDq = false;
  let inSq = false;
  let escaped = false;

  for (let i = startIdx + openTag.length; i < text.length; i++) {
    const char = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"' && !inSq) {
      inDq = !inDq;
      continue;
    }
    if (char === "'" && !inDq) {
      inSq = !inSq;
      continue;
    }
    if (char === '>' && !inDq && !inSq) {
      return true;
    }
  }
  return false;
}

const text = `<figma_inspect url="https://www.figma.com/design/6SsVL4qkRQyp2Lk3Eznbgu/MCP-Test?node-id=1-11&t=VTWsXj0Nb2I10Qwa-0" />`;
console.log("isTagFullyClosed:", isTagFullyClosed(text, 'figma_inspect'));

const candidates = [];
const attr = (attrs, name) => {
  const dq = new RegExp(`${name}\\s*=\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"`, 'i').exec(attrs);
  if (dq) {
    return dq[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  const sq = new RegExp(`${name}\\s*=\\s*'([^'\\\\]*(?:\\\\.[^'\\\\]*)*)'`, 'i').exec(attrs);
  if (sq) {
    return sq[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  }
  return null;
};

const figmaInspectRegex = /<figma_inspect([\s\S]*?)\/?>/gi;
let match;
while ((match = figmaInspectRegex.exec(text)) !== null) {
  const u = attr(match[1], 'url');
  if (u) {
    candidates.push({ index: match.index, tool: { name: 'figma_inspect', url: u } });
  }
}
console.log("Candidates:", candidates);
