# -*- coding: utf-8 -*-
"""C-P0 盲评脚本(零 UI,零产品代码改动):锻造链 vs 裸问,3 真实样本。
链:①compete测红海 → ②concept锁张力逼非共识(吃①) → ③judge杀平庸(吃②) → ④writer验独占句(吃③)。
对照:裸问"给3-5个概念方向"(模拟裸ChatGPT)。
key 从环境变量 DEEPSEEK_API_KEY 读(只进内存);全用 deepseek-chat 控成本;输出并排 md 供人盲评。"""
import io
import json
import os
import sys
import time
import urllib.request

KEY = os.environ.get("DEEPSEEK_API_KEY", "").strip()
if not KEY:
    sys.exit("no DEEPSEEK_API_KEY in env")
URL = "https://api.deepseek.com/v1/chat/completions"

TOTAL_TOKENS = {"prompt": 0, "completion": 0}


def chat(system, user, max_tokens=1400):
    body = json.dumps({
        "model": "deepseek-chat",
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "max_tokens": max_tokens,
        "temperature": 0.7,
    }).encode("utf-8")
    req = urllib.request.Request(URL, data=body, headers={
        "Content-Type": "application/json", "Authorization": "Bearer " + KEY})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                d = json.loads(r.read().decode("utf-8"))
            u = d.get("usage", {})
            TOTAL_TOKENS["prompt"] += u.get("prompt_tokens", 0)
            TOTAL_TOKENS["completion"] += u.get("completion_tokens", 0)
            return d["choices"][0]["message"]["content"]
        except Exception as e:
            if attempt == 2:
                raise
            time.sleep(3 * (attempt + 1))


SYS = "你是资深建筑投标概念顾问,回答克制、结构化、不写空话套话。"

P_COMPETE = """项目材料:
{mat}

任务(测红海·找盲区):
1. 这类项目+这类甲方,90%的投标团队会提哪5个概念方向?逐条列出,并各用一句话说明为什么它是"人人都会提的"——这5条标记为【红海·不许用】。
2. 同行普遍会忽略的1-2个机会点(材料里有依据的),标记为【盲区】。
只输出这两节,不写别的。"""

P_CONCEPT = """项目材料:
{mat}

上一道工序(红海与盲区)结论:
{prev}

任务(锁张力·逼非共识):
1. 从材料里找出2-3条"张力":某条硬约束(规划/规范/成本/场地)与甲方诉求或场地机会**相互冲突**之处。逐条写:约束是什么 vs 冲突的诉求/机会是什么。不许编造材料里没有的条件。
2. 针对每条张力,给1条**非共识概念逻辑**,格式:一句main idea + 它解了哪个张力 + 为什么评委没见过(不许落进上面的红海清单) + 最大风险。
只输出这两节。"""

P_JUDGE = """项目材料(节选):
{mat_short}

红海清单:
{redsea}

候选概念(上一道工序产出):
{prev}

任务(杀平庸·留一):
逐条处决候选概念:撞红海的杀(指出撞了哪条)、张力支撑不实的杀(指出为什么站不住)、自嗨的杀。
最后**只留1条最锋利的**,并给它2条补刀意见(怎么更狠)。若全部该杀,如实说"全灭"并说明各自死因。
只输出处决记录与幸存者。"""

P_WRITER = """幸存概念(上一道工序):
{prev}

任务(验独占性):
用**一句话**写出这个概念的独占性表述,要求:竞品套不上、评委没见过、直接可放进标书第一页。
然后自检:这句话若换成任何一个同类项目还成立吗?若成立=不独占,如实写"未通过独占性检验,需打回重逼",并说明缺什么。
只输出:独占句 + 自检结论。"""

P_BARE = """项目材料:
{mat}

请基于项目材料提出3-5个有设计叙事、空间原型与形式灵感的概念方向。"""


def run_chain(mat):
    out = {}
    out["s1_compete"] = chat(SYS, P_COMPETE.format(mat=mat))
    out["s2_concept"] = chat(SYS, P_CONCEPT.format(mat=mat, prev=out["s1_compete"]))
    out["s3_judge"] = chat(SYS, P_JUDGE.format(mat_short=mat[:1500], redsea=out["s1_compete"], prev=out["s2_concept"]))
    out["s4_writer"] = chat(SYS, P_WRITER.format(prev=out["s3_judge"]), max_tokens=600)
    return out


def main():
    samples = json.load(io.open(r".tmp_run_logs/blind_samples.json", encoding="utf-8"))
    results = []
    for s in samples:
        print("sample:", s["name"], flush=True)
        chain = run_chain(s["text"])
        bare = chat(SYS, P_BARE.format(mat=s["text"]))
        results.append({"name": s["name"], "title": s["title"], "chain": chain, "bare": bare})
        print("  done. tokens so far:", TOTAL_TOKENS, flush=True)

    # 并排盲评 md(A/B 随机位固定为:A=裸问,B=链——报告里先不揭示,末尾注明)
    lines = ["# C-P0 盲评材料 · 锻造链 vs 裸问(2026-07-08)", "",
             "> 每个样本两份产出:A 与 B。请先盲评哪份更锋利(不撞车/有张力支撑/有独占句),再看末尾揭示。", ""]
    for r in results:
        lines += [f"## 样本 · {r['name']}", f"(源:{r['title']})", "",
                  "### 产出 A", "", r["bare"], "",
                  "### 产出 B(四道工序全记录)", "",
                  "#### B-① 红海与盲区", r["chain"]["s1_compete"], "",
                  "#### B-② 张力与非共识候选", r["chain"]["s2_concept"], "",
                  "#### B-③ 处决记录与幸存者", r["chain"]["s3_judge"], "",
                  "#### B-④ 独占句与自检", r["chain"]["s4_writer"], "", "---", ""]
    est_cost = TOTAL_TOKENS["prompt"] / 1000 * 0.001 + TOTAL_TOKENS["completion"] / 1000 * 0.002
    lines += ["## 揭示与成本", "",
              "- A = 裸问(模拟裸ChatGPT单发) ; B = 锻造链(compete→concept→judge→writer)。",
              f"- 实际用量:prompt {TOTAL_TOKENS['prompt']} tok + completion {TOTAL_TOKENS['completion']} tok ≈ {est_cost:.2f} 元(deepseek-chat 挂牌价估算)。",
              "- 全部调用 deepseek-chat(未用 reasoner,控成本);产物未经人工润色。"]
    io.open(r".tmp_run_logs/blind_eval_report.md", "w", encoding="utf-8").write("\n".join(lines))
    print("REPORT -> .tmp_run_logs/blind_eval_report.md")
    print("TOKENS:", TOTAL_TOKENS, "est cost yuan: %.2f" % est_cost)


if __name__ == "__main__":
    main()
