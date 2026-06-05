#!/usr/bin/env node
// 期末复习助手 — pi SDK + 复盘驱动 + 先模式后范围
import * as readline from "node:readline";
import { initAgentSession, prompt, compact, disposeSession } from "./lib/session.mjs";
import {
  initSession, endSession, updateSession,
  getKpIdsForScope, selectKnowledgePoint, selectDifficulty, selectQuestionType,
  generateQuestionId, writeArchiveFiles, updateStateFromArchive,
  DIFFICULTY_LADDER, typeName, calcAccuracy,
  loadProgress, loadWrongBook, timestampNow,
  REFERENCE, SESSION_ARCHIVE_DIR, SUMMARY_DIR,
} from "./lib/state.mjs";
import { loadConceptCard } from "./lib/cards.mjs";
import { getChapterSections } from "./lib/chapters.mjs";
import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { renderMarkdown, printMD, printOptions, divider, title as mdTitle } from "./lib/terminal.mjs";

// ─── readline ───
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function question(q) { return new Promise((resolve) => rl.question(q, resolve)); }

// ─── 智能答题: 检测选项 → 打印编号 → 键盘输入 ───
async function smartAnswerInput(questionText) {
  const optionPattern = /^([A-D])\.\s+(.+)$/gm;
  const matches = [...questionText.matchAll(optionPattern)];
  if (matches.length >= 2) {
    const options = matches.map((m) => `${m[1]}. ${m[2]}`);
    printOptions(options, "请选择答案 (输入字母):");
    while (true) {
      const ans = (await question('\n  > ')).trim().toUpperCase();
      if (matches.find((m) => m[1] === ans)) return ans;
      console.log(`  ⚠️ 请输入 ${matches.map(m => m[1]).join('/')}`);
    }
  }
  // 判断题或简述: 普通文本
  while (true) {
    const ans = (await question('\n✏️  你的答案: ')).trim();
    if (ans) return ans;
    console.log('   ⚠️ 请输入答案');
  }
}

