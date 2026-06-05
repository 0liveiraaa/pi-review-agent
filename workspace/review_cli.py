#!/usr/bin/env python3
"""
期末复习助手 — Python CLI (M1 最小闭环)

职责:
  1. 命令解析 — 识别结构化指令 (下一题 / 跳过 / 总结等)
  2. 状态管理 — 进度 / 错题本 / 知识链索引
  3. Pi 调用 — 通过 pi -p 调度子任务 (系统提示: .pi/SYSTEM.md)
  4. 归档落盘 — JSON (上下文传递) + MD (完整记录)

用法:
  python review_cli.py                          # 交互模式
  python review_cli.py --chapter 9              # 直接指定章节
  python review_cli.py --scope "指针,引用,const"  # 按知识点复习
"""

import json
import os
import re
import shutil
import subprocess
import sys
import io
from datetime import datetime, timezone
from pathlib import Path

# 修复 Windows 终端编码问题
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

# ─── 项目路径 ───
PROJECT_ROOT = Path(__file__).parent.parent  # 面向对象程序设计/
WORKSPACE = Path(__file__).parent            # workspace/
REFERENCE = PROJECT_ROOT / "reference"
DATA_DIR = WORKSPACE / "data"
STATE_DIR = WORKSPACE / "state"
ARCHIVE_DIR = WORKSPACE / "archive"
# ─── 状态文件路径 ───
PROGRESS_FILE = STATE_DIR / "progress.json"
WRONG_BOOK_FILE = STATE_DIR / "wrong_book.json"
KNOWLEDGE_CHAINS_FILE = STATE_DIR / "knowledge_chains.json"
KNOWLEDGE_INDEX_FILE = DATA_DIR / "knowledge_index.json"

# ─── Pi 可执行文件 ───
def _find_pi() -> str:
    """自动发现 pi 可执行文件路径"""
    import shutil
    if sys.platform == "win32":
        # 先尝试 PATH 中的 pi.cmd，再尝试常见 npm 全局路径
        found = shutil.which("pi.cmd") or shutil.which("pi")
        if found:
            return found
        for base in [os.path.expandvars(r"%APPDATA%\npm"), os.path.expandvars(r"%LOCALAPPDATA%\npm")]:
            candidate = os.path.join(base, "pi.cmd")
            if os.path.isfile(candidate):
                return candidate
        raise FileNotFoundError("未找到 pi.cmd。请确保已安装: npm install -g @earendil-works/pi-coding-agent")
    return "pi"

PI_EXE = _find_pi()

# ─── Skill 通过 .pi/skills/review-assistant/SKILL.md 自动发现 ───


# ═══════════════════════════════════════════
# 工具函数
# ═══════════════════════════════════════════

def load_json(path: Path) -> dict:
    """加载 JSON 文件"""
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, data: dict):
    """保存 JSON 文件"""
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def timestamp_now() -> str:
    """生成 ISO 8601 时间戳"""
    return datetime.now(timezone.utc).isoformat()


def generate_question_id() -> str:
    """生成题目 ID: q_YYYYMMDD_NNN"""
    today = datetime.now().strftime("%Y%m%d")
    # 从进度中获取当前 session 的题目计数
    progress = load_json(PROGRESS_FILE)
    sessions = progress.get("history", {}).get("sessions", [])
    today_sessions = [s for s in sessions if s.get("date") == today]
    count = sum(s.get("total_questions", 0) for s in today_sessions) + 1
    return f"q_{today}_{count:03d}"


# ═══════════════════════════════════════════
# Pi 调用
# ═══════════════════════════════════════════

