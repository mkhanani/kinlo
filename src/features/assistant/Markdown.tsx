import { Fragment } from "react";
import type { ReactNode } from "react";

/**
 * Shows the small amount of formatting models use in replies: paragraphs, short lists,
 * bold, italics and code. Everything is rendered as text, never as HTML, so nothing a
 * model writes can run or load anything.
 */
export function Markdown({ text }: { text: string }) {
  return <div className="flex flex-col gap-2">{blocks(text).map((block, index) => renderBlock(block, index))}</div>;
}

type Block = { kind: "p"; lines: string[] } | { kind: "ul" | "ol"; items: string[] };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBER = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;

function blocks(text: string): Block[] {
  const out: Block[] = [];
  for (const line of text.replace(/\r/g, "").split("\n")) {
    if (!line.trim()) {
      out.push({ kind: "p", lines: [] });
      continue;
    }
    const bullet = BULLET.exec(line);
    const number = bullet ? null : NUMBER.exec(line);
    const kind = bullet ? "ul" : number ? "ol" : "p";
    const content = bullet?.[1] ?? number?.[1] ?? HEADING.exec(line)?.[1] ?? line;
    const last = out.at(-1);
    if (kind === "p") {
      if (last?.kind === "p") last.lines.push(content);
      else out.push({ kind: "p", lines: [content] });
    } else if (last?.kind === kind) {
      last.items.push(content);
    } else {
      out.push({ kind, items: [content] });
    }
  }
  return out.filter((block) => (block.kind === "p" ? block.lines.length > 0 : block.items.length > 0));
}

function renderBlock(block: Block, key: number): ReactNode {
  if (block.kind === "p") {
    return (
      <p key={key} className="whitespace-pre-wrap break-words">
        {block.lines.map((line, index) => (
          <Fragment key={index}>
            {index > 0 && "\n"}
            {inline(line)}
          </Fragment>
        ))}
      </p>
    );
  }
  const List = block.kind;
  return (
    <List key={key} className={`flex flex-col gap-1 pl-5 ${block.kind === "ul" ? "list-disc" : "list-decimal"}`}>
      {block.items.map((item, index) => (
        <li key={index} className="break-words pl-0.5 marker:text-subtle">
          {inline(item)}
        </li>
      ))}
    </List>
  );
}

const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\s][^*\n]*\*|_[^_\s][^_\n]*_)/g;

function inline(text: string): ReactNode[] {
  return text.split(INLINE).map((piece, index) => {
    if (piece.startsWith("**") && piece.endsWith("**") && piece.length > 4) {
      return (
        <strong key={index} className="font-semibold">
          {piece.slice(2, -2)}
        </strong>
      );
    }
    if (piece.startsWith("`") && piece.endsWith("`") && piece.length > 2) {
      return (
        <code key={index} className="rounded-[5px] bg-control px-1 py-px text-[0.92em]">
          {piece.slice(1, -1)}
        </code>
      );
    }
    if (piece.length > 2 && ((piece.startsWith("*") && piece.endsWith("*")) || (piece.startsWith("_") && piece.endsWith("_")))) {
      return <em key={index}>{piece.slice(1, -1)}</em>;
    }
    return <Fragment key={index}>{piece}</Fragment>;
  });
}
