window.LESSONS = window.LESSONS || [];
window.LESSONS.push({
    week: 2,
    day: 2,
    title: "Gradio · UI framework cho LLM · Streaming với generator · Brochure UI",
    notebooks: ["week2/day2.ipynb"],
    topics: [
        "Gradio là gì và vì sao phổ biến trong cộng đồng ML/AI",
        "1 dòng code → 1 web UI: gr.Interface()",
        "Share=True và HTTP tunneling cho demo công khai",
        "Authentication, dark mode, examples",
        "Streaming UI với Python generator + yield",
        "Brochure Generator UI — multi-input, model selector"
    ],
    summary: `
## 1. Gradio — triết lý 'function-first'

Khác biệt quan trọng so với Flask/Streamlit/Next.js:
- **Gradio**: "wrap một Python function thành web UI" — không build component
- **Use case chính**: demo, prototype, internal tool, MVP. Không thay thế production frontend
- **Sự đơn giản**: 1 dòng \`gr.Interface(fn, inputs, outputs).launch()\` → có UI, có server, có URL public

## 2. Kiến trúc dưới capo

\`\`\`
Python function với type signature
   ↓ (Gradio đọc signature)
Auto-generated Svelte frontend (built-in)
   ↓
Starlette backend (ASGI, async)
   ↓
Endpoint /api/predict được tạo tự động
\`\`\`

User click "Submit" → frontend gọi \`/api/predict\` qua AJAX → backend invoke Python function → kết quả render về frontend. Mọi binding là tự động.

## 3. 3 loại UI

| Loại | Use case |
|---|---|
| \`gr.Interface\` | Function đơn giản: input → output. Demo model, tool đơn lẻ |
| \`gr.ChatInterface\` | Chatbot có history tự động quản lý. Day 3 sẽ dùng |
| \`gr.Blocks\` | Custom layout với row/column/event. Day 5 sẽ dùng cho multi-modal |

\`gr.Blocks\` là 'low-level' nhất. \`Interface\` và \`ChatInterface\` là wrapper bên trên Blocks.
`,
    callouts: [
        {
            type: "info",
            text: "**Mental model cho Gradio:** Coi như 'JSDoc cho Python' — bạn declare input/output types và Gradio tự generate UI matching. Không phải build UI, mà 'expose' function."
        },
        {
            type: "warn",
            text: "**Đừng dùng share=True cho production.** Tunnel chậm, không có SLA, hết hạn 72h, bị nhiều mạng chặn. Cho production: deploy lên HF Spaces (free) hoặc Modal/Render (paid)."
        }
    ],
    keyPoints: [
        "**Gradio ≠ Streamlit ≠ Flask.** Gradio: function-first (wrap fn). Streamlit: script-first (top-down rerun). Flask: route-first (web app truyền thống).",
        "**\`yield\` thay vì \`return\` = streaming.** Đây là chỗ Python generator gặp Gradio đẹp nhất.",
        "**\`gr.ChatInterface\` tự quản lý history.** Bạn chỉ cần fn \`chat(message, history)\` — UI tự append, tự render bubble.",
        "**Auth Gradio = HTTP Basic Auth** (password mỗi request). Đủ internal tool, KHÔNG đủ public app.",
        "**Hot reload không có sẵn trong Jupyter.** Sửa code phải re-run cell. Trong dev script, \`gradio app.py\` (không phải \`python app.py\`) cho auto-reload."
    ],
    code: [
        {
            title: "Bước 1 — Setup imports + tạo function wrapper LLM",
            lang: "python",
            before: `
**Pattern:** trước khi build UI, wrap LLM call thành một Python function bình thường. Sau đó Gradio "promote" function này thành web UI mà không sửa logic.
`,
            code: `import os
from dotenv import load_dotenv
from openai import OpenAI
import gradio as gr   # oh yeah!

load_dotenv(override=True)
openai = OpenAI()

# Wrap LLM call thành Python function thuần
system_message = "You are a helpful assistant"

def message_gpt(prompt):
    messages = [
        {"role": "system", "content": system_message},
        {"role": "user",   "content": prompt}
    ]
    response = openai.chat.completions.create(model="gpt-4.1-mini", messages=messages)
    return response.choices[0].message.content

# Test function bình thường
message_gpt("What is today's date?")
# Output: 'I do not have access to real-time information...'`,
            after: `
**Quan sát:** \`message_gpt\` là function Python hoàn toàn bình thường — nhận \`str\`, trả \`str\`. Không có gì liên quan đến web UI. Test được trong notebook.

**Câu trả lời "I don't know date" hữu ích:** lộ ra **training cutoff** — model không biết ngày hiện tại. Pattern: model trả lời generic về "có thể, tôi không biết chắc" thường = training cutoff effect.

Khi cần ngày realtime → cần tool calling (Day 4) hoặc nhồi vào system prompt (\`Today is {today}\`).
`
        },
        {
            title: "Bước 2 — UI đầu tiên: function 'shout' qua gr.Interface",
            lang: "python",
            before: `
**Hello world của Gradio.** Function đơn giản nhất có thể — uppercase text. Wrap qua \`gr.Interface\` → có web UI ngay.
`,
            code: `# Function đơn giản
def shout(text):
    print(f"Shout has been called with input {text}")
    return text.upper()

shout("hello")
# Output: 'HELLO'

# Wrap thành web UI
gr.Interface(
    fn=shout,
    inputs="textbox",
    outputs="textbox",
    flagging_mode="never"
).launch()`,
            after: `
**Output:**

\`\`\`
Running on local URL:  http://127.0.0.1:7860
\`\`\`

Browser tự mở (hoặc click URL) — thấy UI 2 column: bên trái input textbox + button "Submit", bên phải output textbox.

**Mổ xẻ:**
- \`fn=shout\`: function được wrap
- \`inputs="textbox"\`: Gradio dùng string shorthand cho component types. \`"textbox"\` = \`gr.Textbox()\` default
- \`outputs="textbox"\`: tương tự cho output
- \`flagging_mode="never"\`: tắt nút "Flag" — feature tag bad output trong development workflow, không cần cho demo

**Click "Submit" với input "hello"** → frontend gửi POST tới Gradio server → server gọi \`shout("hello")\` → trả về "HELLO" → render lên UI. Toàn bộ binding tự động.
`
        },
        {
            title: "Bước 3 — share=True: HTTP tunneling cho demo public",
            lang: "python",
            before: `
**Cool feature.** \`share=True\` mở HTTP tunnel (giống ngrok) → tạo URL public dạng \`xxxxxxxx.gradio.live\`. Người khác trên Internet truy cập được app chạy trên máy bạn.

URL hết hạn sau 72 giờ. Một số anti-virus / corporate firewall chặn.
`,
            code: `# share=True: deploy như public demo
gr.Interface(
    fn=shout,
    inputs="textbox",
    outputs="textbox",
    flagging_mode="never"
).launch(share=True)`,
            after: `
**Output mẫu:**

\`\`\`
Running on local URL:  http://127.0.0.1:7860
Running on public URL: https://abc123def456.gradio.live
\`\`\`

Đưa \`.gradio.live\` URL cho bạn bè → họ click vào và dùng app như local. Đằng sau, mỗi click trên browser của họ → request đi qua tunnel → vào máy bạn → chạy function → response đi ngược lại.

**Use case thực tế:**
- ✅ Demo cho khách hàng / sếp xem nhanh
- ✅ Stakeholder review trước khi deploy thật
- ✅ Test mobile UI (truy cập từ điện thoại)

**KHÔNG dùng cho:**
- ❌ Production user-facing app
- ❌ Process data nhạy cảm (đi qua server Gradio)
- ❌ App cần uptime SLA

Production deploy lên HF Spaces (free), Modal, Replicate. Tunnel chỉ là tool dev.
`
        },
        {
            title: "Bước 4 — Customize UI: gr.Textbox với label, info, examples",
            lang: "python",
            before: `
**Upgrade từ default shorthand sang component object.** Khi muốn control fine — labels, placeholder, example inputs, custom height — phải tạo \`gr.Textbox()\` explicit.
`,
            code: `# Component customized
message_input = gr.Textbox(
    label="Your message:",
    info="Enter a message for GPT-4.1-mini",
    lines=7
)
message_output = gr.Textbox(label="Response:", lines=8)

view = gr.Interface(
    fn=message_gpt,                           # đổi từ shout → message_gpt
    title="GPT",
    inputs=[message_input],
    outputs=[message_output],
    examples=["hello", "howdy"],              # ví dụ click-to-fill
    flagging_mode="never"
)
view.launch()`,
            after: `
**Cải thiện UX:**
- **Label** rõ ràng cho mỗi field
- **Info** = subtitle dưới label, giải thích thêm
- **Lines=7** = textarea cao hơn, để gõ multi-line dễ
- **Examples** = button click-to-fill, user không phải tự nghĩ input

**Pattern thực tế:** đầu tư UI polish (label, example, info) đáng kể giúp non-technical user dùng. 5 phút thêm label = 10 lần ít support hơn.

**Lưu ý:** vẫn cùng pattern \`gr.Interface(fn=...)\` — chỉ là input/output từ string shorthand → component object.
`
        },
        {
            title: "Bước 5 — Output markdown: render đẹp hơn",
            lang: "python",
            before: `
**LLM thường output Markdown.** Mặc định Gradio Textbox không render Markdown — hiển thị raw text với \`**\`, \`#\`. Đổi output sang \`gr.Markdown()\` → render đúng.

**Trick:** \`system_message\` là global → ảnh hưởng \`message_gpt\` đã định nghĩa ở Bước 1. Đổi system → đổi behavior mà không sửa function.
`,
            code: `# Đổi system message - global variable!
system_message = "You are a helpful assistant that responds in markdown without code blocks"

message_input = gr.Textbox(label="Your message:", info="Enter a message for GPT-4.1-mini", lines=7)
message_output = gr.Markdown(label="Response:")   # ← Markdown thay Textbox

view = gr.Interface(
    fn=message_gpt,
    title="GPT",
    inputs=[message_input],
    outputs=[message_output],
    examples=[
        "Explain the Transformer architecture to a layperson",
        "Explain the Transformer architecture to an aspiring AI engineer",
    ],
    flagging_mode="never"
)
view.launch()`,
            after: `
**Quan sát:** cùng prompt "Explain Transformer", output có cấu trúc đẹp — heading, bold, list, code blocks. Render đúng Markdown thay vì raw text.

**Anti-pattern global variable:** code trên dùng \`system_message\` là global → khó test, dễ confuse. OK cho Jupyter R&D, không OK cho production code. Tốt hơn:

\`\`\`python
def message_gpt(prompt, system_message="You are helpful"):
    messages = [...]
    ...
\`\`\`

Function pure, dễ test. Tuy nhiên Edward cố ý dùng global để minh họa **iterative development trong notebook** — không cần re-define function khi đổi prompt.
`
        },
        {
            title: "Bước 6 — Streaming với Python generator (yield)",
            lang: "python",
            before: `
**Cốt lõi của streaming UI trong Gradio.** Thay \`return\` bằng \`yield\` → function trở thành **generator**. Mỗi \`yield\` Gradio nhận một "snapshot" và cập nhật UI.

Kết hợp với \`stream=True\` của OpenAI → typewriter effect.
`,
            code: `# Function trả về generator (yield thay vì return)
def stream_gpt(prompt):
    messages = [
        {"role": "system", "content": system_message},
        {"role": "user", "content": prompt}
    ]
    stream = openai.chat.completions.create(
        model='gpt-4.1-mini',
        messages=messages,
        stream=True                    # ← OpenAI streaming
    )
    result = ""
    for chunk in stream:
        result += chunk.choices[0].delta.content or ""
        yield result                   # ← yield, không return

# UI giống Bước 5, chỉ đổi fn=stream_gpt
view = gr.Interface(
    fn=stream_gpt,
    title="GPT",
    inputs=[gr.Textbox(label="Your message:", lines=7)],
    outputs=[gr.Markdown(label="Response:")],
    flagging_mode="never"
)
view.launch()`,
            after: `
**Magic xảy ra ở \`yield result\`:**

- Function được Python decode là **generator** vì có \`yield\`
- Gradio detect signature → handle stream mode tự động
- Mỗi lần generator \`yield\` → Gradio cập nhật UI component output

**Pattern accumulate:**
\`\`\`
chunk 1: "Trans"      → yield "Trans"
chunk 2: "form"       → yield "Transform"
chunk 3: "ers are"    → yield "Transformers are"
...
\`\`\`

Mỗi yield là full text từ đầu — không phải chỉ delta. Vì Gradio replace content output mỗi lần, không append.

**\`or ""\`:** \`delta.content\` có thể là \`None\` ở chunk đầu (chỉ metadata) hay chunk cuối (báo finish). \`None\` + string → TypeError. \`or ""\` thay None bằng empty string.

**Một thay đổi nhỏ (\`return\` → \`yield\`) → UX khác hẳn.** Đây là chỗ Python language design gặp web UX đẹp nhất.
`
        },
        {
            title: "Bước 7 — Multi-input UI: Brochure Generator",
            lang: "python",
            before: `
**Combine mọi thứ Day 5 Tuần 1.** Brochure Generator giờ có UI: nhập tên công ty + URL + model selector → stream output.

Gradio nhận **nhiều input** dễ — chỉ pass list \`inputs=[...]\`. Function arguments match positional theo order.
`,
            code: `from scraper import fetch_website_contents

system_message = """
You are an assistant that analyzes the contents of a company website landing page
and creates a short brochure about the company for prospective customers, investors and recruits.
Respond in markdown without code blocks.
"""

def stream_claude(prompt):
    # Tương tự stream_gpt nhưng dùng Anthropic
    stream = anthropic.chat.completions.create(
        model='claude-sonnet-4-5-20250929',
        messages=[
            {"role": "system", "content": system_message},
            {"role": "user", "content": prompt}
        ],
        stream=True
    )
    result = ""
    for chunk in stream:
        result += chunk.choices[0].delta.content or ""
        yield result

def stream_brochure(company_name, url, model):
    yield ""
    prompt = f"Please generate a company brochure for {company_name}. Here is their landing page:\\n"
    prompt += fetch_website_contents(url)
    if model == "GPT":
        result = stream_gpt(prompt)
    elif model == "Claude":
        result = stream_claude(prompt)
    else:
        raise ValueError("Unknown model")
    yield from result          # ← delegate generator

# UI với 3 input
view = gr.Interface(
    fn=stream_brochure,
    title="Brochure Generator",
    inputs=[
        gr.Textbox(label="Company name:"),
        gr.Textbox(label="Landing page URL including http:// or https://"),
        gr.Dropdown(["GPT", "Claude"], label="Select model", value="GPT"),
    ],
    outputs=[gr.Markdown(label="Response:")],
    examples=[
        ["Hugging Face", "https://huggingface.co", "GPT"],
        ["Edward Donner", "https://edwarddonner.com", "Claude"]
    ],
    flagging_mode="never"
)
view.launch()`,
            after: `
**Mổ xẻ pattern:**

- **3 input** trong list → function signature 3 params: \`stream_brochure(company_name, url, model)\`. Gradio match positional.
- **gr.Dropdown** với options + default value → model selector
- **Examples là list of lists** — mỗi inner list tương ứng 1 dòng (1 input mỗi field)
- **\`yield from\`**: chain generator. \`stream_brochure\` không tự stream — nó forward stream từ \`stream_gpt\` hoặc \`stream_claude\`

**Yield \`""\` đầu**: clear output cũ khi user click "Submit" lần 2 — tránh thấy brochure cũ vài giây trước khi text mới chảy ra.

**Pattern này = MVP có thể demo cho khách hàng:**
- Web UI ✓
- Multi-input ✓
- Multiple model option ✓
- Streaming UX ✓
- Examples để onboard ✓

Tất cả ~30 dòng code. Đây là điểm bán hàng lớn nhất của Gradio cho prototype phase.
`
        }
    ]
});
