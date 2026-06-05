#!/usr/bin/env python3
"""
M1 集成测试 — 模拟完整题目生命周期
系统提示由 .pi/SYSTEM.md 自动加载，Skill 由 .pi/skills/ 自动发现
"""

import json
import os
import re
import subprocess
import sys
import io
from pathlib import Path

# 修复 Windows 终端编码
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

PROJECT_ROOT = Path(__file__).parent.parent
WORKSPACE = Path(__file__).parent
DATA_DIR = WORKSPACE / "data"
KNOWLEDGE_INDEX_PATH = DATA_DIR / "knowledge_index.json"

def _find_pi() -> str:
    import shutil as _shutil
    if sys.platform == "win32":
        found = _shutil.which("pi.cmd") or _shutil.which("pi")
        if found:
            return found
        for base in [os.path.expandvars(r"%APPDATA%\npm"), os.path.expandvars(r"%LOCALAPPDATA%\npm")]:
            candidate = os.path.join(base, "pi.cmd")
            if os.path.isfile(candidate):
                return candidate
        raise FileNotFoundError("未找到 pi.cmd")
    return "pi"

PI_EXE = _find_pi()


def call_pi(prompt: str, timeout: int = 180) -> str:
    """调用 pi -p（系统提示和 Skill 自动发现）"""
    result = subprocess.run(
        [
            PI_EXE, "-p",
            "-nbt",                  # 禁用内置工具
            "--tools", "read",       # 只开放 read
            "--no-session",
            "-nc",                   # 不加载 AGENTS.md
            "-ne",                   # 不加载 extensions
            "--thinking", "off",
        ],
        input=prompt,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        timeout=timeout, cwd=str(PROJECT_ROOT),
    )
    if result.returncode != 0:
        print(f"  [警告] 退出码={result.returncode}")
    return result.stdout.strip()


