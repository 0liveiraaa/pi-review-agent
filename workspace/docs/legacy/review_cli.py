#!/usr/bin/env python3
"""
期末复习助手 — Python CLI

职责:
  1. 命令解析 — 识别结构化指令 (下一题 / 跳过 / 总结等)
  2. 状态管理 — 进度 / 错题本 / 知识链索引
  3. Pi 调用 — 通过 pi -p 调度子任务 (系统提示: .pi/SYSTEM.md)
  4. 归档落盘 — JSON (上下文传递) + MD (完整记录)
  5. 知识卡片 — 直接读取 reference/02-概念卡片/ 目录下的 MD 文件

用法:
  python review_cli.py                          # 交互模式
  python review_cli.py --scope "第9章"           # 指定章节
  python review_cli.py --scope "指针,引用,const"  # 按知识点复习
"""

import json
import os
import re
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
CARD_DIR = REFERENCE / "02-概念卡片"
NOTE_DIR = REFERENCE / "01-章节笔记"
DATA_DIR = WORKSPACE / "data"
STATE_DIR = WORKSPACE / "state"
ARCHIVE_DIR = WORKSPACE / "archive"
SESSION_ARCHIVE_DIR = ARCHIVE_DIR / "sessions"
SUMMARY_DIR = ARCHIVE_DIR / "summaries"
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

