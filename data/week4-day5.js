window.LESSONS = window.LESSONS || [];
window.LESSONS.push({
    week: 4,
    day: 5,
    title: "Python → Rust · Generalize translation pipeline · Tech metrics vs Business outcomes",
    notebooks: ["week4/day5.ipynb"],
    topics: [
        "Generalize port function: hỗ trợ cả C++ và Rust",
        "Rust compile command với cargo flags",
        "Python_hard — code phức tạp hơn pi (LCG + max_subarray)",
        "Custom Gradio UI với CSS theme",
        "Open-source GPT-OSS 120B thắng cuộc trong Rust",
        "Technical metrics vs Business outcomes — lesson cuối Tuần 4"
    ],
    summary: `
## 1. Generalize cho language khác

Day 5 mở rộng pipeline Day 3-4: thay vì hardcode "C++", parameterize bằng \`language\` variable. Code y hệt — chỉ đổi system prompt và compile command.

\`\`\`python
language = "Rust"   # hoặc "C++"
extension = "rs" if language == "Rust" else "cpp"
\`\`\`

System prompt tự thay đổi:
\`\`\`
"Your task is to convert Python code into high performance {language} code"
\`\`\`

## 2. Rust vs C++

| | C++ | Rust |
|---|---|---|
| Tuổi | 1985 | 2010 |
| Memory safety | Manual (RAII help) | Compiler-enforced |
| Concurrency | std::thread, OpenMP | Native ownership model |
| Compiler | clang++, g++ | rustc + cargo |
| Optimization flags | \`-Ofast -mcpu=native\` | \`opt-level=3 target-cpu=native\` |
| Training data trong LLM | Rất nhiều | Ít hơn (mới) |

**Hệ quả Day 5:** nhiều frontier model **FAIL** với Rust trong khi pass với C++. Vì training data Rust ít hơn → model less familiar.

## 3. Python_hard — task khó hơn

Day 3 dùng Pi (simple loop). Day 5 dùng LCG (Linear Congruential Generator) + max subarray — task có:
- **Generator pattern** (Python yield)
- **Large numbers** (cần i64 hoặc u64)
- **Nested loops O(n²)**

Test khả năng LLM port idiomatic features (generator) sang language khác.

## 4. Kết quả Day 5

| Model | Rust |
|---|---|
| Qwen 2.5 Coder | FAIL |
| Gemini 2.5 Pro | FAIL ⚠️ |
| DeepSeek Coder | FAIL |
| Qwen3 30B | FAIL |
| Claude 4.5 | FAIL |
| GPT-5 | FAIL |
| GPT-OSS 20B | 0.000341s |
| Grok 4 | 0.000317s |
| **GPT-OSS 120B** | **0.000304s** 🏆 |

**Twist!** Gemini 2.5 Pro thắng tuyệt đối với C++ → FAIL với Rust. Vì training data Rust ít hơn → model nhỏ specialized (Qwen, DeepSeek) cũng FAIL.

**Open-source GPT-OSS 120B (qua Groq)** thắng cuộc — speedup ~111,000× vs Python.

## 5. Bài học Tuần 4

**Tech metrics vs Business outcomes:**

| Tech metric | Business question |
|---|---|
| MMLU 85% | Có giúp doanh thu? |
| 1440× speedup | User có quan tâm? |
| HumanEval 95% | Bug rate thực giảm? |

Day 5 nhắc nhở: technical wins ≠ business wins. Một AI assistant beat human trên HumanEval không có nghĩa giúp dev team productivity cao hơn. Cần đo **end-to-end outcome** (PR throughput, bug rate, dev satisfaction), không chỉ benchmark.
`,
    callouts: [
        {
            type: "info",
            text: "**Mental model cho metric:** Coi technical metric như 'leading indicator', business outcome như 'lagging indicator'. Cải thiện leading thường (nhưng không luôn) → cải thiện lagging. Phải verify mối quan hệ này cho task của bạn."
        },
        {
            type: "warn",
            text: "**Đừng confuse AI quality với product success.** Nhiều startup AI thất bại không phải vì model kém — mà vì product-market fit, UX, distribution. AI giỏi là điều kiện cần, không đủ."
        }
    ],
    keyPoints: [
        "**Generalize pipeline = parameterize.** Đổi 1 variable (\`language\`) → support N target language. Pattern này cho mọi code translator/transformer.",
        "**Training data lệch dữ.** C++/Python có terabytes online. Rust ít hơn 10×. Mojo/Zig: 100× ít. Performance model trên language hiếm sẽ kém.",
        "**Open-source dần dominant.** GPT-OSS 120B beat tất cả frontier trên Rust. Trend này sẽ tiếp tục.",
        "**FAIL gracefully.** Production code nên detect fail (compile error) → auto fallback model khác.",
        "**Benchmark beat human ≠ replace human.** GitHub Copilot tăng dev throughput ~30%, không phải 1000% như HumanEval suggest.",
        "**Domain matter hơn 'best model'.** Cho Rust → chọn model trained nhiều Rust. Cho legal → chọn model trained legal docs."
    ],
    code: [
        {
            title: "Bước 1 — Setup tương tự Day 4, plus Rust compile command",
            lang: "python",
            before: `
**Reuse client setup từ Day 4.** Thêm Rust compile command qua \`rustc\`. Đổi extension file.
`,
            code: `language = "Rust"    # hoặc "C++"
extension = "rs" if language == "Rust" else "cpp"

# Rust compile command (optimal)
compile_command = [
    "/Users/ed/.cargo/bin/rustc",          # path tới rustc của bạn
    "main.rs",
    "-C", "opt-level=3",                    # max optimization
    "-C", "target-cpu=native",              # tối ưu CPU hiện tại
    "-C", "codegen-units=1",                # 1 codegen unit → cross-function inline tốt hơn
    "-C", "lto=fat",                        # Link-Time Optimization full
    "-C", "panic=abort",                    # abort thay vì unwind → smaller, faster
    "-C", "strip=symbols",                  # strip debug info
    "-o", "main",
]
run_command = ["./main"]`,
            after: `
**Mổ xẻ Rust flags:**

- **\`opt-level=3\`**: tương đương \`-O3\` của C++. Max optimization.
- **\`target-cpu=native\`**: same idea với \`-mcpu=native\` của clang.
- **\`codegen-units=1\`**: compile chậm hơn nhưng inline tốt hơn (cross-function). Default 16 cho compile fast.
- **\`lto=fat\`**: Link-Time Optimization full mode (Rust có thin/fat). Tốn RAM hơn nhưng output nhanh hơn.
- **\`panic=abort\`**: thay vì unwind stack (slower), abort process khi panic. Phù hợp executable, không phù hợp library.
- **\`strip=symbols\`**: bỏ debug symbols → binary nhỏ hơn ~50%.

**Pattern bootstrap meta-prompt** ở Day 3: hỏi GPT về flags tối ưu cho system của mình. Cell này có thể là output của một meta-prompt query "What are optimal rustc flags for max runtime performance on this hardware?"

**Lưu ý:** \`/Users/ed/.cargo/bin/rustc\` là path Mac của Edward. Tự thay bằng path của bạn (chạy \`which rustc\` để tìm).
`
        },
        {
            title: "Bước 2 — Generalize system prompt với f-string",
            lang: "python",
            before: `
**Key change:** thay vì hardcode "C++" trong prompt → f-string với \`{language}\` variable. Đổi \`language = "Rust"\` → toàn bộ pipeline tự switch.
`,
            code: `system_prompt = f"""
Your task is to convert Python code into high performance {language} code.
Respond only with {language} code. Do not provide any explanation other than occasional comments.
The {language} response needs to produce an identical output in the fastest possible time.
"""

def user_prompt_for(python):
    return f"""
Port this Python code to {language} with the fastest possible implementation that produces identical output in the least time.
The system information is:
{system_info}
Your response will be written to a file called main.{extension} and then compiled and executed; the compilation command is:
{compile_command}
Respond only with {language} code.
Python code to port:

\`\`\`python
{python}
\`\`\`
"""`,
            after: `
**Pattern này quan trọng:** **parameterize prompts cho multiple variants**.

- 1 file, 2 language: chỉ đổi 1 variable.
- Thêm Go support? Thêm \`language = "Go"\`, extension = "go", compile_command.
- Thêm Mojo? Same pattern.

**Without parameterization:** phải copy paste toàn bộ prompt cho mỗi language → maintenance nightmare.

**Production pattern:** prompt template engine (Jinja2, format strings) → swap variables runtime. LangChain có \`PromptTemplate\` cho cái này.
`
        },
        {
            title: "Bước 3 — Python_hard: task khó hơn để test serious",
            lang: "python",
            before: `
**Pi loop (Day 3) quá đơn giản** — gần như mọi model đều handle được. Day 5 nâng độ khó:

- **Generator pattern** (Python \`yield\`)
- **Stateful loop**
- **Nested O(n²)**
- **Large numbers** (cần \`u64\` hoặc \`i64\`)

Đây là test thực dụng — code thực tế thường có những features này.
`,
            code: `python_hard = """# Be careful to support large numbers

def lcg(seed, a=1664525, c=1013904223, m=2**32):
    value = seed
    while True:
        value = (a * value + c) % m
        yield value

def max_subarray_sum(n, seed, min_val, max_val):
    lcg_gen = lcg(seed)
    random_numbers = [next(lcg_gen) % (max_val - min_val + 1) + min_val for _ in range(n)]
    max_sum = float('-inf')
    for i in range(n):
        current_sum = 0
        for j in range(i, n):
            current_sum += random_numbers[j]
            if current_sum > max_sum:
                max_sum = current_sum
    return max_sum

def total_max_subarray_sum(n, initial_seed, min_val, max_val):
    total_sum = 0
    lcg_gen = lcg(initial_seed)
    for _ in range(20):
        seed = next(lcg_gen)
        total_sum += max_subarray_sum(n, seed, min_val, max_val)
    return total_sum

# Parameters
n = 10000
initial_seed = 42
min_val = -10
max_val = 10

import time
start_time = time.time()
result = total_max_subarray_sum(n, initial_seed, min_val, max_val)
end_time = time.time()

print("Total Maximum Subarray Sum (20 runs):", result)
print("Execution Time: {:.6f} seconds".format(end_time - start_time))
"""

# Run Python baseline - mất khoảng 30-40 giây
run_python(python_hard)
# Output: Execution Time: 33.755209 seconds`,
            after: `
**Mổ xẻ task khó:**

1. **\`lcg(seed)\` generator**: Linear Congruential Generator — pseudo-random number sequence. Python implements via \`yield\` → infinite stream. Port sang Rust cần dùng struct + iterator trait.

2. **List comprehension với generator**: \`[next(lcg_gen) for _ in range(n)]\` — collect N random numbers.

3. **Nested loop O(n²)** với n=10K → 100M iterations. Cần optimize: SIMD, cache-friendly access, prefetching.

4. **\`2**32 = 4_294_967_296\`** — vượt \`int32_t\` (max ~2.1B). Phải dùng \`u64\` hoặc \`i64\` trong Rust → easy to miss → bug.

**Tại sao model FAIL:**

- Forget large number support → overflow
- Mistranslate generator pattern → output không match Python
- Suboptimal nested loop → not vectorize
- Off-by-one trong range

**Đây là task realistic.** Production code có hàng loạt subtle features này. Test trên easy task ($pi$) không reveal được capability thực.
`
        },
        {
            title: "Bước 4 — Custom Gradio UI với CSS theme",
            lang: "python",
            before: `
**UI nâng cấp.** Day 4 UI basic. Day 5 thêm:
- \`gr.Code\` thay \`gr.Textbox\` → syntax highlighting
- Custom CSS + theme Monochrome
- Buttons run Python và run C++/Rust riêng
- Output text area cho mỗi side
`,
            code: `from styles import CSS

with gr.Blocks(css=CSS, theme=gr.themes.Monochrome(), title=f"Port from Python to {language}") as ui:
    with gr.Row(equal_height=True):
        with gr.Column(scale=6):
            python = gr.Code(
                label="Python (original)",
                value=python_hard,
                language="python",
                lines=26
            )
        with gr.Column(scale=6):
            cpp = gr.Code(
                label=f"{language} (generated)",
                value="",
                language="cpp",
                lines=26
            )

    with gr.Row(elem_classes=["controls"]):
        python_run = gr.Button("Run Python", elem_classes=["run-btn", "py"])
        model = gr.Dropdown(models, value=models[0], show_label=False)
        convert = gr.Button(f"Port to {language}", elem_classes=["convert-btn"])
        cpp_run = gr.Button(f"Run {language}", elem_classes=["run-btn", "cpp"])

    with gr.Row(equal_height=True):
        with gr.Column(scale=6):
            python_out = gr.TextArea(label="Python result", lines=8, elem_classes=["py-out"])
        with gr.Column(scale=6):
            cpp_out = gr.TextArea(label=f"{language} result", lines=8, elem_classes=["cpp-out"])

    # Wire up events
    convert.click(fn=port, inputs=[model, python], outputs=[cpp])
    python_run.click(fn=run_python, inputs=[python], outputs=[python_out])
    cpp_run.click(fn=compile_and_run, inputs=[cpp], outputs=[cpp_out])

ui.launch(inbrowser=True)`,
            after: `
**Mổ xẻ:**

- **\`gr.Code(language="python")\`**: textbox với syntax highlighting cho language. Trải nghiệm dev tốt hơn nhiều \`Textbox\` plain.
- **\`gr.themes.Monochrome()\`**: theme có sẵn của Gradio. Còn có \`Soft\`, \`Glass\`, \`Default\`.
- **\`elem_classes=[...]\`**: custom CSS classes cho styling từng button.
- **\`scale=6\`** trong Column: tỷ lệ chiều rộng — 2 column scale=6 chia 50-50.

**3 event wiring:**

1. \`convert.click(fn=port, ...)\`: Port button → call LLM
2. \`python_run.click(fn=run_python, ...)\`: Run Python locally
3. \`cpp_run.click(fn=compile_and_run, ...)\`: Run C++/Rust compiled

**Pattern UI app hoàn chỉnh:** input panel + control buttons + output panel. Đây là **product layout pattern** dùng cho hầu hết AI tool app.
`
        },
        {
            title: "Bước 5 — Final ranking + bài học Tuần 4",
            lang: "python",
            before: `
**Wrap up Tuần 4.** Sau khi test toàn bộ 9 model trên cả C++ (Day 3-4) và Rust (Day 5), bài học cuối là **đánh giá tổng quan**.
`,
            code: `# Tổng kết kết quả Day 5 (Rust)
print(f"""
Day 5 - Rust translation results:

FAILS:
- Qwen 2.5 Coder      (compile error)
- Gemini 2.5 Pro      (compile error) ⚠️ winner of Day 3!
- DeepSeek Coder v2   (compile error)
- Qwen3 30B           (compile error)
- Claude Sonnet 4.5   (compile error)
- GPT-5               (compile error)

SUCCESS:
- GPT-OSS 20B  (local Ollama):  0.000341s
- Grok 4       (cloud):          0.000317s
- GPT-OSS 120B (Groq cloud):    0.000304s  🏆

GPT-OSS 120B speedup vs Python: {33.755209 / 0.000304:,.0f}x
""")`,
            after: `
**Lessons rút ra từ toàn Tuần 4:**

### 1. Không có "best model overall"

- Day 3 (Pi, C++): Gemini 2.5 Pro thắng
- Day 4 (Pi, C++): Gemini vẫn thắng, nhưng GPT-OSS 20B local top 3
- Day 5 (LCG, Rust): GPT-OSS 120B thắng, Gemini FAIL

**Mỗi task có model phù hợp riêng. Test trên use case của bạn.**

### 2. Open-source đã catch up

GPT-OSS 20B local đánh bại GPT-5 và Claude 4.5 trong nhiều case. Trước 2024 không thể tưởng tượng được. Trend này sẽ tiếp tục.

### 3. Training data bias matter

C++: training data huge → mọi model decent.
Rust: training data ít → nhiều model fail.
Cho language mới (Mojo, Zig): expect 1-2 năm nữa mới competitive.

### 4. Production cần fallback

\`\`\`python
def port_robust(python, language, models_priority):
    for model in models_priority:
        try:
            code = port(model, python, language)
            if validate_compile(code, language):
                return code, model
        except Exception:
            continue
    raise RuntimeError("All models failed")
\`\`\`

**Test cheap models first, fallback expensive.** Cost-effective + reliable.

### 5. Tech metrics vs Business outcomes

1440× speedup, 100K× speedup — sounds impressive. Nhưng:
- **User của bạn có quan tâm?** Nếu code chạy <1s là OK → speedup không matter.
- **ROI thực tế?** Dev time + LLM cost + maintenance — speedup phải bù đắp.
- **Reliability?** 9/10 lần đúng nhưng 1 lần fail có thể crash production.

**Cuối cùng:** AI engineering không phải maximize 1 metric. Là **balance quality + cost + reliability + maintainability cho business value cụ thể**.

Tuần 5 sẽ chuyển sang RAG — khi LLM zero-shot không đủ và bạn cần augment với knowledge ngoài.
`
        }
    ]
});