def main():
    index = json.loads(KNOWLEDGE_INDEX_PATH.read_text(encoding="utf-8"))
    chapter9 = index["chapters"]["9"]
    kp = chapter9["knowledge_points"][0]  # 拷贝构造函数
    difficulty = "S-U"
    question_type = "choice"

    print("=" * 60)
    print("  M1 - 完整题目生命周期")
    print(f"  知识点: {kp['name']} | 难度: {difficulty} | 题型: {question_type}")
    print("=" * 60)

    # ═══ Step 1: 生成题目 ═══
    print("\n" + "-" * 50)
    print("  Step 1: 生成题目")
    print("-" * 50)

    gen_prompt = f"""请使用 /skill:review-assistant 中的题型模板，生成一道关于「{kp['name']}」的 {_type_name(question_type)} (难度 {difficulty})。

知识点背景:
- 章节: 第{kp['chapter']}章 {chapter9['title']}
- 关联: {', '.join(kp.get('related', [])[:5])}
- 常见误区: {', '.join(kp.get('common_misconceptions', [])[:3])}
- 出题提示: {kp.get('generation_hints', '')}

要求: 4个选项(A/B/C/D)，1个正确，3个干扰。干扰项基于常见误区。不要"以上都对/都错"。

只输出题目文本。不要输出答案或解析。"""

    print("  调用 Pi...")
    question_text = call_pi(gen_prompt)
    print(f"\n{question_text}")

    # ═══ Step 2: 模拟作答 ═══
    print("\n" + "-" * 50)
    print("  Step 2: 模拟用户作答")
    print("-" * 50)
    user_answer = "B"
    print(f"  用户选: {user_answer}")

    # ═══ Step 3: 判题 ═══
    print("\n" + "-" * 50)
    print("  Step 3: 判题 + 解析")
    print("-" * 50)

    grade_prompt = f"""请使用 /skill:review-assistant 中的判题标准。

题目:
```
{question_text}
```

用户选了: {user_answer}

请按 skill 中的格式判断对错、给出正确答案和 Level 1 解析。"""

    print("  调用 Pi...")
    grading_result = call_pi(grade_prompt)
    print(f"\n{grading_result}")

    # ═══ Step 4: 讨论 ═══
    print("\n" + "-" * 50)
    print("  Step 4: 讨论 (用户追问)")
    print("-" * 50)
    user_query = "B选项为什么不对？错在哪里？"
    print(f"  用户问: {user_query}")

    discuss_prompt = f"""请使用 /skill:review-assistant 中的讨论指南。

题目:
```
{question_text}
```

判题结果:
```
{grading_result}
```

用户追问: {user_query}

按 skill 中 Level 2 规则回答。一次聚焦用户问的内容。"""

    print("  调用 Pi...")
    discuss_result = call_pi(discuss_prompt)
    print(f"\n{discuss_result}")

    # ═══ Step 5: 归档 ═══
    print("\n" + "-" * 50)
    print("  Step 5: 归档生成")
    print("-" * 50)

    archive_prompt = f"""请使用 /skill:review-assistant 中的归档格式。

这道题目的生命周期结束，生成 JSON 归档。

【当前题目序号】1

题目:
```
{question_text}
```

用户答案: {user_answer}

判题+解析:
```
{grading_result}
```

讨论记录:
[用户] {user_query}
[助手] {discuss_result[:800]}

请输出 JSON 归档 (```json)，包含 question_id、knowledge_points、difficulty、type、timestamp、question_text、user_answer、correct_answer、explanation_l1、is_correct、discussion_summary、knowledge_chain_l3、suggestion_next。
question_id=q_20240604_001, knowledge_points=["{kp['id']}"], difficulty="{difficulty}", type="{question_type}"
不需要输出 MD。"""

    print("  调用 Pi...")
    archive_output = call_pi(archive_prompt, timeout=240)
    print(f"\n{archive_output}")

    # ═══ 保存 ═══
    print("\n" + "-" * 50)
    print("  保存归档文件")
    print("-" * 50)

    json_match = re.search(r"```json\s*\n(.*?)\n```", archive_output, re.DOTALL)

    archive_dir = WORKSPACE / "archive" / "sessions"
    archive_dir.mkdir(parents=True, exist_ok=True)

    if json_match:
        try:
            archive_json = json.loads(json_match.group(1))
            # 保存 JSON
            json_path = archive_dir / "q_20240604_001.json"
            json_path.write_text(json.dumps(archive_json, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"  JSON: {json_path}")
            print(f"  is_correct={archive_json.get('is_correct')}")
            print(f"  knowledge_chain={' -> '.join(archive_json.get('knowledge_chain_l3', []))}")

            # 从 JSON 生成 MD
            disc = archive_json.get("discussion_summary", {})
            chain = archive_json.get("knowledge_chain_l3", [])
            md_content = f"""---
question_id: q_20240604_001
knowledge_points: {', '.join(archive_json.get('knowledge_points', []))}
difficulty: {archive_json.get('difficulty', '')}
type: {archive_json.get('type', '')}
timestamp: {archive_json.get('timestamp', '')}
is_correct: {archive_json.get('is_correct', False)}
---

# 题目归档: q_20240604_001

## 题目
{archive_json.get('question_text', '')}

## 用户答案
{archive_json.get('user_answer', '')}

## 正确答案 + 解析
{archive_json.get('correct_answer', '')}

{archive_json.get('explanation_l1', '')}

## 讨论总结
### 错误根因
{disc.get('core_misconception', '无')}

### 确认的知识点
{chr(10).join('- ' + p for p in disc.get('clarified_points', [])) or '- 无'}

### 遗留问题
{chr(10).join('- ' + q for q in disc.get('lingering_questions', [])) or '- 无'}

## 知识链 (Level 3)
{' → '.join(chain) if chain else '（无）'}

## 后续建议
{archive_json.get('suggestion_next', '继续加油！')}
"""
            md_path = archive_dir / "q_20240604_001.md"
            md_path.write_text(md_content, encoding="utf-8")
            print(f"  MD: {md_path}")
        except json.JSONDecodeError as e:
            print(f"  JSON解析失败: {e}")
    else:
        print("  未找到JSON归档块")

    print("\n" + "=" * 60)
    print("  M1 集成测试完成!")
    print("=" * 60)


def _type_name(t: str) -> str:
    return {"judgment": "正误判断题", "choice": "单项选择题", "short_answer": "简述题"}.get(t, t)


if __name__ == "__main__":
    main()
