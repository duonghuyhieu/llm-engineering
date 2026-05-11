window.LESSONS = window.LESSONS || [];
window.LESSONS.push({
    week: 4,
    day: 4,
    title: "Open-Source Code Models · 9-way Showdown · Gradio UI",
    notebooks: ["week4/day4.ipynb"],
    topics: [
        "Open-source code models: Qwen2.5 Coder, DeepSeek Coder V2, GPT-OSS",
        "9-way model showdown — frontier vs open-source",
        "Local (Ollama) vs API (Groq, OpenRouter) cho open-source",
        "Gradio UI: dropdown chọn model, run code interactive",
        "GPT-OSS 20B đạt top 3 — beating Claude và GPT-5",
        "Khi nào open-source đủ tốt thay frontier"
    ],
    summary: `
## 1. Day 4 — open-source vào showdown

Day 3 chỉ test frontier (GPT, Claude, Gemini, Grok). Day 4 thêm 5 open-source model vào battle:

**Open-source models (Ollama local):**
- Qwen2.5 Coder
- DeepSeek Coder V2
- GPT-OSS 20B (OpenAI release Apache 2.0)

**Open-source qua API (paid but cheap):**
- GPT-OSS 120B qua Groq (rất nhanh nhờ LPU chip)
- Qwen3 Coder 30B qua OpenRouter

## 2. Kết quả showdown (9 models)

| Rank | Model | Speedup |
|---|---|---|
| 1 | Gemini 2.5 Pro | 1440× |
| 2 | Grok 4 | 1060× |
| 3 | **GPT-OSS 20B (local)** | **238×** 🎉 |
| 4 | GPT-5 | 233× |
| 5 | Claude Sonnet 4.5 | 184× |
| 6 | Qwen3 Coder 30B | 168× |
| 7 | DeepSeek Coder V2 | 168× |
| 8 | GPT-OSS 120B | 14× |
| 9 | Qwen 2.5 Coder | Fail (code không compile) |

**Big shock:** GPT-OSS 20B chạy LOCAL trên máy bạn beat Claude 4.5 và GPT-5. Open-source đã catch up nhanh hơn dự kiến.

## 3. Cost analysis

Cho task tương đương:

| Model | Cost/call | Setup |
|---|---|---|
| GPT-5 | ~$0.10-0.20 | Cloud API |
| Claude 4.5 | ~$0.05 | Cloud API |
| Gemini 2.5 Pro | ~$0.03 | Cloud API |
| **GPT-OSS 20B local** | **$0** | Ollama trên máy |
| Qwen 30B (OpenRouter) | ~$0.001 | API trung gian |

**Insight:** chạy GPT-OSS 20B local → free + competitive performance. Đây là **economic disruption** lớn nhất 2024-2025.

## 4. Gradio UI

Day 4 wrap thành web app: dropdown chọn model, paste Python, click "Convert" → output C++.

**Pattern UI**: \`gr.Blocks\` với 2 textbox (input/output) + dropdown + button.
`,
    callouts: [
        {
            type: "info",
            text: "**Mental model cho open-source vs frontier:** Coi như chuyên gia vs general practitioner. GP biết everything broadly. Specialist (code-specific model) sâu một lĩnh vực. Khi task code-pure → specialist thắng."
        },
        {
            type: "warn",
            text: "**Open-source ≠ free để chạy.** Tự host cần GPU rental ($0.5-3/h). Tổng cost với throughput thấp có thể đắt hơn API. Tính break-even point."
        }
    ],
    keyPoints: [
        "**Code-specific 7-13B thường đủ tốt cho 80% code task.** Đừng vội dùng GPT-5 cho mọi thứ.",
        "**SWE-Bench >> HumanEval cho production decision.** HumanEval đã saturate. SWE-Bench còn discriminate.",
        "**Open-source thắng cost.** GPT-5 ~$2.50/M, Qwen Coder qua OpenRouter ~$0.10/M. 25× rẻ hơn.",
        "**Apache 2.0 = 'safe choice'.** Qwen, StarCoder, GPT-OSS đều Apache 2.0 — clean cho commercial.",
        "**Quantization trước deploy.** 16-bit cho dev, 4-bit cho prod.",
        "**Đừng bỏ specialized chỉ vì general đứng đầu Arena.** Specialized model thường outperform general có Arena Elo cao hơn 100 điểm cho task code."
    ],
    code: [
        {
            title: "Bước 1 — Setup 6 client cho 9 model",
            lang: "python",
            before: `
**Mở rộng từ Day 3.** Thêm 3 client: Groq (chip-as-a-service), Ollama (local), OpenRouter (aggregator).

Cần install Ollama local + pull các model trước (\`ollama pull qwen2.5-coder\`).
`,
            code: `import os
import io
import sys
from dotenv import load_dotenv
from openai import OpenAI
import gradio as gr
import subprocess

load_dotenv(override=True)

# 4 frontier clients (như Day 3)
openai = OpenAI()
anthropic = OpenAI(api_key=os.getenv("ANTHROPIC_API_KEY"), base_url="https://api.anthropic.com/v1/")
gemini = OpenAI(api_key=os.getenv("GOOGLE_API_KEY"), base_url="https://generativelanguage.googleapis.com/v1beta/openai/")
grok = OpenAI(api_key=os.getenv("GROK_API_KEY"), base_url="https://api.x.ai/v1")

# NEW: 3 client cho open-source
groq = OpenAI(api_key=os.getenv("GROQ_API_KEY"), base_url="https://api.groq.com/openai/v1")
ollama = OpenAI(api_key="ollama", base_url="http://localhost:11434/v1")
openrouter = OpenAI(api_key=os.getenv("OPENROUTER_API_KEY"), base_url="https://openrouter.ai/api/v1")

# 9 models với client mapping
models = [
    "gpt-5",
    "claude-sonnet-4-5-20250929",
    "grok-4",
    "gemini-2.5-pro",
    "qwen2.5-coder",                              # Ollama local
    "deepseek-coder-v2",                           # Ollama local
    "gpt-oss:20b",                                 # Ollama local
    "qwen/qwen3-coder-30b-a3b-instruct",          # OpenRouter
    "openai/gpt-oss-120b",                         # Groq (chip-accelerated)
]

clients = {
    "gpt-5": openai,
    "claude-sonnet-4-5-20250929": anthropic,
    "grok-4": grok,
    "gemini-2.5-pro": gemini,
    "openai/gpt-oss-120b": groq,
    "qwen2.5-coder": ollama,
    "deepseek-coder-v2": ollama,
    "gpt-oss:20b": ollama,
    "qwen/qwen3-coder-30b-a3b-instruct": openrouter,
}`,
            after: `
**Mổ xẻ:**

- **\`models\`** = list of 9 model names. Sẽ làm options dropdown UI.
- **\`clients\`** = dict map model name → client object. Khi user chọn model X → lookup client X → gọi API.

**Pattern này scale tốt:** thêm model mới chỉ cần (1) append vào \`models\`, (2) thêm entry trong \`clients\`. Không sửa logic chính.

**Ollama models (chạy local):**

\`\`\`bash
ollama pull qwen2.5-coder       # ~4GB
ollama pull deepseek-coder-v2   # ~9GB
ollama pull gpt-oss:20b         # ~13GB
\`\`\`

Cần ~30GB disk space + 16-32GB VRAM cho largest. Ollama tự handle quantization (default 4-bit).

**Groq endpoint:** \`https://api.groq.com/openai/v1\`. Họ chỉ host vài model open-source (Llama, Mixtral, GPT-OSS) nhưng cực nhanh — LPU chip có thể 10× faster than GPU cho inference.

**OpenRouter:** marketplace cho hàng trăm model. Giá rẻ hơn direct ~10-20%, có fallback tự động khi 1 provider down.
`
        },
        {
            title: "Bước 2 — Port function với dispatch theo model name",
            lang: "python",
            before: `
**Refactor từ Day 3.** Thay vì 4 functions riêng (port_gpt, port_claude...), gộp thành 1 function lookup client từ dict.
`,
            code: `def write_output(cpp):
    with open("main.cpp", "w") as f:
        f.write(cpp)

def port(model, python):
    client = clients[model]                              # dispatch theo model name
    reasoning_effort = "high" if 'gpt' in model else None
    response = client.chat.completions.create(
        model=model,
        messages=messages_for(python),
        reasoning_effort=reasoning_effort,
    )
    reply = response.choices[0].message.content
    reply = reply.replace('\`\`\`cpp', '').replace('\`\`\`', '')
    write_output(reply)
    return reply                                          # return cho Gradio render`,
            after: `
**Khác biệt vs Day 3:**

1. **Function signature đơn giản hơn:** \`port(model, python)\` thay vì \`port(client, model, python)\`. Client tự lookup.

2. **Return value:** Day 3 chỉ write file. Day 4 return cũng để render trong Gradio UI.

3. **\`reasoning_effort = "high" if 'gpt' in model else None\`**: GPT models (gpt-5, gpt-oss:20b, gpt-oss-120b) đều support reasoning. Các model khác (Claude, Gemini, Grok, Qwen, DeepSeek) thì không → None.

**Pattern dispatch by name** này phổ biến cho multi-model app. Production thường có thêm:
- Error handling cho mỗi client (rate limit, network error)
- Timeout per model
- Logging request/response
- Cost tracking
`
        },
        {
            title: "Bước 3 — Gradio UI: dropdown + 2 textbox + button",
            lang: "python",
            before: `
**Wrap thành web app.** \`gr.Blocks\` cho custom layout. 2 textbox cho Python input và C++ output. Dropdown chọn model.
`,
            code: `with gr.Blocks() as ui:
    with gr.Row():
        python = gr.Textbox(label="Python code:", lines=28, value=pi)
        cpp = gr.Textbox(label="C++ code:", lines=28)
    with gr.Row():
        model = gr.Dropdown(models, label="Select model", value=models[0])
        convert = gr.Button("Convert code")

    # Click button → call port() → output vào textbox C++
    convert.click(port, inputs=[model, python], outputs=[cpp])

ui.launch(inbrowser=True)`,
            after: `
**Mổ xẻ:**

- **\`gr.Row()\`**: 2 textbox xếp ngang. Python bên trái, C++ bên phải.
- **\`lines=28\`**: textbox cao 28 dòng — đủ cho code mẫu.
- **\`value=pi\`**: pre-fill Python textbox với \`pi\` (code Leibniz từ Day 3).
- **\`gr.Dropdown(models, value=models[0])\`**: dropdown với 9 model options, default model đầu (\`gpt-5\`).
- **\`convert.click(port, inputs=[...], outputs=[...])\`**: khi click button → call \`port(model, python)\` → return value → render vào textbox \`cpp\`.

**UX:** user paste Python → chọn model → click → đợi vài giây → C++ xuất hiện. Có thể copy C++ và run trên https://www.programiz.com/cpp-programming/online-compiler/ nếu không muốn cài compiler local.

**Pattern này** áp dụng cho mọi side-by-side comparison app: translation, refactor, summary, etc.
`
        },
        {
            title: "Bước 4 — Inspect output của GPT-OSS 20B (winner local)",
            lang: "python",
            before: `
**Big surprise của Day 4.** Run với \`gpt-oss:20b\` qua Ollama → check kết quả compile và benchmark.
`,
            code: `# Port qua GPT-OSS 20B local
result = port("gpt-oss:20b", pi)
print(result[:500])      # preview C++ code

# Compile và run
compile_and_run()

# Output:
# Result: 3.141592653590
# Execution Time: 0.080438 seconds  ← 238× speedup
# (Run 3 lần consistent)`,
            after: `
**Quan sát kinh ngạc:**

- GPT-OSS 20B chạy **hoàn toàn local** (Ollama trên máy bạn)
- Beat Claude 4.5 Sonnet (cloud API, $$$)
- Beat GPT-5 (cloud API, $$$)
- Thua chỉ Gemini 2.5 Pro và Grok 4 (2 model frontier)

**Cost comparison cho 1000 task tương tự:**
- GPT-5 cloud: ~$100-200
- Claude 4.5 cloud: ~$50
- **GPT-OSS 20B local: $0** (chỉ electricity ~$0.50)

**Implication thực dụng:**

Trước 2024: muốn quality code → phải dùng frontier API.
Sau GPT-OSS release (2025): có thể self-host model 20B quality gần frontier, $0 marginal cost.

Đây là **economic disruption** lớn nhất 2024-2025 trong space LLM. Open-source đã thực sự catch up.

**Lesson cho production decision:**
- Volume thấp (<10K calls/tháng) → frontier API thuận tiện
- Volume cao (>50K calls/tháng) → self-host GPT-OSS 20B thường win
- Privacy critical → self-host bắt buộc
- Latency strict → frontier (sau quantize + GPU tốt, local có thể compete)
`
        },
        {
            title: "Bước 5 — Qwen 2.5 Coder fail — analysis",
            lang: "python",
            before: `
**Học từ thất bại.** Qwen 2.5 Coder là model code-specific 7B. Trên benchmark HumanEval thường top, nhưng trong real test này fail. Vì sao?
`,
            code: `# Port qua Qwen 2.5 Coder
result = port("qwen2.5-coder", pi)
print(result)

# Output có thể:
# - Code không syntactically valid (missing include, typo)
# - Code compile được nhưng runtime error
# - Code dùng API không tồn tại (vd hallucinate function)

# Compile sẽ fail
try:
    compile_and_run()
except subprocess.CalledProcessError as e:
    print(f"Compilation error: {e.stderr}")`,
            after: `
**Tại sao Qwen 2.5 Coder fail:**

1. **Size: 7B parameters** — nhỏ hơn nhiều so với GPT-OSS 20B, Claude (177B+), GPT-5 (1T+). Capacity giới hạn cho task complex.

2. **Context không đủ:** task này có system_info dài, compile_command phức tạp, Python code chi tiết. Model nhỏ có thể "miss" part của context.

3. **No reasoning_effort support:** Qwen 2.5 không có thinking mode → không "nghĩ kỹ" trước khi generate.

4. **Training data bias:** Qwen có thể giỏi code review, completion, nhưng yếu translation Python → C++ vì pattern hiếm trong training.

**Lesson chung:**

- **Benchmark ≠ real-world.** Qwen 2.5 Coder top HumanEval nhưng fail real task. Vì HumanEval = function completion ngắn, không phải translation full program.

- **Model size matter cho complex task.** 7B đủ cho code completion. 20B+ cần cho translation, refactoring, multi-file work.

- **Always have fallback.** Production code nên detect model failure (compile error, syntax error) → automatic retry với model lớn hơn.

**Pattern test trong production:**

\`\`\`python
def port_with_fallback(python, models_in_order):
    for model in models_in_order:
        try:
            cpp = port(model, python)
            if validate_compile(cpp):
                return cpp, model
        except Exception:
            continue
    raise RuntimeError("All models failed")

port_with_fallback(pi, ["qwen2.5-coder", "gpt-oss:20b", "gpt-5"])
# Try cheap first, fallback expensive nếu fail
\`\`\`
`
        }
    ]
});