def call_pi(prompt: str, timeout: int = 120) -> str:
    """
    调用 Pi (--print 模式)。
    系统提示由 .pi/SYSTEM.md 自动加载，Skill 由 .pi/skills/ 自动发现。
    """
    try:
        result = subprocess.run(
            [
                PI_EXE, "-p",           # 非交互 print 模式
                "-nbt",                  # 禁用内置工具 (bash/edit/write)
                "--tools", "read",       # 只开放 read
                "--no-session",          # 不保存 session
                "-nc",                   # 不加载 AGENTS.md
                "-ne",                   # 不加载 extensions
                "--thinking", "off",     # 关闭思考模式
            ],
            input=prompt,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            cwd=str(PROJECT_ROOT),       # 项目根目录，.pi/ 和 reference/ 可访问
        )
        if result.returncode != 0:
            print(f"[警告] Pi 调用返回非零退出码: {result.returncode}")
            if result.stderr:
                print(f"[stderr] {result.stderr[:500]}")
        return result.stdout.strip()
    except FileNotFoundError:
        print("[错误] 未找到 pi 命令。请确保已安装 pi (npm install -g @earendil-works/pi-coding-agent)。")
        sys.exit(1)
    except subprocess.TimeoutExpired:
        print(f"[错误] Pi 调用超时 ({timeout}s)。")
        return f"[超时] Pi 未能在 {timeout} 秒内响应。"


# ═══════════════════════════════════════════
# 状态管理
# ═══════════════════════════════════════════

def init_session(scope: str) -> dict:
    """初始化复习会话"""
    progress = load_json(PROGRESS_FILE)
    session = {
        "session_id": f"s_{timestamp_now().replace(':', '-').replace('.', '-')}",
        "started": timestamp_now(),
        "scope": scope,
        "mode": "quiz",  # quiz | card | comprehensive
        "total_questions": 0,
        "correct": 0,
        "incorrect": 0,
        "current_question_index": 0,
        "covered_knowledge_points": [],
        "remaining_knowledge_points": _get_kp_ids_for_scope(scope),
        "recent_weaknesses": [],
        "last_lingering_question": None,
    }
    progress["current_session"] = session
    save_json(PROGRESS_FILE, progress)
    return session


def update_session(**kwargs):
    """更新当前会话状态"""
    progress = load_json(PROGRESS_FILE)
    if progress["current_session"]:
        for key, value in kwargs.items():
            progress["current_session"][key] = value
        save_json(PROGRESS_FILE, progress)


def end_session():
    """结束当前会话，归档到 history"""
    progress = load_json(PROGRESS_FILE)
    session = progress.get("current_session")
    if session:
        session["ended"] = timestamp_now()
        progress["history"]["total_questions_answered"] += session["total_questions"]
        progress["history"]["total_correct"] += session["correct"]
        progress["history"]["total_incorrect"] += session["incorrect"]
        progress["history"]["chapters_covered"] = list(
            set(progress["history"]["chapters_covered"] + [session["scope"]])
        )
        progress["history"]["sessions"].append({
            "session_id": session["session_id"],
            "date": datetime.now().strftime("%Y%m%d"),
            "scope": session["scope"],
            "total_questions": session["total_questions"],
            "correct": session["correct"],
            "incorrect": session["incorrect"],
        })
        progress["current_session"] = None
        save_json(PROGRESS_FILE, progress)
    return session


def save_wrong_entry(question_id: str, knowledge_points: list, error_type: str, error_detail: str):
    """保存错题记录"""
    wrong_book = load_json(WRONG_BOOK_FILE)
    entry = {
        "question_id": question_id,
        "knowledge_points": knowledge_points,
        "error_type": error_type,
        "error_detail": error_detail,
        "timestamp": timestamp_now(),
    }
    wrong_book["entries"].append(entry)
    # 更新错误类型统计
    if error_type in wrong_book["error_type_stats"]:
        wrong_book["error_type_stats"][error_type] += 1
    else:
        wrong_book["error_type_stats"][error_type] = 1
    save_json(WRONG_BOOK_FILE, wrong_book)


def update_knowledge_chains(chain: list):
    """更新知识链索引"""
    chains = load_json(KNOWLEDGE_CHAINS_FILE)
    chain_str = " → ".join(chain)
    if chain_str not in [c["chain"] for c in chains["chains"]]:
        chains["chains"].append({
            "chain": chain_str,
            "nodes": chain,
            "first_seen": timestamp_now(),
        })
    for kp in chain:
        if kp not in chains["knowledge_points_linked"]:
            chains["knowledge_points_linked"].append(kp)
    save_json(KNOWLEDGE_CHAINS_FILE, chains)


