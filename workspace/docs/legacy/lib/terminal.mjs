// ═══════════════════════════════════════════════════════════════
//  LEGACY — 终端可视化 (与 standalone CLI 配合使用)
//  当前主接口为 pi-agent extension (使用 pi-tui 渲染)，无需此文件。
// ═══════════════════════════════════════════════════════════════

import { marked } from "marked";
import * as readline from "node:readline";

// ─── ANSI 颜色 ───
const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", italic: "\x1b[3m",
  underline: "\x1b[4m",
  fg: (n) => `\x1b[38;5;${n}m`,
  bg: (n) => `\x1b[48;5;${n}m`,
  // 常用颜色
  cyan: "\x1b[36m", green: "\x1b[32m", yellow: "\x1b[33m",
  blue: "\x1b[34m", magenta: "\x1b[35m", red: "\x1b[31m",
  white: "\x1b[37m",
};

function defaultTheme() {
  return {
    heading: (t) => `${C.bold}${C.cyan}${t}${C.reset}`,
    link: (t) => `${C.underline}${C.blue}${t}${C.reset}`,
    linkUrl: (t) => `${C.dim}${t}${C.reset}`,
    code: (t) => `${C.yellow}${t}${C.reset}`,
    codeBlock: (t) => t,
    codeBlockBorder: (t) => `${C.dim}${t}${C.reset}`,
    quote: (t) => `${C.dim}${C.italic}${t}${C.reset}`,
    quoteBorder: (t) => `${C.dim}│${C.reset}`,
    hr: () => `${C.dim}${"─".repeat(60)}${C.reset}`,
    listBullet: () => `  ${C.dim}•${C.reset}`,
    bold: (t) => `${C.bold}${t}${C.reset}`,
    italic: (t) => `${C.italic}${t}${C.reset}`,
    strikethrough: (t) => `${C.dim}${t}${C.reset}`,
    underline: (t) => `${C.underline}${t}${C.reset}`,
  };
}

// ─── Markdown 渲染 ───
export function renderMarkdown(text) {
  if (!text) return "";
  const theme = defaultTheme();

  // 使用 marked 解析 token，手动渲染为 ANSI
  const tokens = marked.lexer(text);
  const lines = [];
  renderTokens(tokens, lines, theme, 0);
  return lines.join("\n");
}

function renderTokens(tokens, lines, theme, indent) {
  const prefix = " ".repeat(indent);
  for (const token of tokens) {
    switch (token.type) {
      case "heading":
        lines.push("");
        lines.push(prefix + theme.heading(token.text));
        lines.push("");
        break;
      case "paragraph":
        lines.push(prefix + renderInline(token.tokens || [], theme));
        break;
      case "code":
        if (token.lang === "cpp" || token.lang === "c++") {
          lines.push(prefix + theme.codeBlockBorder("┌" + "─".repeat(40)));
          for (const line of token.text.split("\n")) {
            lines.push(prefix + theme.codeBlockBorder("│ ") + theme.codeBlock(highlightCpp(line)));
          }
          lines.push(prefix + theme.codeBlockBorder("└" + "─".repeat(40)));
        } else {
          lines.push(prefix + theme.codeBlock(highlightCpp(token.text)));
        }
        break;
      case "blockquote":
        for (const line of token.text.split("\n")) {
          lines.push(C.dim + "│ " + C.reset + theme.quote(line));
        }
        break;
      case "list": {
        const items = token.items || [];
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const bullet = token.ordered ? `  ${i + 1}.` : theme.listBullet();
          const itemText = renderInlineTokens(item.tokens || [], theme);
          lines.push(prefix + bullet + " " + itemText);
        }
        break;
      }
      case "hr":
        lines.push(theme.hr("─".repeat(60)));
        break;
      case "space":
        break;
      case "table": {
        // 简化表格渲染
        const header = token.header.map((c) => c.text).join(" │ ");
        lines.push(prefix + theme.bold(header));
        lines.push(prefix + C.dim + "─".repeat(header.length) + C.reset);
        for (const row of token.rows || []) {
          lines.push(prefix + row.map((c) => c.text).join(" │ "));
        }
        break;
      }
      default:
        if (token.text) lines.push(prefix + token.text);
        else if (token.tokens) renderTokens(token.tokens, lines, theme, indent);
    }
  }
}

function renderInline(tokens, theme) {
  return renderInlineTokens(tokens, theme);
}

function renderInlineTokens(tokens, theme) {
  if (!tokens) return "";
  let result = "";
  for (const token of tokens) {
    switch (token.type) {
      case "text": result += token.text; break;
      case "strong": result += theme.bold(renderInlineTokens(token.tokens, theme)); break;
      case "em": result += theme.italic(renderInlineTokens(token.tokens, theme)); break;
      case "del": result += theme.strikethrough(renderInlineTokens(token.tokens, theme)); break;
      case "codespan": result += theme.code(token.text); break;
      case "link": result += theme.link(token.text || token.href); break;
      case "br": result += "\n"; break;
      default:
        if (token.text) result += token.text;
        else if (token.tokens) result += renderInlineTokens(token.tokens, theme);
    }
  }
  return result;
}

// ─── C++ 语法高亮 ───
function highlightCpp(line) {
  // 简单关键词高亮
  return line
    .replace(/\b(class|struct|int|void|bool|char|double|float|auto|const|static|virtual|override|public|private|protected|new|delete|return|if|else|for|while|sizeof|typedef|using|namespace|template|typename|explicit|default|noexcept|nullptr|true|false|operator|friend|inline)\b/g, `${C.magenta}$1${C.reset}`)
    .replace(/(\/\/.*)/g, `${C.dim}$1${C.reset}`)
    .replace(/("(?:[^"\\]|\\.)*")/g, `${C.green}$1${C.reset}`);
}

// ─── 选项打印（简单编号，用户键盘输入） ───
export function printOptions(options, promptText = "请选择") {
  console.log(`\n  ${C.bold}${promptText}${C.reset}`);
  for (const opt of options) {
    const label = typeof opt === "string" ? opt : (opt.label || opt.value);
    console.log(`  ${C.cyan}${label}${C.reset}`);
  }
}

// ─── 加载动画 ───
let spinnerFrame = 0;
const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
let spinnerInterval = null;

export function startSpinner(text = "处理中") {
  if (spinnerInterval) stopSpinner();
  process.stdout.write(`\n  ${text}...\n`);
  spinnerInterval = setInterval(() => {
    spinnerFrame = (spinnerFrame + 1) % spinnerFrames.length;
    process.stdout.write(`\x1b[1A\r  ${C.dim}${spinnerFrames[spinnerFrame]}${C.reset} ${text}...\n`);
  }, 80);
}

export function stopSpinner() {
  if (spinnerInterval) { clearInterval(spinnerInterval); spinnerInterval = null; }
  process.stdout.write("\x1b[1A\r\x1b[K"); // 清除 spinner 行
}

// ─── 打印 Markdown (带格式) ───
export function printMD(text) {
  console.log(renderMarkdown(text));
}

// ─── 分隔线 ───
export function divider(char = "─", width = 50) {
  console.log(C.dim + char.repeat(width) + C.reset);
}

// ─── 标题 ───
export function title(text) {
  console.log(`\n${C.bold}${C.cyan}${text}${C.reset}\n`);
}
