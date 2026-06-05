#!/usr/bin/env python3
"""
M1 集成测试 — 模拟完整题目生命周期 (精简版)
每个 pi -p 调用只注入当前子任务指令，系统提示由 .pi/SYSTEM.md 自动加载
"""

import json
import re
import subprocess
import sys
import io
from pathlib import Path

# 修复 Windows 终端编码问题
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

WORKSPACE = Path(__file__).parent
PROJECT_ROOT = WORKSPACE.parent
DATA_DIR = WORKSPACE / "data"
KNOWLEDGE_INDEX_PATH = DATA_DIR / "knowledge_index.json"

if sys.platform == "win32":
    PI_EXE = r"C:\Users\25173\AppData\Roaming\npm\pi.cmd"
else:
    PI_EXE = "pi"


def call_pi(prompt: str, system_prompt: str = None, timeout: int = 180) -> str:
    """调用 Pi (--print 模式，系统提示通过 --system-prompt 显式传入)"""
    cmd = [
        PI_EXE, "-p",           # 非交互 print 模式
        "-nbt",                  # 禁用内置工具 (bash/edit/write)
        "--tools", "read",       # 只开放 read，让 Pi 可查阅 reference/
        "--no-session",          # 不保存 session
        "-nc",                   # 不加载 AGENTS.md
        "-ns",                   # 不加载 skills
        "-ne",                   # 不加载 extensions
        "--thinking", "off",     # 关闭思考模式
    ]
    if system_prompt:
        cmd.extend(["--system-prompt", system_prompt])
    result = subprocess.run(
        cmd,
        input=prompt,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        timeout=timeout, cwd=str(PROJECT_ROOT),
    )
    if result.returncode != 0:
        print(f"  [警告] 退出码={result.returncode}")
        if result.stderr:
            print(f"  [stderr] {result.stderr[:300]}")
    return result.stdout.strip()


def main():
    # 加载 Skill Prompt (显式控制)
    skill_path = WORKSPACE / "prompts" / "review-assistant.md"
    skill_prompt = skill_path.read_text(encoding="utf-8")

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

    gen_prompt = f"""## 当前子任务: generate_question

生成一道关于「{kp['name']}」的单项选择题 (难度 {difficulty})。

知识点背景:
- 章节: 第{kp['chapter']}章 {chapter9['title']}
- 关联: {', '.join(kp.get('related', [])[:5])}
- 常见误区: {', '.join(kp.get('common_misconceptions', [])[:3])}
- 出题提示: {kp.get('generation_hints', '')}

要求:
- 4个选项 (A/B/C/D)，1个正确，3个干扰
- 干扰项基于常见误区设计
- 不要"以上都对/都错"
- 格式: 先写题目描述，再列出 A. B. C. D. 选项

只输出题目文本。不要输出答案或解析。"""

    print("  调用 Pi...")
    question_text = call_pi(gen_prompt, system_prompt=skill_prompt)
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

    grade_prompt = f"""## 当前子任务: grade_and_explain

你之前出了这道题:
```
{question_text}
```

用户选了 {user_answer}。请:
1. 判断对错
2. 给出正确答案
3. 解释为什么 (Level 1 解析)

格式:
## 判题结果
(正确/错误)

## 正确答案
(正确答案)

## 解析
(解释)"""

    print("  调用 Pi...")
    grading_result = call_pi(grade_prompt, system_prompt=skill_prompt)
    print(f"\n{grading_result}")

    # ═══ Step 4: 讨论 ═══
    print("\n" + "-" * 50)
    print("  Step 4: 讨论 (用户追问)")
    print("-" * 50)
    user_query = "B选项为什么不对？错在哪里？"
    print(f"  用户问: {user_query}")

    discuss_prompt = f"""## 当前子任务: discuss

题目:
```
{question_text}
```

判题结果:
```
{grading_result}
```

用户追问: {user_query}

请回答用户问题。可以适当展开关联知识点。但一次只聚焦用户问的内容，不要铺开太多。"""

    print("  调用 Pi...")
    discuss_result = call_pi(discuss_prompt, system_prompt=skill_prompt)
    print(f"\n{discuss_result}")

    # ═══ Step 5: 归档 ═══
    print("\n" + "-" * 50)
    print("  Step 5: 归档生成")
    print("-" * 50)

    archive_prompt = f"""## 当前子任务: archive

一道题目的生命周期即将结束。请根据以下信息生成归档。

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

请输出两个代码块:

1. JSON 归档 (```json):
{{
  "question_id": "q_20240604_001",
  "knowledge_points": ["{kp['id']}"],
  "difficulty": "{difficulty}",
  "type": "{question_type}",
  "timestamp": "2024-06-04T22:00:00Z",
  "question_text": "(完整题目)",
  "user_answer": "{user_answer}",
  "correct_answer": "(正确答案)",
  "explanation_l1": "(Level 1 解析)",
  "is_correct": true/false,
  "discussion_summary": {{
    "core_misconception": "(错误根因，正确则写'无')",
    "clarified_points": ["讨论中确认的知识点"],
    "user_self_correction": null,
    "lingering_questions": []
  }},
  "knowledge_chain_l3": ["知识点1", "知识点2"],
  "suggestion_next": "(后续建议)"
}}

2. MD 归档 (```markdown):
# 题目归档: q_20240604_001
## 题目
(完整题目)
## 用户答案
{user_answer}
## 正确答案 + 解析
(答案和解析)
## 讨论总结
(错误根因、确认的知识点)
## 知识链 (Level 3)
(用 -> 连接的知识点序列)
## 后续建议
(一句话)"""

    print("  调用 Pi...")
    archive_output = call_pi(archive_prompt, system_prompt=skill_prompt, timeout=240)
    print(f"\n{archive_output}")

    # ═══ 保存 ═══
    print("\n" + "-" * 50)
    print("  保存归档文件")
    print("-" * 50)

    json_match = re.search(r"```json\s*\n(.*?)\n```", archive_output, re.DOTALL)
    md_match = re.search(r"```markdown\s*\n(.*?)\n```", archive_output, re.DOTALL)

    archive_dir = WORKSPACE / "archive" / "sessions"
    archive_dir.mkdir(parents=True, exist_ok=True)

    if json_match:
        try:
            archive_json = json.loads(json_match.group(1))
            json_path = archive_dir / "q_20240604_001.json"
            json_path.write_text(json.dumps(archive_json, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"  JSON: {json_path}")
            print(f"  is_correct={archive_json.get('is_correct')}")
            print(f"  knowledge_chain={' -> '.join(archive_json.get('knowledge_chain_l3', []))}")
        except json.JSONDecodeError as e:
            print(f"  JSON解析失败: {e}")
    else:
        print("  未找到JSON归档块")

    if md_match:
        md_path = archive_dir / "q_20240604_001.md"
        md_path.write_text(md_match.group(1), encoding="utf-8")
        print(f"  MD: {md_path}")
    else:
        print("  未找到MD归档块")

    print("\n" + "=" * 60)
    print("  M1 集成测试完成!")
    print("=" * 60)


if __name__ == "__main__":
    main()