def get_recent_weaknesses(limit: int = 3) -> list:
    """获取近期薄弱点"""
    wrong_book = load_json(WRONG_BOOK_FILE)
    entries = wrong_book["entries"]
    # 取最近 N 条错误记录的 knowledge_points
    recent = entries[-limit:] if len(entries) >= limit else entries
    weaknesses = []
    for entry in recent:
        weaknesses.extend(entry.get("knowledge_points", []))
    return list(set(weaknesses))


def _get_kp_ids_for_scope(scope: str) -> list:
    """根据复习范围获取知识点 ID 列表"""
    index = load_json(KNOWLEDGE_INDEX_FILE)
    kp_ids = []
    for chapter_id, chapter_data in index.get("chapters", {}).items():
        chapter_title = chapter_data.get("title", "")
        # 简单匹配: scope 中包含章节号或章节名
        if scope in chapter_id or scope in chapter_title:
            for kp in chapter_data.get("knowledge_points", []):
                kp_ids.append(kp["id"])
    return kp_ids


def select_knowledge_point(scope: str) -> dict:
    """根据复习范围选择一个知识点 (优先选未覆盖的)"""
    progress = load_json(PROGRESS_FILE)
    session = progress.get("current_session", {}) or {}
    covered = set(session.get("covered_knowledge_points", []))
    remaining = session.get("remaining_knowledge_points", [])

    index = load_json(KNOWLEDGE_INDEX_FILE)
    for chapter_id, chapter_data in index.get("chapters", {}).items():
        for kp in chapter_data.get("knowledge_points", []):
            if kp["id"] in remaining and kp["id"] not in covered:
                return kp
    # 如果全部覆盖，从头循环
    if remaining:
        for chapter_id, chapter_data in index.get("chapters", {}).items():
            for kp in chapter_data.get("knowledge_points", []):
                if kp["id"] in remaining:
                    return kp
    return None


# ═══════════════════════════════════════════
# 上下文组装
# ═══════════════════════════════════════════

def build_context(knowledge_point: dict, difficulty: str, question_type: str) -> str:
    """组装注入 Pi 的上下文"""
    progress = load_json(PROGRESS_FILE)
    session = progress.get("current_session", {}) or {}

    weaknesses = get_recent_weaknesses()
    chains = load_json(KNOWLEDGE_CHAINS_FILE)

    ctx = f"""请使用 /skill:review-assistant 中的题型模板。

【复习范围】{session.get('scope', '未指定')}
【当前进度】第 {session.get('current_question_index', 0) + 1} 题 | 已答 {session.get('total_questions', 0)} 题 (正确 {session.get('correct', 0)}, 错误 {session.get('incorrect', 0)})
【当前知识点】{knowledge_point['name']} (ID: {knowledge_point['id']}) | 难度: {difficulty}
【关联知识点】{', '.join(knowledge_point.get('related', [])[:5])}
【常见误区】{', '.join(knowledge_point.get('common_misconceptions', [])[:3])}
【出题提示】{knowledge_point.get('generation_hints', '无特殊提示')}
【参考路径】{str(REFERENCE)}
"""

    if weaknesses:
        ctx += f"\n【近期薄弱点】{', '.join(weaknesses[:3])}"

    if chains["chains"]:
        recent_chains = chains["chains"][-3:]
        ctx += f"\n【已建立的知识链】{'; '.join(c['chain'] for c in recent_chains)}"

    lingering = session.get("last_lingering_question")
    if lingering:
        ctx += f"\n【上一题遗留问题】{lingering}"

    ctx += f"""

---
## 子任务: generate_question

根据以上知识点，用 skill 中的模板生成一道 {difficulty} 级别的 {_type_name(question_type)} 题。

只输出题目文本。不要输出解析、答案或归档。"""

    return ctx


def build_grade_context(question: dict, user_answer: str) -> str:
    """组装判题上下文"""
    q_json = json.dumps(question, ensure_ascii=False, indent=2)
    return f"""请使用 /skill:review-assistant 中的判题标准和输出格式。

【题目 JSON】
{q_json}

【用户答案】
{user_answer}

请判断用户答案是否正确，按 skill 中的格式输出判题结果、正确答案和 Level 1 解析。"""