// ─── 复盘解析 ───
function parseFupan(output) {
  const m = output.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

// ═══ Main ═══
try {
  console.log("=".repeat(60));
  console.log("  📚 期末复习助手 — 面向对象程序设计 (C++)");
  console.log("=".repeat(60));

  // ─── 初始化 pi session (加载全部4个skill) ───
  console.log("\n⏳ 正在初始化复习助手...");
  await initAgentSession();
  console.log("");

  // ═══ Step 1: 先选模式 ═══
  console.log('\n📋 模式选择:');
  console.log('   1. 先看知识卡片，再做题');
  console.log('   2. 直接做题');
  console.log('   3. 单元学习 (章节笔记 → 小节推进 → 复盘)');
  let mode;
  while (true) {
    mode = (await question('请选择 (1/2/3, 默认2): ')).trim();
    if (!mode) mode = '2';
    if (['1', '2', '3'].includes(mode)) break;
    console.log('   ⚠️ 请输入 1、2 或 3');
  }
  const showCard = mode === '1';

  // ═══ Step 2: 根据模式选择范围/章节 ═══
  let scope, kpIds, session;

  if (mode === '3') {
    // Mode 3: 直接选章节
    let chapterId;
    while (true) {
      const ch = (await question('\n🎯 请输入章节号 (1-20, q 退出): ')).trim();
      if (ch === 'q' || ch === '退出') process.exit(0);
      const n = parseInt(ch);
      if (n >= 1 && n <= 20) { chapterId = n; break; }
      console.log('   ⚠️ 请输入 1-20 之间的数字');
    }
    await unitStudyLoop(chapterId);
    disposeSession();
    process.exit(0);
  }

  // Mode 1/2: 输入复习范围
  while (true) {
    console.log('\n🎯 复习范围 (支持: 「第9章」「第九章」「9」/ 关键字「指针,引用」/「错题」)');
    scope = (await question('   请输入: ')).trim();
    if (!scope) scope = '第9章';
    kpIds = getKpIdsForScope(scope);
    if (kpIds.length > 0) {
      console.log(`   知识点: ${kpIds.length} 个`);
      break;
    }
    console.log('\n   ⚠️ 未匹配到知识点! 可用章节 1-20, 或关键字如「指针」「继承」');
    const retry = (await question('\n🎯 请输入复习范围 (q 退出): ')).trim();
    if (retry === 'q' || retry === '退出' || retry === '') process.exit(0);
    scope = retry;
  }

  session = initSession(scope, kpIds);
  console.log(`\n指令: 下一题(n) | 跳过(skip) | 提示(hint) | 更难(harder) | 总结(sum) | 退出(q)`);

  // 告知 pi 复习范围
  await prompt(`准备开始复习。范围: ${scope}, ${kpIds.length} 个知识点。`);

  // ═══ Mode 1/2 主循环 (复盘驱动) ═══
  const sessionFuPan = []; // 程序收集本轮所有复盘

  while (true) {
    const remaining = session.remaining_knowledge_points || [];
    if (remaining.length === 0) {
      console.log('\n🎉 本轮复习范围的知识点已全部覆盖!');
      const cmd = (await question('\n输入「总结」结束, 或输入新范围继续: ')).trim();
      if (cmd === '总结' || cmd === 'sum') break;
      if (cmd === '退出' || cmd === 'q') { disposeSession(); process.exit(0); }
      scope = cmd;
      session = initSession(scope, getKpIdsForScope(scope));
      continue;
    }

    const kp = selectKnowledgePoint(remaining, session.covered_knowledge_points || []);
    if (!kp) {
      scope = (await question('🎯 复习范围: ')).trim();
      session = initSession(scope, getKpIdsForScope(scope));
      continue;
    }
    const difficulty = selectDifficulty(kp, session);
    const qType = selectQuestionType(kp);
    const questionId = generateQuestionId();
    updateSession({ current_question_index: (session.current_question_index || 0) + 1 });
    session = (loadProgress()).current_session;

    // ─── 卡片 (可选) ───
    if (showCard) {
      const card = loadConceptCard(kp.name);
      if (card) { divider(); mdTitle(`知识点卡片: ${kp.name}`); printMD(card); divider(); }
      else { divider(); console.log('  📖 正在生成知识卡片...'); await prompt(`请展示「${kp.name}」的复习卡片。`); divider(); }
      const cardCmd = (await question('\n💡 输入任意内容开始做题,「跳过」下一知识点: ')).trim();
      if (cardCmd === '跳过' || cardCmd === 'skip') continue;
      if (cardCmd === '总结' || cardCmd === 'sum') break;
      if (cardCmd === '退出' || cardCmd === 'q') { disposeSession(); process.exit(0); }
    }

    // ─── 出题 ───
    divider();
    console.log(`  🤔 第 ${session.current_question_index} 题 | ${kp.name} | ${difficulty} | ${typeName(qType)}`);
    const genMsg = [
      `请用 /skill:review-question 模板生成题目。`,
      `知识点: ${kp.name} (第${kp.chapter}章)`,
      `难度: ${difficulty} | 题型: ${typeName(qType)}`,
      `关联: ${(kp.related || []).slice(0, 5).join(', ')}`,
      `误区: ${(kp.common_misconceptions || []).slice(0, 3).join(', ')}`,
      kp.generation_hints ? `提示: ${kp.generation_hints}` : '',
      `只输出题目，不要解析。`,
    ].filter(Boolean).join('\n');
    const questionText = await prompt(genMsg);

    // ─── 作答 ───
    const userAnswer = await smartAnswerInput(questionText);
    if (userAnswer === '跳过' || userAnswer === 'skip') continue;
    if (userAnswer === '退出' || userAnswer === 'q') { disposeSession(); process.exit(0); }

    // ─── 判题 ───
    divider();
    const gradingResult = await prompt(`我的答案是「${userAnswer}」。请用 /skill:review-grade 判题。`);

    // ─── 讨论 (可选) ───
    let discussionCount = 0;
    while (true) {
      const cmd = (await question('\n💬 (追问 / 下一题 / 提示 / 更难): ')).trim();

      if (cmd === '下一题' || cmd === 'n') break;
      if (cmd === '退出' || cmd === 'q') { disposeSession(); process.exit(0); }
      if (cmd === '提示' || cmd === 'hint') { await prompt('请给一个引导性提示，不直接给答案。用 /skill:review-discuss。'); discussionCount++; }
      else if (cmd === '更难' || cmd === 'harder') { updateSession({ _next_difficulty_up: true }); console.log('📈 下一题将提升难度。'); }
      else if (cmd) { console.log('  🤔'); await prompt(cmd); discussionCount++; }
    }

    // ─── 复盘 ───
    divider();
    console.log('  📝 正在生成复盘...');
    const fupanMsg = [
      `请用 /skill:review-summary 中的每题复盘格式，生成这道题的复盘 JSON (用 \`\`\`json 包裹)。`,
      `question_id: ${questionId}`,
      `知识点的 ID: ${kp.id}`,
    ].join('\n');
    const fupanOutput = await prompt(fupanMsg);
    const fupan = parseFupan(fupanOutput);

    // 保存归档
    if (fupan) {
      const isCorrect = gradingResult.includes('✅');
      const archive = {
        question_id: questionId,
        knowledge_points: [kp.id],
        difficulty, type: qType,
        timestamp: timestampNow(),
        question_text: questionText,
        user_answer: userAnswer,
        correct_answer: gradingResult,
        explanation_l1: gradingResult,
        is_correct: isCorrect,
        discussion_summary: {
          core_misconception: fupan.error_root_cause || (isCorrect ? '无' : '（见复盘）'),
          clarified_points: [],
          user_self_correction: null,
          lingering_questions: [],
        },
        knowledge_chain_l3: fupan.knowledge_chain || kp.related?.slice(0, 3) || [],
        suggestion_next: '继续加油！',
        _fupan: fupan,
      };
      writeArchiveFiles(archive, questionId, session.session_id);
      updateStateFromArchive(archive);
      sessionFuPan.push(fupan);
    }

    // ─── compact: 丢弃对话细节，保留 skill + 复盘 ───
    await compact();
    session = (loadProgress()).current_session;
  }

  // ─── 会话总结 ───
  await sessionSummary(sessionFuPan, session || (loadProgress()).current_session);

} catch (err) {
  console.error(`\n❌ 错误: ${err.message}`);
  console.error(err.stack);
} finally {
  rl.close();
  disposeSession();
}

// ═══════════════════════════════════════════
// Mode 3: 单元学习 (复盘驱动)
// ═══════════════════════════════════════════

async function unitStudyLoop(chapterId) {
  const sections = getChapterSections(chapterId);
  if (sections.length === 0) {
    console.log(`\n⚠️ 未找到第${chapterId}章的章节笔记。`);
    return;
  }

  console.log(`\n📚 第${chapterId}章 — 共 ${sections.length} 个小节:`);
  for (let i = 0; i < sections.length; i++) {
    console.log(`   ${i + 1}. [${sections[i].lesson}] ${sections[i].title}`);
  }

  const cont = (await question('\n按 Enter 开始 (q 退出): ')).trim();
  if (cont === 'q' || cont === '退出') return;

  // 初始化 session
  const session = initSession(`单元学习-第${chapterId}章`, getKpIdsForScope(String(chapterId)));

  // 告知 pi: 章节 + 小节文件路径列表 (让 agent 自己 Read)
  const sectionPaths = sections.map((s) => `reference/01-章节笔记/${relative(REFERENCE, s.filePath).replace(/\\/g, '/')}`).join('\n');
  await prompt([
    `开始单元学习: 第${chapterId}章，共 ${sections.length} 个小节。`,
    `小节文件路径 (请逐节 Read 后简述+出题):`,
    sectionPaths,
    `流程: Read小节→简述内容→生成1道S-U题→用户作答→判题→复盘→compact→下一小节。`,
  ].join('\n'));

  const fuPanList = [];

  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`  📖 [${i + 1}/${sections.length}] ${s.lesson} ${s.title}`);
    console.log(`${'─'.repeat(50)}`);

    // Agent 自己 Read 小节 + 简述 + 出题
    const resp = await prompt(`请 Read「reference/01-章节笔记/${relative(REFERENCE, s.filePath).replace(/\\/g, '/')}」, 简述本节内容，然后生成1道S-U级别的判断或选择题。`);

    // 作答
    const skip = (await question('\n输入「跳过」跳过, Enter 开始做题: ')).trim();
    if (skip === '跳过' || skip === 'skip') continue;

    const userAnswer = await smartAnswerInput(resp);
    if (userAnswer === '跳过' || userAnswer === 'skip') continue;
    if (userAnswer === '退出' || userAnswer === 'q') { disposeSession(); process.exit(0); }

    // 判题
    divider();
    const grading = await prompt(`我的答案是「${userAnswer}」。请用 /skill:review-grade 判题。`);

    // 可选追问
    while (true) {
      const c = (await question('\n💬 (追问 / Enter继续): ')).trim();
      if (!c || c === '继续') break;
      if (c === '退出' || c === 'q') { disposeSession(); process.exit(0); }
      await prompt(c);
    }

    // 复盘
    divider();
    console.log('  📝 正在生成复盘...');
    const fupanOut = await prompt([
      `请用 /skill:review-summary 中的每题复盘格式生成复盘 JSON (用 \`\`\`json 包裹)。`,
      `小节: ${s.lesson} ${s.title}`,
    ].join('\n'));
    const fupan = parseFupan(fupanOut);

    // 归档
    const questionId = generateQuestionId();
    if (fupan) {
      const isCorrect = grading.includes('✅');
      const archive = {
        question_id: questionId,
        knowledge_points: [],
        difficulty: "S-U", type: "choice",
        timestamp: timestampNow(),
        question_text: resp,
        user_answer: userAnswer,
        correct_answer: grading,
        explanation_l1: grading,
        is_correct: isCorrect,
        discussion_summary: {
          core_misconception: fupan.error_root_cause || (isCorrect ? '无' : '（见复盘）'),
          clarified_points: [], user_self_correction: null, lingering_questions: [],
        },
        knowledge_chain_l3: fupan.knowledge_chain || [],
        suggestion_next: '继续下一小节。',
        _fupan: fupan,
      };
      writeArchiveFiles(archive, questionId, session.session_id);
      updateStateFromArchive(archive);
      fuPanList.push(fupan);
    }

    // compact: 丢弃对话，保留 skill + reference + 复盘
    await compact();
  }

  // 章节结束
  endSession();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ✅ 第${chapterId}章完成! ${fuPanList.length} 次复盘`);
  console.log(`${'='.repeat(60)}`);

  // 生成章节总结 (meta-复盘)
  if (fuPanList.length > 0) {
    await sessionSummary(fuPanList, session);
  }
}

// ═══════════════════════════════════════════
// 会话总结 (meta-复盘)
// ═══════════════════════════════════════════

async function sessionSummary(fuPanList, session) {
  const s = session || endSession();
  if (!s && fuPanList.length === 0) { console.log('\n👋 再见!'); return; }

  console.log(`\n${'='.repeat(60)}`);
  console.log('  📊 会话总结');
  console.log(`${'='.repeat(60)}`);
  if (s) {
    console.log(`\n  范围: ${s.scope} | 题目: ${s.total_questions || fuPanList.length} 题`);
    console.log(`  正确: ${s.correct || '?'} | 错误: ${s.incorrect || '?'}`);
  }

  if (fuPanList.length === 0) {
    console.log('\n  ⚠️ 暂无复盘，跳过总结。');
    return;
  }

  console.log(`\n  📝 正在生成总结报告 (基于 ${fuPanList.length} 条复盘)...\n`);

  const summaryMsg = [
    `请用 /skill:review-summary 中的会话总结模板，生成总结报告。`,
    `以下是本 session 全部复盘记录:`,
    JSON.stringify(fuPanList, null, 2),
    `请输出 MD 格式的完整总结报告。`,
  ].join('\n');
  const report = await prompt(summaryMsg);

  // 保存
  const sid = s?.session_id || `s_${Date.now()}`;
  if (!existsSync(SUMMARY_DIR)) mkdirSync(SUMMARY_DIR, { recursive: true });
  writeFileSync(join(SUMMARY_DIR, `${sid}_总结.md`), report, 'utf-8');
  console.log(`\n  ✅ 总结报告已保存: summaries/${sid}_总结.md`);
  console.log(`\n${'='.repeat(60)}`);
  console.log('  👋 再见!');
  console.log(`${'='.repeat(60)}`);
}
