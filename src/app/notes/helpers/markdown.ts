import { marked } from 'marked';

export function toHtml(markdown: string) {
  return String(marked.parse(markdown, { async: false }));
}

export function htmlToMd(root: HTMLElement): string {
  function walk(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();
    const childMarkdown = () =>
      Array.from(element.childNodes).map(walk).join('');

    if (tag === 'br') return '\n';
    if (tag === 'strong' || tag === 'b') return `**${childMarkdown()}**`;
    if (tag === 'em' || tag === 'i') return `*${childMarkdown()}*`;
    if (tag === 'u') return `<u>${childMarkdown()}</u>`;
    if (tag === 's' || tag === 'strike' || tag === 'del')
      return `~~${childMarkdown()}~~`;
    if (tag === 'code') {
      return element.parentElement?.tagName.toLowerCase() === 'pre'
        ? childMarkdown()
        : `\`${childMarkdown()}\``;
    }
    if (tag === 'pre') return `\`\`\`\n${childMarkdown()}\n\`\`\`\n\n`;
    if (tag === 'h1') return `# ${childMarkdown().trim()}\n\n`;
    if (tag === 'h2') return `## ${childMarkdown().trim()}\n\n`;
    if (tag === 'h3') return `### ${childMarkdown().trim()}\n\n`;
    if (tag === 'p' || tag === 'div') {
      const text = childMarkdown();
      return text ? `${text.replace(/\n$/, '')}\n\n` : '';
    }
    if (tag === 'li') return `- ${childMarkdown().trim()}\n`;
    if (tag === 'ul' || tag === 'ol') return `${childMarkdown()}\n`;
    if (tag === 'a') {
      return `[${childMarkdown()}](${element.getAttribute('href') || ''})`;
    }

    return childMarkdown();
  }

  return Array.from(root.childNodes)
    .map(walk)
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