def build_discuss_context(question: dict, grading: str, user_query: str, discussion_history: list) -> str:
    """组装讨论上下文"""
    q_json = json.dumps(question, ensure_ascii=False, indent=2)
    history_text = "\n".join(discussion_history) if discussion_history else "（本轮讨论开始）"

    return f"""请使用 /skill:review-assistant 中的讨论指南。

【参考路径】{str(REFERENCE)}
【题目】
{q_json}

【判题结果 + 解析】
{grading}

【讨论历史】
{history_text}

【用户追问】
{user_query}

按 skill 中的 Level 2 讨论规则回答。一次聚焦用户问的内容，不铺开太多。"""


def build_archive_context(
    question: dict,
    user_answer: str,
    grading_result: str,
    discussion_history: list,
    question_index: int,
) -> str:
    """组装归档上下文"""
    q_json = json.dumps(question, ensure_ascii=False, indent=2)
    history_text = "\n".join(discussion_history) if discussion_history else "无讨论"

    return f"""请使用 /skill:review-assistant 中的归档格式。

这是本题生命周期的最后一步。根据以下信息生成 JSON 归档。

【当前题目序号】{question_index}

【题目 JSON】
{q_json}

【用户答案】
{user_answer}

【判题结果 + 解析】
{grading_result}

【完整讨论历史】
{history_text}

请按 skill 中的格式输出 JSON 归档 (```json)，包含 question_id、knowledge_points、difficulty、type、timestamp、question_text、user_answer、correct_answer、explanation_l1、is_correct、discussion_summary、knowledge_chain_l3、suggestion_next。不需要输出 MD。"""


def _type_name(question_type: str) -> str:
    """题型中文名"""
    names = {"judgment": "正误判断题", "choice": "单项选择题", "short_answer": "简述题"}
    return names.get(question_type, question_type)


# ═══════════════════════════════════════════
# 归档处理
# ═══════════════════════════════════════════

MD_TEMPLATE = """---
question_id: {question_id}
knowledge_points: {knowledge_points}
difficulty: {difficulty}
type: {type}
timestamp: {timestamp}
is_correct: {is_correct}
---

# 题目归档: {question_id}

## 题目
{question_text}

## 用户答案
{user_answer}

## 正确答案 + 解析
{correct_answer}

{explanation}

## 讨论总结
### 错误根因
{core_misconception}

### 确认的知识点
{clarified_points}

### 用户自我纠正
{user_self_correction}

### 遗留问题
{lingering_questions}

## 知识链 (Level 3)
{knowledge_chain}

## 后续建议
{suggestion_next}
"""


