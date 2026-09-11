import { parseMarkdown, stringifyMarkdown } from "leadtype/markdown";

const flattenNodes = (
  nodes: ReturnType<typeof parseMarkdown>
): ReturnType<typeof parseMarkdown> =>
  nodes.flatMap((node) => [
    node,
    ...("children" in node ? flattenNodes(node.children) : []),
  ]);

export const markdownLinks = (content: string): string[] =>
  flattenNodes(parseMarkdown(content)).flatMap((node) =>
    node.type === "link" || node.type === "definition" || node.type === "image"
      ? [node.url]
      : []
  );

// Parse the body separately so YAML metadata survives Markdown serialization.
export const packageMarkdown = (content: string): string => {
  const frontmatter =
    content.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/u)?.[0] ?? "";
  const children = parseMarkdown(content.slice(frontmatter.length));
  for (const node of flattenNodes(children)) {
    if (node.type === "link" || node.type === "definition") {
      node.url = node.url.replace(
        /^\.\/(?<topic>[\w/-]+)(?<anchor>#[^\s]*)?$/u,
        "./$<topic>.md$<anchor>"
      );
    }
  }
  return frontmatter + stringifyMarkdown({ children, type: "root" });
};
