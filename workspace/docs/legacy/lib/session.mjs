// ═══════════════════════════════════════════════════════════════
//  LEGACY — pi SDK 会话封装 (与 standalone CLI 配合使用)
//  当前主接口为 pi-agent extension，无需此文件。
// ═══════════════════════════════════════════════════════════════

import { createAgentSession, AuthStorage, ModelRegistry, SessionManager, DefaultResourceLoader } from "@earendil-works/pi-coding-agent";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PROJECT_ROOT, REFERENCE } from "./state.mjs";

let session = null;
let dispose = null;

const SKILL_NAMES = ["review-question", "review-grade", "review-discuss", "review-summary"];

function loadSkill(name) {
  const path = join(PROJECT_ROOT, ".pi", "skills", name, "SKILL.md");
  if (!existsSync(path)) return `<!-- skill ${name} not found -->`;
  return readFileSync(path, "utf-8");
}

/**
 * 初始化复习会话：加载模型、全部4个skill、系统提示
 */
export async function initAgentSession() {
  if (session) return session;

  // 认证
  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);

  // 模型
  const model = modelRegistry.find("deepseek", "deepseek-v4-flash");
  if (!model) {
    const available = modelRegistry.getAll();
    throw new Error(`未找到 deepseek/deepseek-v4-flash。可用: ${available.map(m => `${m.provider}/${m.id}`).join(", ")}`);
  }
  console.log(`  🤖 模型: ${model.provider}/${model.id}`);

  // 加载系统提示 + 全部 4 个 skill
  const systemPath = join(PROJECT_ROOT, ".pi", "SYSTEM.md");
  let systemPrompt = readFileSync(systemPath, "utf-8");

  systemPrompt += `\n\n---\n\n## 已加载的技能 (以下为完整内容，已编码在上下文中，compact 时不会被压缩)\n\n`;
  for (const name of SKILL_NAMES) {
    const content = loadSkill(name);
    systemPrompt += `### ${name}\n\n${content}\n\n---\n\n`;
  }

  // 资源加载器
  const loader = new DefaultResourceLoader({
    cwd: PROJECT_ROOT,
    agentDir: join(PROJECT_ROOT, ".pi"),
    systemPromptOverride: () => systemPrompt,
    appendSystemPromptOverride: () => [],
  });
  await loader.reload();

  // 创建会话
  const result = await createAgentSession({
    model,
    thinkingLevel: "off",
    resourceLoader: loader,
    authStorage,
    modelRegistry,
    tools: ["read", "bash"],
    sessionManager: SessionManager.inMemory(PROJECT_ROOT),
  });

  session = result.session;
  dispose = result.dispose;
  console.log(`  ✅ 已加载 ${SKILL_NAMES.length} 个技能`);
  return session;
}

/**
 * 发送 prompt 并收集完整响应文本
 */
export async function prompt(text) {
  if (!session) throw new Error("会话未初始化");
  let response = "";

  const unsubscribe = session.subscribe((event) => {
    if (event.type === "message_update" && event.assistantMessageEvent?.type === "text_delta") {
      response += event.assistantMessageEvent.delta;
      process.stdout.write(event.assistantMessageEvent.delta);
    }
  });

  await session.prompt(text);
  unsubscribe();
  process.stdout.write("\n");
  return response.trim();
}

/**
 * 压缩上下文：丢弃对话细节，保留 skill + reference 结构 + 复盘记录
 */
export async function compact() {
  if (!session) return;
  try {
    await session.compact(
      "丢弃本题的详细判题和讨论文本。保留: 技能文档(review-question/grades/discuss/summary)、参考资料目录结构、章节信息、所有复盘记录。将本题对话压缩为一条复盘记录。"
    );
  } catch {
    // compact 可能不可用，忽略
  }
}

export function getSession() { return session; }

export function disposeSession() {
  if (dispose) { dispose(); session = null; dispose = null; }
}