def parse_and_save_archive(pi_output: str, question_id: str):
    """解析 Pi 的 JSON 归档输出，保存 JSON，并根据模板生成 MD"""
    json_match = re.search(r"```json\s*\n(.*?)\n```", pi_output, re.DOTALL)

    if not json_match:
        print("\n  ⚠️ 未在 Pi 输出中找到 JSON 归档块")
        return

    try:
        archive_json = json.loads(json_match.group(1))
    except json.JSONDecodeError as e:
        print(f"\n  ⚠️ JSON 解析失败: {e}")
        return

    # ─── 保存 JSON 归档 ───
    json_path = ARCHIVE_DIR / "sessions" / f"{question_id}.json"
    save_json(json_path, archive_json)

    # ─── 从 JSON 生成 MD 归档 ───
    disc = archive_json.get("discussion_summary", {})
    chain = archive_json.get("knowledge_chain_l3", [])

    md_content = MD_TEMPLATE.format(
        question_id=question_id,
        knowledge_points=", ".join(archive_json.get("knowledge_points", [])),
        difficulty=archive_json.get("difficulty", ""),
        type=archive_json.get("type", ""),
        timestamp=archive_json.get("timestamp", timestamp_now()),
        is_correct=archive_json.get("is_correct", False),
        question_text=archive_json.get("question_text", ""),
        user_answer=archive_json.get("user_answer", ""),
        correct_answer=archive_json.get("correct_answer", ""),
        explanation=archive_json.get("explanation_l1", ""),
        core_misconception=disc.get("core_misconception", "无"),
        clarified_points="\n".join(f"- {p}" for p in disc.get("clarified_points", [])) or "- 无",
        user_self_correction=disc.get("user_self_correction") or "无",
        lingering_questions="\n".join(f"- {q}" for q in disc.get("lingering_questions", [])) or "- 无",
        knowledge_chain=" → ".join(chain) if chain else "（无）",
        suggestion_next=archive_json.get("suggestion_next", "继续加油！"),
    )

    md_path = ARCHIVE_DIR / "sessions" / f"{question_id}.md"
    md_path.write_text(md_content, encoding="utf-8")

    # ─── 更新错题本 ───
    if not archive_json.get("is_correct", True):
        error_type = _classify_error(archive_json)
        save_wrong_entry(
            question_id=question_id,
            knowledge_points=archive_json.get("knowledge_points", []),
            error_type=error_type,
            error_detail=disc.get("core_misconception", ""),
        )

    # ─── 更新知识链 ───
    if chain:
        update_knowledge_chains(chain)

    # ─── 更新进度 ───
    progress = load_json(PROGRESS_FILE)
    session = progress.get("current_session", {})
    if session:
        covered = set(session.get("covered_knowledge_points", []))
        for kp in archive_json.get("knowledge_points", []):
            covered.add(kp)
        session["covered_knowledge_points"] = list(covered)

        remaining = session.get("remaining_knowledge_points", [])
        for kp in archive_json.get("knowledge_points", []):
            if kp in remaining:
                remaining.remove(kp)
        session["remaining_knowledge_points"] = remaining

        session["total_questions"] = session.get("total_questions", 0) + 1
        if archive_json.get("is_correct", True):
            session["correct"] = session.get("correct", 0) + 1
        else:
            session["incorrect"] = session.get("incorrect", 0) + 1

        lingering = disc.get("lingering_questions", [])
        session["last_lingering_question"] = lingering[0] if lingering else None

        progress["current_session"] = session
        save_json(PROGRESS_FILE, progress)

    print(f"\n  ✅ JSON 归档: {json_path}")
    print(f"  ✅ MD 归档:  {md_path}")


def _classify_error(archive: dict) -> str:
    """根据讨论总结自动分类错误类型"""
    discussion = archive.get("discussion_summary", {})
    misconception = discussion.get("core_misconception", "")

    confusion_keywords = ["混淆", "分不清", "搞混", "弄混", "混为一谈"]
    omission_keywords = ["遗漏", "忘记", "忽略", "不知道", "不了解", "没考虑到"]
    reasoning_keywords = ["推理", "逻辑", "推导", "判断", "分析"]

    if any(kw in misconception for kw in confusion_keywords):
        return "概念混淆"
    elif any(kw in misconception for kw in omission_keywords):
        return "知识遗漏"
    elif any(kw in misconception for kw in reasoning_keywords):
        return "推理错误"
    else:
        return "概念混淆"  # 默认归类


# ═══════════════════════════════════════════
# 交互式主循环
# ═══════════════════════════════════════════

