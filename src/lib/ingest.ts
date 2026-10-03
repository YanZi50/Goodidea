// 文档摄取管线：读取 → 哈希去重 → 分块 → 入库
// 一期格式：.txt / .md（原生读取）、.docx（mammoth 解析）
// 二期：.pdf / 图片 OCR（非一期范围）
import mammoth from "mammoth";
import {
  findDocumentByHash,
  insertDocument,
  insertChunk,
} from "./db";

/** 按扩展名读取文件为纯文本 */
export async function readFileText(file: File): Promise<string> {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (ext === "docx") {
    const buf = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    return result.value;
  }
  if (ext === "txt" || ext === "md" || ext === "markdown" || ext === "text") {
    return await file.text();
  }
  throw new Error(`暂不支持 .${ext} 格式（一期仅 .txt / .md / .docx）`);
}

/** SHA-256 内容哈希（去重键） */
export async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 分块：优先段落边界，超长段落按句子/字符硬切，每块 ≤ maxLen 字符 */
export function chunkText(text: string, maxLen = 1500): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  const chunks: string[] = [];
  const paragraphs = normalized.split(/\n{2,}/);
  let current = "";

  const push = (part: string) => {
    const trimmed = part.trim();
    if (!trimmed) return;
    chunks.push(`${trimmed}\n`);
  };

  for (const p of paragraphs) {
    const para = p.trim();
    if (!para) continue;
    if (para.length <= maxLen) {
      if (current.length + para.length > maxLen && current) {
        push(current);
        current = "";
      }
      current += (current ? "\n\n" : "") + para;
      continue;
    }
    // 超长段落：先结算 current，再按句子切
    if (current) {
      push(current);
      current = "";
    }
    let rest = para;
    while (rest.length > maxLen) {
      let cut = rest.slice(0, maxLen);
      const lastBreak = Math.max(cut.lastIndexOf("。"), cut.lastIndexOf("！"), cut.lastIndexOf("？"), cut.lastIndexOf("."), cut.lastIndexOf("\n"));
      if (lastBreak > maxLen * 0.5) cut = rest.slice(0, lastBreak + 1);
      push(cut);
      rest = rest.slice(cut.length);
    }
    if (rest) push(rest);
  }
  if (current) push(current);
  return chunks;
}

/** 入库一个文件；返回状态（inserted / duplicate / error） */
export async function ingestFile(file: File): Promise<
  { status: "inserted"; docId: number; chunks: number } | { status: "duplicate"; docId: number } | { status: "error"; message: string }
> {
  try {
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    const text = await readFileText(file);
    const hash = await sha256(text);

    const existing = await findDocumentByHash(hash);
    if (existing) {
      return { status: "duplicate", docId: existing.id };
    }

    const tags = JSON.stringify(ext === "docx" ? ["docx"] : ext === "md" ? ["md"] : ["txt"]);
    const docId = await insertDocument({
      filename: file.name,
      file_type: ext.toUpperCase(),
      file_hash: hash,
      size: file.size,
      tags,
    });

    const chunks = chunkText(text);
    for (let i = 0; i < chunks.length; i++) {
      await insertChunk({
        doc_id: docId,
        seq: i + 1,
        content: chunks[i],
        token_count: Math.max(1, Math.round(chunks[i].length / 1.8)),
      });
    }
    return { status: "inserted", docId, chunks: chunks.length };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  }
}
