window.LESSONS = window.LESSONS || [];
window.LESSONS.push({
    week: 4,
    day: 3,
    title: "Code Generator · Python → C++ · 4 Frontier Showdown · 1440× speedup",
    notebooks: ["week4/day3.ipynb"],
    topics: [
        "Project: dùng LLM dịch Python → C++ optimized",
        "Setup compile_command + system_info dynamic per machine",
        "System prompt + user prompt cho code translation",
        "port() function với reasoning_effort cho GPT-5",
        "Compile + benchmark thực tế",
        "Kết quả: Gemini 2.5 Pro 1440× speedup so với Python"
    ],
    summary: `
## 1. Project: Code Generator

Bài toán cụ thể: dịch Python code sang C++ optimized → chạy compile + benchmark → so sánh speed.

**Pipeline:**
\`\`\`
Python source
  ↓ (LLM port qua system+user prompt)
C++ code optimized
  ↓ (clang++ -Ofast -mcpu=native)
Binary
  ↓ (execute)
Result + execution time
\`\`\`

So sánh với Python execute → tính speedup.

## 2. 4 Frontier showdown

| Model | Reasoning | Speedup |
|---|---|---|
| **Gemini 2.5 Pro** | Default | **1440×** 🏆 |
| **Grok 4** | Default | 1060× |
| **GPT-5** | High effort | 233× |
| **Claude Sonnet 4.5** | Default | 184× |

(Theo experiment Edward Donner. Numbers thay đổi theo Python code complexity và optimization compiler.)

## 3. Tại sao C++ nhanh hơn Python 100-1000×

- Compiled to native code vs interpreted bytecode
- Static typing — no runtime type check
- No GIL, true parallelism
- Memory locality (struct layout, stack allocation)
- Compiler optimization: vectorization (SIMD), loop unrolling, inlining
- \`-Ofast\` cho phép unsafe math optimizations

## 4. System information dynamic

Đặc biệt: prompt include **system info** của máy user (CPU model, OS, available compiler) → LLM generate code tối ưu cho hardware cụ thể.

Pattern này dạy bài quan trọng: **prompt engineering = context engineering**. Càng nhiều context relevant → output càng tốt.
`,
    callouts: [
        {
            type: "info",
            text: "**Mental model cho code translation:** Coi như dịch sách giữa 2 ngôn ngữ. AI giỏi 'literal translation' (giữ nghĩa). Để 'idiomatic translation' (dùng cấu trúc native target) cần model rất mạnh + context hint từ human."
        },
        {
            type: "warn",
            text: "**Speedup 1000× là best case.** Workload thực tế thường 5-50×. Khi pitch sếp 'rewrite sang C++', đo trước với realistic workload."
        }
    ],
    keyPoints: [
        "**Code task verifiable → benchmark đáng tin nhất.** SWE-Bench, HumanEval, LiveCodeBench. MMLU dễ bị contamination hơn.",
        "**Speedup phụ thuộc workload type.** Numerical heavy: 100×+. I/O heavy: ít. Phân tích bottleneck trước khi rewrite.",
        "**LLM giỏi C++ vì có nhiều training data.** Rust mới hơn, ít data → translate kém hơn.",
        "**Translate ≠ optimize.** AI giữ nguyên thuật toán. Speedup từ compile + typing.",
        "**Test coverage quan trọng.** Có test → confident rewrite không hỏng.",
        "**Compiler flag matter.** \`-Ofast -mcpu=native -flto=thin\` có thể tăng 2-5× so với \`-O0\`."
    ],
    code: [
        {
            title: "Bước 1 — Setup 4 client cho frontier showdown",
            lang: "python",
            before: `
**Standard setup nhưng cho 4 frontier model.** Mỗi model cần client riêng. Lưu model names làm constants để dễ swap.
`,
            code: `import os
import subprocess
from dotenv import load_dotenv
from openai import OpenAI
from IPython.display import Markdown, display

load_dotenv(override=True)

# Setup clients
openai = OpenAI()
anthropic = OpenAI(api_key=os.getenv("ANTHROPIC_API_KEY"), base_url="https://api.anthropic.com/v1/")
gemini = OpenAI(api_key=os.getenv("GOOGLE_API_KEY"), base_url="https://generativelanguage.googleapis.com/v1beta/openai/")
grok = OpenAI(api_key=os.getenv("GROK_API_KEY"), base_url="https://api.x.ai/v1")

# Model names - đắt nhưng quality cao
OPENAI_MODEL = "gpt-5"
CLAUDE_MODEL = "claude-sonnet-4-5-20250929"
GROK_MODEL = "grok-4"
GEMINI_MODEL = "gemini-2.5-pro"

# Want to keep costs ultra-low? Replace với:
# OPENAI_MODEL = "gpt-5-nano"
# CLAUDE_MODEL = "claude-haiku-4-5"
# GROK_MODEL = "grok-4-fast-non-reasoning"
# GEMINI_MODEL = "gemini-2.5-flash-lite"`,
            after: `
**Pattern setup giống Tuần 2 Day 1 nhưng chọn 4 model thay vì 7.** Day 3 dùng top-tier để see absolute best. Day 4 sẽ thêm open-source vào showdown.

**Cost ước tính cho 1 task Python → C++:**
- GPT-5 (reasoning high): ~$0.10-0.20 per call
- Claude 4.5 Sonnet: ~$0.05
- Gemini 2.5 Pro: ~$0.03
- Grok 4: ~$0.05

**Toàn bộ Day 3 ~$0.50.** Acceptable. Nếu muốn $0 → uncomment dòng nano/haiku/flash-lite.
`
        },
        {
            title: "Bước 2 — Retrieve system info để guide LLM",
            lang: "python",
            before: `
**Context engineering critical step.** Trước khi xin LLM tối ưu code, **tell LLM about your hardware** → tối ưu cụ thể CPU, OS, available compiler.

\`retrieve_system_info()\` là helper trong \`system_info.py\` của repo — gather CPU model, RAM, OS version, compiler available.
`,
            code: `from system_info import retrieve_system_info

system_info = retrieve_system_info()
print(system_info)`,
            after: `
**Output mẫu (Macbook M2):**

\`\`\`
Operating System: macOS 14.6.1 (Darwin)
CPU: Apple M2 Pro (10 cores: 6 performance + 4 efficiency)
RAM: 16 GB
Available compilers:
  - clang++ (Apple LLVM 15.0.0)
  - gcc-13 (Homebrew GCC 13.2.0)
Architecture: arm64
\`\`\`

**Tại sao matter:**

1. **CPU model** → LLM biết chọn \`-mcpu=apple-m2\` thay vì generic. M2 có SIMD instructions đặc thù.
2. **Architecture** (arm64 vs x86_64) → khác cách vectorize
3. **Compiler version** → biết feature C++20 nào available

**Pattern này áp dụng cho mọi task LLM:** càng nhiều context relevant về môi trường target → code generate càng tối ưu. Không có info → LLM generate code "trung bình", chạy được nhưng không optimal.

**Test thử:** chạy port với/không system_info → speedup khác biệt 2-3× cho cùng model. Đây là một trong những lesson lớn của khóa: **prompt engineering = context engineering**.
`
        },
        {
            title: "Bước 3 — Hỏi LLM compile command tối ưu",
            lang: "python",
            before: `
**Bootstrap compile command.** Trước khi port code, hỏi LLM compile command tối ưu cho máy này. Đây là **meta-prompting** — dùng LLM để setup environment cho LLM khác.
`,
            code: `message = f"""
Here is a report of the system information for my computer.
I want to run a C++ compiler to compile a single C++ file called main.cpp and then execute it in the simplest way possible.
Please reply with whether I need to install any C++ compiler to do this. If so, please provide the simplest step by step instructions to do so.

If I'm already set up to compile C++ code, then I'd like to run something like this in Python to compile and execute the code:
\`\`\`python
compile_command = # something here - to achieve the fastest possible runtime performance
compile_result = subprocess.run(compile_command, check=True, text=True, capture_output=True)
run_command = # something here
run_result = subprocess.run(run_command, check=True, text=True, capture_output=True)
return run_result.stdout
\`\`\`
Please tell me exactly what I should use for the compile_command and run_command.

System information:
{system_info}
"""

response = openai.chat.completions.create(model=OPENAI_MODEL, messages=[{"role": "user", "content": message}])
display(Markdown(response.choices[0].message.content))

# Output: GPT-5 reply markdown với compile_command đề xuất:
# compile_command = ["clang++", "-std=c++17", "-Ofast", "-mcpu=native", "-flto=thin",
#                    "-fvisibility=hidden", "-DNDEBUG", "main.cpp", "-o", "main"]
# run_command = ["./main"]`,
            after: `
**Mổ xẻ flags GPT-5 đề xuất:**

- \`-std=c++17\`: C++17 standard. Modern features (structured bindings, optional, filesystem).
- \`-Ofast\`: maximum optimization. Bao gồm \`-O3\` + unsafe math (fast-math). Faster nhưng có thể violate IEEE 754 trong edge cases.
- \`-mcpu=native\`: optimize cho CPU đang chạy (M2). Generate SIMD instructions phù hợp.
- \`-flto=thin\`: Link-Time Optimization (thin = LLVM's version). Inline across translation units.
- \`-fvisibility=hidden\`: symbols mặc định hidden → smaller binary, faster linking.
- \`-DNDEBUG\`: disable assertions trong code (release build).

**Manual copy:** lấy command GPT đề xuất → paste vào biến cứng:

\`\`\`python
compile_command = ["clang++", "-std=c++17", "-Ofast", "-mcpu=native",
                    "-flto=thin", "-fvisibility=hidden", "-DNDEBUG",
                    "main.cpp", "-o", "main"]
run_command = ["./main"]
\`\`\`

**Pattern meta-prompting** này hữu ích nhiều: hỏi LLM về môi trường, dependencies, best practices trước khi làm task chính.
`
        },
        {
            title: "Bước 4 — System prompt cho code translation",
            lang: "python",
            before: `
**Định nghĩa task rõ.** System prompt focused: chỉ output C++, không giải thích, output identical với Python.

Pattern: \`Respond only with X\` cực hữu ích cho code generation — model có xu hướng thêm explanation/markdown wrapping mà bạn phải strip sau.
`,
            code: `system_prompt = """
Your task is to convert Python code into high performance C++ code.
Respond only with C++ code. Do not provide any explanation other than occasional comments.
The C++ response needs to produce an identical output in the fastest possible time.
"""

def user_prompt_for(python):
    return f"""
Port this Python code to C++ with the fastest possible implementation that produces identical output in the least time.
The system information is:
{system_info}
Your response will be written to a file called main.cpp and then compiled and executed; the compilation command is:
{compile_command}
Respond only with C++ code.
Python code to port:

\`\`\`python
{python}
\`\`\`
"""

def messages_for(python):
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt_for(python)}
    ]`,
            after: `
**Mổ xẻ prompt design:**

**System prompt (3 constraints):**
1. "convert Python into high performance C++" — task definition
2. "Respond only with C++ code... no explanation" — format constraint
3. "produce identical output in the fastest possible time" — success criteria

**User prompt include 3 context:**
1. \`system_info\`: hardware target → CPU-specific optimization
2. \`compile_command\`: compiler flags → LLM biết \`-Ofast\` available, có thể assume undefined behavior optimization
3. Python source code wrapped in markdown code fence

**Pattern function-based prompt:** \`user_prompt_for(python)\` là function tạo prompt từ data. Dễ test, dễ swap python source. Tốt hơn build prompt string manually.
`
        },
        {
            title: "Bước 5 — Port function: gọi LLM và save output",
            lang: "python",
            before: `
**Core function.** Take a client + model + python code → save C++ vào main.cpp.

**\`reasoning_effort\`**: chỉ GPT-5 support. Cho high effort để model "nghĩ kỹ" về optimization. Các model khác không support param này → set None.
`,
            code: `def write_output(cpp):
    with open("main.cpp", "w", encoding="utf-8") as f:
        f.write(cpp)

def port(client, model, python):
    # GPT-5 hỗ trợ reasoning_effort; các model khác không
    reasoning_effort = "high" if 'gpt' in model else None

    response = client.chat.completions.create(
        model=model,
        messages=messages_for(python),
        reasoning_effort=reasoning_effort,
    )

    reply = response.choices[0].message.content

    # Strip markdown code fence nếu LLM bám prompt không kỹ
    reply = reply.replace('\`\`\`cpp', '').replace('\`\`\`', '')

    write_output(reply)`,
            after: `
**Mổ xẻ:**

- **\`reasoning_effort='high'\`** cho GPT-5: cho phép model dùng nhiều inference token để "nghĩ" về optimization. Cost cao hơn ~5×, nhưng output thường tốt hơn rõ rệt cho task khó như code translation.

- **Defensive parsing:** dù system prompt nói "respond only with C++", LLM **vẫn có thể** wrap output trong \`\`\`cpp ... \`\`\`. \`.replace('\`\`\`cpp', '').replace('\`\`\`', '')\` strip cả 2 trường hợp. **Always defensive parse code from LLM.**

- **\`write_output\`** save vào \`main.cpp\` ở cùng thư mục notebook. Compile command \`clang++ main.cpp -o main\` sẽ pick up.

**Note:** function này KHÔNG return code. Side effect duy nhất = file written. Day 4 sẽ refactor để return cũng để render UI Gradio.
`
        },
        {
            title: "Bước 6 — Python baseline + Pi calculation benchmark",
            lang: "python",
            before: `
**Test case: tính π bằng Leibniz series.** Computational heavy, no I/O — ideal cho benchmark.

\`200,000,000\` iterations. Python sẽ chạy ~20s. C++ optimized hy vọng <0.1s.
`,
            code: `pi = """
import time

def calculate(iterations, param1, param2):
    result = 1.0
    for i in range(1, iterations+1):
        j = i * param1 - param2
        result -= (1/j)
        j = i * param1 + param2
        result += (1/j)
    return result

start_time = time.time()
result = calculate(200_000_000, 4, 1) * 4
end_time = time.time()

print(f"Result: {result:.12f}")
print(f"Execution Time: {(end_time - start_time):.6f} seconds")
"""

def run_python(code):
    globals = {"__builtins__": __builtins__}
    exec(code, globals)

# Run Python baseline
run_python(pi)

# Output:
# Result: 3.141592653590
# Execution Time: 19.178207 seconds`,
            after: `
**Quan sát:**

- **Result: 3.141592653590** — chính xác đến 12 chữ số sau dấu phẩy
- **Execution Time: 19.18 seconds** — Python chạy 200M iterations mất ~20s

**Tại sao Python chậm:**

- **Interpreted bytecode**: mỗi iteration là Python VM dispatch
- **Dynamic typing**: mỗi phép tính kiểm tra type runtime
- **Heap allocation**: int và float là object trên heap
- **No SIMD**: Python loop không vectorize được

**Mục tiêu C++:** giữ nguyên thuật toán (Leibniz series, 200M iterations) nhưng compile sang native code → speedup expected 100-1000×.

**Function \`run_python\` an toàn execute code trong namespace riêng.** \`globals = {"__builtins__": __builtins__}\` cô lập variables — không pollute notebook scope.
`
        },
        {
            title: "Bước 7 — Run frontier showdown",
            lang: "python",
            before: `
**Đây là moment of truth.** Port code với 4 model khác nhau, compile + run, đo time.

Pattern: \`port() → compile_and_run()\` cho mỗi model. So sánh speedup.
`,
            code: `def compile_and_run():
    subprocess.run(compile_command, check=True, text=True, capture_output=True)
    # Run 3 lần lấy average (chống noise)
    for _ in range(3):
        result = subprocess.run(run_command, check=True, text=True, capture_output=True)
        print(result.stdout)

# Test với GPT-5
port(openai, OPENAI_MODEL, pi)
compile_and_run()
# Output (3 runs): Execution Time: 0.082168 seconds

# Test với Claude
port(anthropic, CLAUDE_MODEL, pi)
compile_and_run()
# Output: Execution Time: 0.104241 seconds

# Test với Grok
port(grok, GROK_MODEL, pi)
compile_and_run()
# Output: Execution Time: 0.018092 seconds

# Test với Gemini
port(gemini, GEMINI_MODEL, pi)
compile_and_run()
# Output: Execution Time: 0.013314 seconds`,
            after: `
**Kết quả (Edward Donner's experiment, MacBook M2):**

| Model | C++ Time | Speedup vs Python |
|---|---|---|
| Python baseline | 19.178s | 1× |
| GPT-5 (reasoning high) | 0.082s | **234×** |
| Claude Sonnet 4.5 | 0.104s | **184×** |
| Grok 4 | 0.018s | **1060×** |
| Gemini 2.5 Pro | 0.013s | **1441×** |

**Phân tích thắng cuộc:**

**Gemini 2.5 Pro thắng vì:**
- Dùng vectorized math intrinsics (SIMD)
- Loop transformation (parallel computation)
- Custom precision handling

**Grok 4 thứ 2** với similar techniques.

**GPT-5 và Claude:** generate code đúng và nhanh, nhưng không exploit SIMD hardware fully.

**Bài học:**
- Khác biệt 2 model top-tier có thể là **10×** trên task computational
- "Best model overall" không đồng nghĩa "best cho task X" — phải test
- Reasoning effort high giúp GPT-5 nhưng vẫn không bằng Gemini default (đôi khi context-engineering tốt > reasoning lâu)
`
        },
        {
            title: "Bước 8 — Inspect code Gemini generated",
            lang: "bash",
            before: `
**Look bên trong winner.** Mở \`main.cpp\` xem Gemini làm gì để đạt 1440×.
`,
            code: `# Xem code Gemini tạo
!cat main.cpp

# Output mẫu (Gemini 2.5 Pro):
#
# #include <cstdio>
# #include <chrono>
# #include <cmath>
#
# int main() {
#     constexpr int64_t iterations = 200000000;
#     constexpr int64_t param1 = 4;
#     constexpr int64_t param2 = 1;
#
#     auto start = std::chrono::high_resolution_clock::now();
#
#     double result = 1.0;
#     #pragma omp simd reduction(+:result)
#     for (int64_t i = 1; i <= iterations; ++i) {
#         double j_minus = (double)(i * param1 - param2);
#         double j_plus  = (double)(i * param1 + param2);
#         result += (1.0 / j_plus) - (1.0 / j_minus);
#     }
#     result *= 4.0;
#
#     auto end = std::chrono::high_resolution_clock::now();
#     auto duration = std::chrono::duration<double>(end - start).count();
#
#     printf("Result: %.12f\\n", result);
#     printf("Execution Time: %.6f seconds\\n", duration);
#     return 0;
# }`,
            after: `
**Mổ xẻ optimizations Gemini áp dụng:**

1. **\`constexpr\`**: compile-time constants. Compiler có thể propagate, fold expression.

2. **\`int64_t\`** thay \`int\`: prevent overflow ở 200M × 4 = 800M (> INT_MAX 2.1 billion edge).

3. **\`#pragma omp simd reduction(+:result)\`**: hint compiler để vectorize loop với SIMD (Single Instruction Multiple Data). M2 có 128-bit NEON → process 2 doubles per cycle.

4. **Combined operations**: thay vì 2 phép trừ và cộng riêng → \`(1/j_plus) - (1/j_minus)\`. Compiler có thể optimize chung.

5. **\`std::chrono\`** thay \`std::time\`: high precision timing.

6. **\`printf\`** thay \`std::cout\`: ít overhead hơn iostream.

**Tại sao GPT-5 và Claude không dùng tất cả?** Có thể vì:
- Training data không có đủ examples về SIMD pragma
- Reasoning không "discover" được vectorization opportunity
- Conservative — sticks với "safe" generic C++

**Bài học:** với task niche như high-performance computing, model nào có training data phù hợp sẽ win — không phải model "thông minh nhất overall".
`
        }
    ]
});