def main():
    print("=" * 60)
    print("  📚 期末复习助手 — 面向对象程序设计 (C++)")
    print("  M1 最小闭环")
    print("=" * 60)
    print()
    print("指令: 下一题(n) | 跳过(skip) | 提示(hint) | 总结(sum) | 退出(q)")
    print()

    # ─── 系统提示由 .pi/SYSTEM.md 自动加载，Skill 由 .pi/skills/ 自动发现 ───

    # 获取复习范围
    scope = input("🎯 请输入复习范围 (如 '第9章'): ").strip()
    if not scope:
        scope = "第9章"

    # 初始化会话
    session = init_session(scope)
    print(f"\n✅ 会话已创建: {session['session_id']}")
    print(f"   范围: {scope}")
    print(f"   知识点: {len(session['remaining_knowledge_points'])} 个")

    # 选择模式
    print("\n📋 模式选择:")
    print("   1. 先看知识卡片，再做题")
    print("   2. 直接做题")
    mode_choice = input("请选择 (1/2, 默认2): ").strip()
    show_card = mode_choice == "1"

    # ─── 主循环 ───
    while True:
        # 检查是否有剩余知识点
        remaining = session.get("remaining_knowledge_points", [])
        if not remaining:
            print("\n🎉 本轮复习范围的知识点已全部覆盖!")
            print("   输入 '总结' 结束会话，或输入新的范围继续复习。")
            cmd = input("\n> ").strip()
            if cmd == "总结" or cmd == "sum":
                break
            elif cmd == "退出" or cmd == "q":
                return
            else:
                # 扩展范围
                scope = cmd
                session = init_session(scope)
                continue

        # 选择知识点和难度
        kp = select_knowledge_point(scope)
        if not kp:
            print("\n⚠️ 未找到匹配的知识点，请重新指定范围。")
            scope = input("🎯 复习范围: ").strip()
            session = init_session(scope)
            continue

        # 选择难度 (简单策略: 如果用户连续正确 2 题以上，提升难度)
        correct_streak = _get_correct_streak()
        if correct_streak >= 2:
            difficulty = "M-U"
        else:
            difficulty = kp.get("difficulty_baseline", "S-U")

        # 选择题型 (根据知识点支持的题型)
        supported_types = kp.get("question_types", ["choice"])
        question_type = "choice"  # M1 默认选择题

        # ─── 知识卡片 (可选) ───
        if show_card:
            card_prompt = f"""展示以下知识点的复习卡片。

知识点: {kp['name']}
章节: 第{kp['chapter']}章
标签: {', '.join(kp.get('tags', []))}
【参考路径】{str(REFERENCE)}

格式:
## 知识点卡片: {kp['name']}

### 概述
（简要说明该知识点是什么，1-2段）

### 关键要点
- 要点1
- 要点2
- 要点3

### 易错提醒
（常见误区）

卡片展示后提示用户: 输入「做题」开始做题，或输入「跳过」直接下一题。"""

            print(f"\n{'─' * 50}")
            response = call_pi(card_prompt)
            print(response)
            print(f"{'─' * 50}")

            cmd = input("\n> ").strip()
            if cmd == "跳过" or cmd == "skip":
                continue
            elif cmd == "总结" or cmd == "sum":
                break
            elif cmd == "退出" or cmd == "q":
                return
            # 其他输入视为"开始做题"

        # ─── 题目生命周期 ───
        question_id = generate_question_id()
        update_session(current_question_index=session.get("current_question_index", 0) + 1)

        # Step 1: 生成题目
        gen_ctx = build_context(kp, difficulty, question_type)
        print(f"\n{'─' * 50}")
        print("  🤔 正在生成题目...")
        question_text = call_pi(gen_ctx)
        print(f"\n{question_text}")
        print(f"{'─' * 50}")

        # Step 2: 用户作答
        user_answer = input("\n✏️  你的答案: ").strip()

        if user_answer == "跳过" or user_answer == "skip":
            continue
        if user_answer == "退出" or user_answer == "q":
            return

        # Step 3: 判题 + Level 1 解析
        # 构建简化的题目结构用于判题
        question_obj = {
            "question_id": question_id,
            "knowledge_points": [kp["id"]],
            "difficulty": difficulty,
            "type": question_type,
            "question_text": question_text,
        }
        grade_ctx = build_grade_context(question_obj, user_answer)
        print(f"\n{'─' * 50}")
        grading_result = call_pi(grade_ctx)
        print(f"\n{grading_result}")
        print(f"{'─' * 50}")

        # Step 4: 讨论循环
        discussion_history = []
        while True:
            print()
            cmd = input("💬 (追问 / 下一题 / 提示): ").strip()

            if cmd == "下一题" or cmd == "n":
                # 归档 → 下一题
                print("\n  📝 正在生成归档...")
                archive_ctx = build_archive_context(
                    question_obj, user_answer, grading_result,
                    discussion_history, session.get("current_question_index", 0),
                )
                archive_output = call_pi(archive_ctx, timeout=180)
                parse_and_save_archive(archive_output, question_id)
                print(f"\n{'─' * 50}")
                break  # 跳出讨论循环，进入下一题

            elif cmd == "总结" or cmd == "sum":
                # 先归档当前题，再结束会话
                print("\n  📝 正在生成归档...")
                archive_ctx = build_archive_context(
                    question_obj, user_answer, grading_result,
                    discussion_history, session.get("current_question_index", 0),
                )
                archive_output = call_pi(archive_ctx, timeout=180)
                parse_and_save_archive(archive_output, question_id)
                break  # 跳出讨论循环

            elif cmd == "退出" or cmd == "q":
                return

            elif cmd == "提示" or cmd == "hint":
                hint_prompt = f"""请使用 /skill:review-assistant 的讨论指南。

【参考路径】{str(REFERENCE)}
【题目】{question_text}
用户请求提示 (给一个引导性的提示帮助思考，不要直接给出答案)。"""
                response = call_pi(hint_prompt)
                print(f"\n💡 {response}")
                discussion_history.append(f"[用户请求提示]")
                discussion_history.append(f"[助手提示] {response}")

            else:
                # 用户追问，Pi 讨论
                print("  🤔 (思考中...)")
                discuss_ctx = build_discuss_context(
                    question_obj, grading_result, cmd, discussion_history
                )
                response = call_pi(discuss_ctx)
                print(f"\n{response}")
                discussion_history.append(f"[用户] {cmd}")
                discussion_history.append(f"[助手] {response}")

        # 检查是否要结束会话
        if cmd == "总结" or cmd == "sum":
            break

    # ─── 会话总结 ───
    _generate_session_summary()


