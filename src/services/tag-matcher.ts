/**
 * Real-time streaming tag matcher for parsing XML-like tags from LLM output.
 * Handles <thinking>, <reasoning>, and other block tags that models emit.
 * Adapted from Roo Code's tag-matcher utility.
 */

export interface TagMatch {
  type: 'text' | 'thinking' | 'reasoning' | 'content';
  text: string;
}

export class TagMatcher {
  private buffer = '';
  private inTag: string | null = null;
  private tagStack: string[] = [];
  private readonly supportedTags: Set<string>;

  constructor(supportedTags: string[] = ['thinking', 'reasoning']) {
    this.supportedTags = new Set(supportedTags);
  }

  /**
   * Feed a chunk of text and get back parsed segments.
   */
  update(chunk: string): TagMatch[] {
    this.buffer += chunk;
    const results: TagMatch[] = [];

    let pos = 0;
    while (pos < this.buffer.length) {
      if (this.inTag) {
        const closeTag = `</${this.inTag}>`;
        const closeIndex = this.buffer.indexOf(closeTag, pos);

        if (closeIndex === -1) {
          // No close tag yet, emit remaining as <tag> content
          results.push({
            type: this.inTag as TagMatch['type'],
            text: this.buffer.slice(pos),
          });
          pos = this.buffer.length;
        } else {
          // Emit content before close tag
          if (closeIndex > pos) {
            results.push({
              type: this.inTag as TagMatch['type'],
              text: this.buffer.slice(pos, closeIndex),
            });
          }
          pos = closeIndex + closeTag.length;
          this.inTag = null;
          this.tagStack.pop();
        }
      } else {
        // Look for opening tag
        let foundTag: string | null = null;
        let foundIndex = -1;

        for (const tag of this.supportedTags) {
          const openTag = `<${tag}>`;
          const idx = this.buffer.indexOf(openTag, pos);
          if (idx !== -1 && (foundTag === null || idx < foundIndex)) {
            foundTag = tag;
            foundIndex = idx;
          }
        }

        if (foundTag && foundIndex >= 0) {
          // Emit text before the tag
          if (foundIndex > pos) {
            results.push({
              type: 'text',
              text: this.buffer.slice(pos, foundIndex),
            });
          }
          this.inTag = foundTag;
          this.tagStack.push(foundTag);
          pos = foundIndex + foundTag.length + 2; // skip `<tagname>`
        } else {
          // No tag found in remaining buffer
          results.push({
            type: 'text',
            text: this.buffer.slice(pos),
          });
          pos = this.buffer.length;
        }
      }
    }

    // Trim consumed buffer
    this.buffer = '';
    return results;
  }

  /**
   * Flush any remaining buffered content after stream completes.
   */
  final(): TagMatch[] {
    const remaining =
      this.buffer.length > 0
        ? [{ type: 'text' as const, text: this.buffer }]
        : [];
    this.buffer = '';
    return remaining;
  }
}