def call_pi(prompt: str, timeout: int = 90) -> str:
    """
    调用 Pi (--print 模式)。
    系统提示由 .pi/SYSTEM.md 自动加载，Skill 由 .pi/skills/ 自动发现。
    """
    try:
        result = subprocess.run(
            [
                PI_EXE, "-p",           # 非交互 print 模式
                "--model", "deepseek-v4-flash",  # 快速模型
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
    """根据复习范围获取知识点 ID 列表。支持: 章节号('第9章','第九章')、章节名('拷贝')、关键字('指针,引用')"""
    # 中文数字 → 阿拉伯数字映射
    CN_NUM = {
        "一": "1", "二": "2", "三": "3", "四": "4", "五": "5",
        "六": "6", "七": "7", "八": "8", "九": "9", "十": "10",
        "十一": "11", "十二": "12", "十三": "13", "十四": "14", "十五": "15",
        "十六": "16", "十七": "17", "十八": "18", "十九": "19", "二十": "20",
    }

    index = load_json(KNOWLEDGE_INDEX_FILE)
    kp_ids = []
    raw_keywords = [kw.strip() for kw in scope.replace("、", ",").replace("，", ",").split(",")]

    # 预处理 keywords: "第九章" → "9", "第9章" → "9"
    keywords = []
    for kw in raw_keywords:
        keywords.append(kw)  # 保留原始关键词
        # "第9章" / "第 9 章" → "9"
        m = re.match(r"第\s*(\d+)\s*章", kw)
        if m:
            keywords.append(m.group(1))
            continue
        # "第九章" / "第十一章" → 替换中文数字
        for cn, num in CN_NUM.items():
            if cn in kw:
                keywords.append(kw.replace(cn, num))
                break

    for chapter_id, chapter_data in index.get("chapters", {}).items():
        chapter_title = chapter_data.get("title", "")
        for kp in chapter_data.get("knowledge_points", []):
            kp_name = kp["name"]
            kp_aliases = kp.get("aliases", [])
            kp_tags = kp.get("tags", [])
            search_text = (
                f"{chapter_id} "
                f"第{chapter_id}章 "
                f"{chapter_title} "
                f"{kp_name} "
                f"{' '.join(kp_aliases)} "
                f"{' '.join(kp_tags)}"
            )
            for kw in keywords:
                # 纯数字 keyword: 精确匹配 chapter_id，防止 "3" 误匹配 "13"
                if kw.isdigit():
                    if kw == chapter_id:
                        kp_ids.append(kp["id"])
                        break
                elif kw in search_text:
                    kp_ids.append(kp["id"])
                    break
    return list(dict.fromkeys(kp_ids))  # 去重保序


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
【当前进度】第 {session.get('current_question_index', 0) + 1} 题 | 已答 {session.get('total_questions', 0)} 题 (✅{session.get('correct', 0)} ❌{session.get('incorrect', 0)}) | 剩余 {len(session.get('remaining_knowledge_points', []))} 个知识点
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

    last_disc = session.get("last_discussion")
    if last_disc:
        ctx += f"\n【上一题讨论要点】{'; '.join(d for d in last_disc if d.startswith('[助手]'))[:300]}"

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


# ─── 难度递进 ───
DIFFICULTY_LADDER = ["S-R", "S-U", "M-U", "M-A", "C-A"]


def _select_difficulty(kp: dict, session: dict) -> str:
    """根据当前表现选择难度。连续正确→升级，连续错误→降级。"""
    baseline = kp.get("difficulty_baseline", "S-U")
    if baseline not in DIFFICULTY_LADDER:
        baseline = "S-U"  # fallback: 未知难度默认 S-U
    baseline_idx = DIFFICULTY_LADDER.index(baseline)

    # 从 session 中推断 streak
    total = session.get("total_questions", 0)
    correct = session.get("correct", 0)
    incorrect = session.get("incorrect", 0)

    if total == 0:
        return baseline

    accuracy = correct / total if total > 0 else 1.0

    if total >= 3 and accuracy >= 0.8:
        # 升级
        idx = min(baseline_idx + 1, len(DIFFICULTY_LADDER) - 1)
    elif incorrect >= 2 and accuracy < 0.5:
        # 降级
        idx = max(baseline_idx - 1, 0)
    else:
        idx = baseline_idx

    # 用户主动要求提升难度
    if session.get("_next_difficulty_up"):
        idx = min(idx + 1, len(DIFFICULTY_LADDER) - 1)
        # 清除标志（下次 _select_difficulty 不再自动升级）
        update_session(_next_difficulty_up=False)

    return DIFFICULTY_LADDER[idx]


def _select_question_type(kp: dict) -> str:
    """根据知识点支持的题型轮换。默认顺序: choice → judgment → short_answer → choice。"""
    supported = kp.get("question_types", ["choice"])
    if len(supported) == 1:
        return supported[0]
    # 轮换策略: 基于总答题数在支持列表中轮换
    progress = load_json(PROGRESS_FILE)
    total = progress.get("history", {}).get("total_questions_answered", 0)
    idx = total % len(supported)
    return supported[idx]


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


def _fast_archive(
    question_id: str, question_obj: dict, user_answer: str,
    grading_result: str, is_correct: bool, kp: dict,
) -> None:
    """
    本地快速归档 (不调 pi)。用于用户答对且无追问的场景。
    从已有信息直接生成 JSON + MD，跳过 pi 调用。
    """
    # 从 grading result 尝试提取正确答案
    correct_answer = ""
    explanation = grading_result
    # 尝试提取 "## 正确答案" 后的内容
    m = re.search(r"##\s*正确答案\s*\n+(.+?)(?:\n##|\n\*\*|\Z)", grading_result, re.DOTALL)
    if m:
        correct_answer = m.group(1).strip()
        # 解析部分从 "## 解析" 开始
        exp_match = re.search(r"##\s*解析\s*\n+(.+)", grading_result, re.DOTALL)
        if exp_match:
            explanation = exp_match.group(1).strip()

    # 从 KP 的 related 构建简单知识链
    chain = kp.get("related", [])[:3] if kp.get("related") else []

    archive = {
        "question_id": question_id,
        "knowledge_points": question_obj.get("knowledge_points", []),
        "difficulty": question_obj.get("difficulty", ""),
        "type": question_obj.get("type", ""),
        "timestamp": timestamp_now(),
        "question_text": question_obj.get("question_text", ""),
        "user_answer": user_answer,
        "correct_answer": correct_answer,
        "explanation_l1": explanation,
        "is_correct": is_correct,
        "discussion_summary": {
            "core_misconception": "无" if is_correct else "（快速归档，详见判题解析）",
            "clarified_points": [],
            "user_self_correction": None,
            "lingering_questions": [],
        },
        "knowledge_chain_l3": chain,
        "suggestion_next": "继续加油！保持正确率。" if is_correct else "建议回顾该知识点的概念卡片。",
    }

    _write_archive_files(archive, question_id)
    _update_state_from_archive(archive)


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

    _write_archive_files(archive_json, question_id)
    _update_state_from_archive(archive_json)


def _write_archive_files(archive: dict, question_id: str) -> None:
    """保存 JSON 和 MD 归档文件 (按 session 分文件夹)"""
    session_id = _get_current_session_id()
    session_dir = SESSION_ARCHIVE_DIR / session_id
    session_dir.mkdir(parents=True, exist_ok=True)

    # JSON
    json_path = session_dir / f"{question_id}.json"
    save_json(json_path, archive)

    # MD
    disc = archive.get("discussion_summary", {})
    chain = archive.get("knowledge_chain_l3", [])

    md_content = MD_TEMPLATE.format(
        question_id=question_id,
        knowledge_points=", ".join(archive.get("knowledge_points", [])),
        difficulty=archive.get("difficulty", ""),
        type=archive.get("type", ""),
        timestamp=archive.get("timestamp", timestamp_now()),
        is_correct=archive.get("is_correct", False),
        question_text=archive.get("question_text", ""),
        user_answer=archive.get("user_answer", ""),
        correct_answer=archive.get("correct_answer", ""),
        explanation=archive.get("explanation_l1", ""),
        core_misconception=disc.get("core_misconception", "无"),
        clarified_points="\n".join(f"- {p}" for p in disc.get("clarified_points", [])) or "- 无",
        user_self_correction=disc.get("user_self_correction") or "无",
        lingering_questions="\n".join(f"- {q}" for q in disc.get("lingering_questions", [])) or "- 无",
        knowledge_chain=" → ".join(chain) if chain else "（无）",
        suggestion_next=archive.get("suggestion_next", "继续加油！"),
    )

    md_path = session_dir / f"{question_id}.md"
    md_path.write_text(md_content, encoding="utf-8")

    print(f"\n  ✅ 已归档 → {session_dir.name}/{question_id}")


def _update_state_from_archive(archive: dict) -> None:
    """从归档数据更新错题本、知识链和进度"""
    disc = archive.get("discussion_summary", {})
    chain = archive.get("knowledge_chain_l3", [])

    # 错题本
    if not archive.get("is_correct", True):
        error_type = _classify_error(archive)
        save_wrong_entry(
            question_id=archive.get("question_id", ""),
            knowledge_points=archive.get("knowledge_points", []),
            error_type=error_type,
            error_detail=disc.get("core_misconception", ""),
        )

    # 知识链
    if chain:
        update_knowledge_chains(chain)

    # 进度
    progress = load_json(PROGRESS_FILE)
    session = progress.get("current_session", {})
    if session:
        covered = set(session.get("covered_knowledge_points", []))
        for kp in archive.get("knowledge_points", []):
            covered.add(kp)
        session["covered_knowledge_points"] = list(covered)

        remaining = session.get("remaining_knowledge_points", [])
        for kp in archive.get("knowledge_points", []):
            if kp in remaining:
                remaining.remove(kp)
        session["remaining_knowledge_points"] = remaining

        session["total_questions"] = session.get("total_questions", 0) + 1
        if archive.get("is_correct", True):
            session["correct"] = session.get("correct", 0) + 1
        else:
            session["incorrect"] = session.get("incorrect", 0) + 1

        lingering = disc.get("lingering_questions", [])
        session["last_lingering_question"] = lingering[0] if lingering else None

        progress["current_session"] = session
        save_json(PROGRESS_FILE, progress)


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
# 知识卡片读取
# ═══════════════════════════════════════════

def _load_concept_card(kp_name: str) -> str | None:
    """从 reference/02-概念卡片/ 目录读取知识卡片 MD 文件。返回 None 表示未找到。"""
    # 1. 精确匹配
    exact_path = CARD_DIR / f"{kp_name}.md"
    if exact_path.exists():
        content = exact_path.read_text(encoding="utf-8")
        return _strip_frontmatter(content)

    # 2. 模糊匹配: 遍历目录，双向匹配 (文件名包含KP名 或 KP名包含文件名)
    if CARD_DIR.exists():
        for f in CARD_DIR.iterdir():
            if f.suffix == ".md" and (kp_name in f.stem or f.stem in kp_name):
                content = f.read_text(encoding="utf-8")
                return _strip_frontmatter(content)

    return None


def _strip_frontmatter(content: str) -> str:
    """去除 YAML frontmatter (--- ... ---)，保留正文。"""
    # 匹配开头的 YAML frontmatter
    if content.startswith("---"):
        parts = content.split("---", 2)
        if len(parts) >= 3:
            return parts[2].strip()
    return content.strip()


# ═══════════════════════════════════════════
# 单元学习 (模式 3)
# ═══════════════════════════════════════════

def _get_chapter_sections(chapter_id: int) -> list:
    """扫描 01-章节笔记/ 获取指定章的所有小节。返回 [{lesson, title, file_path}]"""
    sections = []
    if not NOTE_DIR.exists():
        return sections

    prefix = f"{chapter_id}."
    for subdir in NOTE_DIR.iterdir():
        if not subdir.is_dir():
            continue
        for f in subdir.iterdir():
            if not f.suffix == ".md":
                continue
            if not f.name.startswith(prefix):
                continue
            # 解析 YAML frontmatter 提取 lesson 和 title
            lesson, title = _parse_section_frontmatter(f)
            if lesson:
                sections.append({"lesson": lesson, "title": title, "file_path": f})

    # 按 lesson 编号排序 (如 "9.1" < "9.2")
    sections.sort(key=lambda s: [int(x) for x in s["lesson"].split(".")])
    return sections


def _parse_section_frontmatter(file_path: Path) -> tuple:
    """解析小节 MD 的 YAML frontmatter，返回 (lesson, title)"""
    try:
        content = file_path.read_text(encoding="utf-8")
    except Exception:
        return "", ""
    if not content.startswith("---"):
        return "", ""

    parts = content.split("---", 2)
    if len(parts) < 3:
        return "", ""

    fm = parts[1]
    lesson = ""
    title = ""
    for line in fm.strip().split("\n"):
        line = line.strip()
        if line.startswith("lesson:"):
            lesson = line.split(":", 1)[1].strip()
        elif line.startswith("title:"):
            title = line.split(":", 1)[1].strip()
    return lesson, title


def _extract_section_brief(file_path: Path) -> dict:
    """提取小节 MD 的核心内容: 本节核心 + 考点整理 + 速记"""
    try:
        content = file_path.read_text(encoding="utf-8")
    except Exception:
        return {"core": "", "exam_points": "", "quick_summary": ""}

    # 去除 YAML frontmatter
    if content.startswith("---"):
        parts = content.split("---", 2)
        body = parts[2] if len(parts) >= 3 else content
    else:
        body = content

    def _extract_section(text: str, heading: str) -> str:
        """提取指定 ## 标题下的内容 (到下一个 ## 或文件末尾)"""
        pattern = rf"##\s+{re.escape(heading)}\s*\n(.+?)(?=\n##\s|\Z)"
        m = re.search(pattern, text, re.DOTALL)
        if m:
            return m.group(1).strip()
        return ""

    return {
        "core": _extract_section(body, "本节核心"),
        "exam_points": _extract_section(body, "本节考点整理"),
        "quick_summary": _extract_section(body, "本节速记"),
    }


def _build_section_quiz_ctx(section: dict, chapter_id: int) -> str:
    """组装小节级出题上下文"""
    brief = _extract_section_brief(section["file_path"])

    return f"""请使用 /skill:review-assistant 中的题型模板。

【单元学习】第{chapter_id}章
【当前小节】{section['lesson']} {section['title']}
【参考路径】{str(REFERENCE)}

【小节核心】
{brief['core'] or '（无）'}

【考点整理】
{brief['exam_points'] or '（无）'}

【速记】
{brief['quick_summary'] or '（无）'}

---
## 子任务: generate_question

根据以上小节内容，生成 1 道正误判断题或单项选择题 (难度 S-U)。
题目应直接关联该小节的考点。
只输出题目文本。不要输出解析、答案或归档。"""


def _build_chapter_review_ctx(chapter_id: int, sections: list) -> str:
    """组装章节级综合回顾出题上下文"""
    all_exam_points = []
    for s in sections:
        brief = _extract_section_brief(s["file_path"])
        if brief["exam_points"]:
            all_exam_points.append(f"### {s['lesson']} {s['title']}\n{brief['exam_points']}")

    return f"""请使用 /skill:review-assistant 中的题型模板。

【单元学习】第{chapter_id}章 — 章节综合回顾
【已完成小节】{len(sections)} 个
【参考路径】{str(REFERENCE)}

【全章考点汇总】
{chr(10).join(all_exam_points) if all_exam_points else '（无汇总考点）'}

---
## 子任务: generate_questions

根据以上全章考点，生成 3 道跨小节的综合题目。
- 难度递进: 1道 S-U + 1道 M-U + 1道 M-A
- 题型: 判断 + 选择 + 简述 各 1 题
- 题目应综合多个小节的知识点

请一次性输出3道题，用【题1】【题2】【题3】编号。只输出题目文本。"""


def _unit_study_loop():
    """单元学习主循环: 章节→小节推进→综合回顾"""
    print(f"\n{'=' * 60}")
    print("  📖 单元学习模式")
    print(f"{'=' * 60}")

    # 选择章节
    while True:
        ch = input("\n🎯 请输入章节号 (1-20, q 退出): ").strip()
        if ch in ("q", "退出", ""):
            return
        if ch.isdigit() and 1 <= int(ch) <= 20:
            chapter_id = int(ch)
            break
        print("   ⚠️ 请输入 1-20 之间的数字")

    sections = _get_chapter_sections(chapter_id)
    if not sections:
        print(f"\n⚠️ 未找到第{chapter_id}章的章节笔记。")
        print(f"   请确认 reference/01-章节笔记/ 目录中存在 {chapter_id}.X 开头的文件。")
        return

    # 显示小节列表
    print(f"\n📚 第{chapter_id}章 — 共 {len(sections)} 个小节:")
    for i, s in enumerate(sections, 1):
        print(f"   {i}. [{s['lesson']}] {s['title']}")
    print(f"\n💡 每个小节: 阅读内容 → 做 1 道题 → 下一小节")
    cont = input("按 Enter 开始 (q 退出): ").strip()
    if cont in ("q", "退出"):
        return

    # ─── 小节循环 ───
    session = init_session(f"单元学习-第{chapter_id}章")
    section_quiz_count = 0

    for i, s in enumerate(sections, 1):
        brief = _extract_section_brief(s["file_path"])

        # 展示小节内容
        print(f"\n{'─' * 50}")
        print(f"  📖 [{i}/{len(sections)}] {s['lesson']} {s['title']}")
        print(f"{'─' * 50}")

        if brief["core"]:
            print(f"\n💡 本节核心:\n{brief['core']}")
        if brief["exam_points"]:
            print(f"\n📝 考点整理:\n{brief['exam_points']}")
        if brief["quick_summary"]:
            print(f"\n⚡ 速记:\n{brief['quick_summary']}")

        # 小节测试
        print(f"\n{'─' * 50}")
        skip = input("输入「跳过」跳过本题，Enter 开始做题: ").strip()
        if skip in ("跳过", "skip"):
            continue

        # 生成小节题目
        print("  🤔 正在生成小节测试题...")
        quiz_ctx = _build_section_quiz_ctx(s, chapter_id)
        question_text = call_pi(quiz_ctx, timeout=60)
        print(f"\n{question_text}")
        print(f"{'─' * 50}")

        # 作答
        while True:
            user_answer = input("\n✏️  你的答案: ").strip()
            if user_answer == "":
                print("   ⚠️ 请输入答案 (或 skip 跳过)")
                continue
            break

        if user_answer in ("跳过", "skip"):
            continue

        # 判题
        question_obj = {
            "question_id": generate_question_id(),
            "knowledge_points": [],
            "difficulty": "S-U",
            "type": "choice",
            "question_text": question_text,
        }
        grade_ctx = build_grade_context(question_obj, user_answer)
        print(f"\n{'─' * 50}")
        grading_result = call_pi(grade_ctx, timeout=60)
        print(f"\n{grading_result}")
        print(f"{'─' * 50}")

        # 可选追问
        discussion_history = []
        while True:
            cmd = input("\n💬 (追问 / Enter继续 / q退出): ").strip()
            if cmd == "" or cmd == "继续":
                break
            elif cmd in ("退出", "q"):
                return
            else:
                print("  🤔 (思考中...)")
                discuss_ctx = build_discuss_context(question_obj, grading_result, cmd, discussion_history)
                response = call_pi(discuss_ctx, timeout=60)
                print(f"\n{response}")
                discussion_history.append(f"[用户] {cmd}")
                discussion_history.append(f"[助手] {response}")

        # 快速归档
        is_correct = "✅" in grading_result
        _fast_archive(question_obj["question_id"], question_obj, user_answer, grading_result, is_correct, {})
        section_quiz_count += 1

    # ─── 章节综合回顾 ───
    print(f"\n{'=' * 60}")
    print(f"  🎯 第{chapter_id}章综合回顾")
    print(f"   {len(sections)} 个小节完成 → 生成 3 道综合题")
    print(f"{'=' * 60}")

    input("\n按 Enter 开始综合回顾: ")

    print("\n  🤔 正在生成综合题...")
    review_ctx = _build_chapter_review_ctx(chapter_id, sections)
    review_text = call_pi(review_ctx, timeout=90)
    print(f"\n{review_text}")
    print(f"{'─' * 50}")

    # 逐题作答
    # 用【题1】【题2】【题3】分割
    questions = re.split(r"\n(?=【题\d】)", review_text)
    if len(questions) <= 1:
        # 尝试另一种分割
        questions = re.split(r"(?=【题\d】)", review_text)
    questions = [q.strip() for q in questions if q.strip()]

    for qi, q_text in enumerate(questions[:3], 1):
        print(f"\n{'─' * 50}")
        print(f"  📝 综合题 {qi}/3")
        print(f"{'─' * 50}")
        print(f"\n{q_text}")

        while True:
            user_answer = input("\n✏️  你的答案: ").strip()
            if user_answer == "":
                print("   ⚠️ 请输入答案 (或 skip 跳过)")
                continue
            break

        if user_answer in ("跳过", "skip"):
            continue

        q_obj = {
            "question_id": generate_question_id(),
            "knowledge_points": [],
            "difficulty": ["S-U", "M-U", "M-A"][qi - 1],
            "type": ["judgment", "choice", "short_answer"][qi - 1],
            "question_text": q_text,
        }
        grade_ctx = build_grade_context(q_obj, user_answer)
        grading_result = call_pi(grade_ctx, timeout=60)
        print(f"\n{grading_result}")

        # 快速归档
        is_correct = "✅" in grading_result
        _fast_archive(q_obj["question_id"], q_obj, user_answer, grading_result, is_correct, {})

    # ─── 结束 ───
    end_session()
    print(f"\n{'=' * 60}")
    print(f"  ✅ 第{chapter_id}章单元学习完成!")
    print(f"   小节测试: {section_quiz_count} 题 | 综合回顾: {len(questions[:3])} 题")
    print(f"{'=' * 60}")


# ═══════════════════════════════════════════
# 交互式主循环
# ═══════════════════════════════════════════

def main():
    print("=" * 60)
    print("  📚 期末复习助手 — 面向对象程序设计 (C++)")
    print("=" * 60)
    print()
    print("指令: 下一题(n) | 跳过(skip) | 提示(hint) | 更难(harder) | 总结(sum) | 退出(q)")
    print()

    # ─── 系统提示由 .pi/SYSTEM.md 自动加载，Skill 由 .pi/skills/ 自动发现 ───

    # 获取复习范围
    print("\n🎯 复习范围 (支持: 「第9章」「第九章」「9」/ 关键字「指针,引用」/「错题」)")
    scope = input("   请输入: ").strip()
    if not scope:
        scope = "第9章"

    # 错题复习模式
    review_wrong = scope in ("错题", "错题本", "wrong")
    if review_wrong:
        wrong_book = load_json(WRONG_BOOK_FILE)
        entries = wrong_book.get("entries", [])
        if not entries:
            print("\n🎉 错题本为空! 请先正常做题产生错题。")
            scope = input("\n🎯 请输入复习范围: ").strip() or "第9章"
            review_wrong = False
        else:
            print(f"\n📋 错题本共 {len(entries)} 道错题")
            stats = wrong_book.get("error_type_stats", {})
            print(f"   概念混淆: {stats.get('概念混淆', 0)} | 知识遗漏: {stats.get('知识遗漏', 0)} | 推理错误: {stats.get('推理错误', 0)}")
            # 从错题中提取知识点
            wrong_kp_ids = list(set(kp for entry in entries for kp in entry.get("knowledge_points", [])))
            scope = "错题复习"
            session = init_session(scope)
            session["remaining_knowledge_points"] = wrong_kp_ids
            # 注入错题统计作为额外上下文
            session["_wrong_book_mode"] = True
            session["_wrong_stats"] = stats
            progress = load_json(PROGRESS_FILE)
            progress["current_session"] = session
            save_json(PROGRESS_FILE, progress)
            print(f"   涉及知识点: {len(wrong_kp_ids)} 个")
            review_wrong = True

    if not review_wrong:
        # 初始化会话
        session = init_session(scope)
        print(f"\n✅ 会话已创建: {session['session_id']}")
        print(f"   范围: {scope}")
        kp_count = len(session.get('remaining_knowledge_points', []))
        while kp_count == 0:
            print(f"\n   ⚠️ 未匹配到知识点!")
            print(f"   提示: 可用章节 1-20，或输入关键字如「指针」「继承」「多态」")
            print(f"   格式: 「第9章」「第九章」「9」「指针,引用」")
            scope = input("\n🎯 请输入复习范围 (q 退出): ").strip()
            if scope in ("q", "退出", ""):
                print("   已取消。")
                return
            session = init_session(scope)
            kp_count = len(session.get('remaining_knowledge_points', []))
        print(f"   知识点: {kp_count} 个")

    # 选择模式
    print("\n📋 模式选择:")
    print("   1. 先看知识卡片，再做题")
    print("   2. 直接做题")
    print("   3. 单元学习 (章节笔记 → 小节推进 → 综合回顾)")
    while True:
        mode_choice = input("请选择 (1/2/3, 默认2): ").strip()
        if mode_choice == "":
            mode_choice = "2"
        if mode_choice in ("1", "2", "3"):
            break
        print("   ⚠️ 请输入 1、2 或 3")

    if mode_choice == "3":
        _unit_study_loop()
        return

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

        # 选择难度和题型
        difficulty = _select_difficulty(kp, session)
        question_type = _select_question_type(kp)

        # ─── 知识卡片 (可选) ───
        if show_card:
            print(f"\n{'─' * 50}")
            card_content = _load_concept_card(kp["name"])
            if card_content:
                # 代码直读 reference MD，不调 pi
                print(f"\n## 知识点卡片: {kp['name']}\n")
                print(card_content)
            else:
                # 未找到现成卡片，调 pi 生成
                card_prompt = f"""请使用 /skill:review-assistant 展示复习卡片。

知识点: {kp['name']}
章节: 第{kp['chapter']}章
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
（常见误区）"""
                print("  📖 正在生成知识卡片...")
                response = call_pi(card_prompt, timeout=30)
                if response:
                    print(response)
                else:
                    print(f"\n⚠️ 卡片生成失败，以下是基本信息：\n")
                    print(f"**{kp['name']}**（第{kp['chapter']}章）")
                    print(f"常见误区: {', '.join(kp.get('common_misconceptions', [])[:3]) or '无'}")
                    print(f"\n💡 建议查阅 reference/02-概念卡片/ 目录获取详细内容。")
            print(f"\n{'─' * 50}")

            print("\n💡 输入任意内容开始做题 | 输入「跳过」进入下一个知识点")
            cmd = input("> ").strip()
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
        question_text = call_pi(gen_ctx, timeout=60)
        print(f"\n{question_text}")
        print(f"{'─' * 50}")

        # Step 2: 用户作答
        while True:
            user_answer = input("\n✏️  你的答案: ").strip()
            if user_answer == "":
                print("   ⚠️ 请输入答案 (或 skip 跳过 / q 退出)")
                continue
            break

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
        grading_result = call_pi(grade_ctx, timeout=60)
        print(f"\n{grading_result}")
        print(f"{'─' * 50}")

        # Step 4: 讨论循环
        discussion_history = []
        while True:
            print()
            cmd = input("💬 (追问 / 下一题 / 提示 / 更难): ").strip()

            if cmd == "下一题" or cmd == "n":
                # 归档 → 下一题
                is_correct = "✅ 正确" in grading_result or "✅" in grading_result
                if is_correct and not discussion_history:
                    # 快速归档: 答对且无追问，不调 pi
                    print("\n  ⚡ 快速归档...")
                    _fast_archive(question_id, question_obj, user_answer, grading_result, True, kp)
                else:
                    print("\n  📝 正在生成归档...")
                    archive_ctx = build_archive_context(
                        question_obj, user_answer, grading_result,
                        discussion_history, session.get("current_question_index", 0),
                    )
                    archive_output = call_pi(archive_ctx, timeout=90)
                    parse_and_save_archive(archive_output, question_id)
                # 持久化讨论历史
                if discussion_history:
                    update_session(last_discussion=discussion_history[-4:])  # 保留最后4条
                print(f"\n{'─' * 50}")
                break  # 跳出讨论循环，进入下一题

            elif cmd == "总结" or cmd == "sum":
                # 先归档当前题，再结束会话
                is_correct = "✅ 正确" in grading_result or "✅" in grading_result
                if is_correct and not discussion_history:
                    print("\n  ⚡ 快速归档...")
                    _fast_archive(question_id, question_obj, user_answer, grading_result, True, kp)
                else:
                    print("\n  📝 正在生成归档...")
                    archive_ctx = build_archive_context(
                        question_obj, user_answer, grading_result,
                        discussion_history, session.get("current_question_index", 0),
                    )
                    archive_output = call_pi(archive_ctx, timeout=90)
                    parse_and_save_archive(archive_output, question_id)
                if discussion_history:
                    update_session(last_discussion=discussion_history[-4:])
                break  # 跳出讨论循环

            elif cmd == "退出" or cmd == "q":
                return

            elif cmd == "提示" or cmd == "hint":
                hint_prompt = f"""请使用 /skill:review-assistant 的讨论指南。

【参考路径】{str(REFERENCE)}
【题目】{question_text}
用户请求提示 (给一个引导性的提示帮助思考，不要直接给出答案)。"""
                response = call_pi(hint_prompt, timeout=30)
                print(f"\n💡 {response}")
                discussion_history.append(f"[用户请求提示]")
                discussion_history.append(f"[助手提示] {response}")

            elif cmd in ("更难", "harder", "加难度"):
                # 提升下一题难度，不影响当前题
                update_session(_next_difficulty_up=True)
                print("\n📈 已记录！下一题将提升难度。")

            else:
                # 用户追问，Pi 讨论
                print("  🤔 (思考中...)")
                discuss_ctx = build_discuss_context(
                    question_obj, grading_result, cmd, discussion_history
                )
                response = call_pi(discuss_ctx, timeout=60)
                print(f"\n{response}")
                discussion_history.append(f"[用户] {cmd}")
                discussion_history.append(f"[助手] {response}")

        # 检查是否要结束会话
        if cmd == "总结" or cmd == "sum":
            break

    # ─── 会话总结 ───
    _generate_session_summary()


def _generate_session_summary():
    """生成会话总结报告到 summaries/ 目录"""
    session = end_session()
    if not session:
        print("\n👋 再见!")
        return

    session_id = session.get("session_id", "unknown")
    scope = session.get("scope", "N/A")
    total = session.get("total_questions", 0)
    correct = session.get("correct", 0)
    incorrect = session.get("incorrect", 0)

    print(f"\n{'=' * 60}")
    print(f"  📊 会话总结")
    print(f"{'=' * 60}")
    print(f"""
  复习范围: {scope}
  完成题目: {total} 题
  正确: {correct} 题 | 错误: {incorrect} 题
  正确率: {_calc_accuracy(session):.0%}
""")

    # ─── 收集本次 session 的所有归档 ───
    session_dir = SESSION_ARCHIVE_DIR / session_id
    archives = []
    if session_dir.exists():
        for json_file in sorted(session_dir.glob("*.json")):
            try:
                archives.append(load_json(json_file))
            except Exception:
                pass

    if not archives:
        print("\n  ⚠️ 暂无题目归档，跳过总结报告。")
        print(f"\n{'=' * 60}")
        print("  👋 再见!")
        print(f"{'=' * 60}")
        return

    # ─── 调用 Pi 生成总结报告 ───
    print(f"\n  📝 正在生成总结报告 (基于 {len(archives)} 道题目归档)...\n")

    summary_prompt = f"""请使用 /skill:review-assistant 中的总结报告模板。

【会话概要】
- 范围: {scope}
- 完成: {total} 题 (正确 {correct}, 错误 {incorrect})
- 正确率: {_calc_accuracy(session):.0%}

【题目归档列表】
{json.dumps(archives, ensure_ascii=False, indent=2)}

请按 skill 中的「总结报告」格式生成一份完整的 MD 总结报告。
包含: 总体评价、逐题回顾、薄弱环节、知识体系、下次建议。"""

    report = call_pi(summary_prompt, timeout=120)
    print(report)

    # ─── 保存总结报告 ───
    SUMMARY_DIR.mkdir(parents=True, exist_ok=True)
    date_str = datetime.now().strftime("%Y%m%d")
    summary_path = SUMMARY_DIR / f"{session_id}_总结.md"
    summary_path.write_text(report, encoding="utf-8")

    print(f"\n  ✅ 总结报告已保存: summaries/{summary_path.name}")
    print(f"\n{'=' * 60}")
    print("  👋 会话结束，加油复习!")
    print(f"{'=' * 60}")


def _get_current_session_id() -> str:
    """获取当前会话 ID"""
    progress = load_json(PROGRESS_FILE)
    session = progress.get("current_session", {}) or {}
    return session.get("session_id", "unknown")


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