def _get_correct_streak() -> int:
    """计算连续正确数"""
    progress = load_json(PROGRESS_FILE)
    sessions = progress.get("history", {}).get("sessions", [])
    wrong_book = load_json(WRONG_BOOK_FILE)
    entries = wrong_book.get("entries", [])
    if not entries:
        return 10  # 没有错题，连续正确很多
    last_wrong_id = entries[-1]["question_id"]
    # 简单估算: 从总答题数减去最后一次错题位置
    total = progress.get("history", {}).get("total_questions_answered", 0)
    wrong_count = len(entries)
    streak = max(0, total - wrong_count)
    return min(streak, 10)


def _generate_session_summary():
    """生成会话总结"""
    session = end_session()
    if not session:
        print("\n👋 再见!")
        return

    print(f"\n{'=' * 60}")
    print("  📊 会话总结")
    print(f"{'=' * 60}")

    print(f"""
  复习范围: {session.get('scope', 'N/A')}
  完成题目: {session.get('total_questions', 0)} 题
  正确: {session.get('correct', 0)} 题
  错误: {session.get('incorrect', 0)} 题
  正确率: {_calc_accuracy(session):.0%}
""")

    # 调用 Pi 生成全局复盘
    wrong_book = load_json(WRONG_BOOK_FILE)
    recent_entries = wrong_book["entries"][-10:]
    chains = load_json(KNOWLEDGE_CHAINS_FILE)

    summary_prompt = f"""根据本次复习会话的数据，生成一份全局复盘报告。

【会话数据】
{json.dumps(session, ensure_ascii=False, indent=2)}

【近期错题】
{json.dumps(recent_entries, ensure_ascii=False, indent=2) if recent_entries else '无错题'}

【已建立的知识链】
{json.dumps(chains['chains'][-5:], ensure_ascii=False, indent=2) if chains['chains'] else '无'}

请输出:
1. 本会话整体评价
2. 薄弱环节分析
3. 已构建的知识体系概览
4. 下次复习建议"""

    print("\n  正在生成全局复盘...\n")
    report = call_pi(summary_prompt, timeout=180)
    print(report)
    print(f"\n{'=' * 60}")
    print("  👋 会话结束，加油复习!")
    print(f"{'=' * 60}")


def _calc_accuracy(session: dict) -> float:
    """计算正确率"""
    total = session.get("total_questions", 0)
    correct = session.get("correct", 0)
    if total == 0:
        return 1.0
    return correct / total


# ═══════════════════════════════════════════
# 入口
# ═══════════════════════════════════════════

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n👋 已中断。进度已保存。")
        end_session()
    except Exception as e:
        print(f"\n❌ 发生错误: {e}")
        import traceback
        traceback.print_exc()
