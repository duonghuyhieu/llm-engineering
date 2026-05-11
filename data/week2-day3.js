window.LESSONS = window.LESSONS || [];
window.LESSONS.push({
    week: 2,
    day: 3,
    title: "Chatbot · gr.ChatInterface · One-shot prompting · Dynamic system message",
    notebooks: ["week2/day3.ipynb"],
    topics: [
        "gr.ChatInterface — abstraction cho chatbot (history auto-managed)",
        "Callback function với 2 params: message + history",
        "Convert Gradio history format → OpenAI messages format",
        "One-shot prompting trong system message",
        "Dynamic system message: inject context theo từng message",
        "Streaming chatbot với yield"
    ],
    summary: `
## 1. Chatbot kiến trúc tối thiểu

Chatbot không phức tạp như tưởng. Bộ khung chỉ có 3 phần:

\`\`\`
1. system_prompt           (cố định, định nghĩa nhân vật)
2. history                 (list user/assistant alternating)
3. LLM call                (stateless, gửi system + history mỗi lần)
\`\`\`

Mọi 'tính năng' khác (memory dài hạn, personalization, retrieval) là *phần thêm vào* để vượt qua hạn chế của skeleton này.

## 2. gr.ChatInterface — Gradio cho chatbot

\`gr.Interface\` (Day 2) cho function generic. \`gr.ChatInterface\` chuyên cho chatbot:
- UI tự có chat bubbles (user phải, assistant trái)
- History tự lưu giữ, render
- Bạn chỉ cần viết function \`chat(message, history)\`

**Signature bắt buộc:**
- \`message\` (str): user vừa gõ
- \`history\` (list): các lượt trước

**Return:** reply (str hoặc generator nếu stream).

## 3. System prompt là spec sản phẩm

System prompt KHÔNG chỉ là "giới thiệu vai trò". Trong sản phẩm thật, nó chứa nhiều layer:

| Layer | Ví dụ |
|---|---|
| Persona | "You are FlightAI, courteous airline assistant" |
| Capabilities | "You can look up prices, check seat availability" |
| Constraints | "Never quote prices not from our database" |
| Tone | "Reply in 1 sentence, professional but warm" |
| Format | "Always end with: 'Anything else?'" |
| Fallback | "If unsure, say 'I don't have that information'" |
| Safety | "Never provide medical/legal advice" |

System prompt thường 1–3K token trong sản phẩm production. Đây là **tài sản trí tuệ** — viết tốt = sản phẩm tốt.
`,
    callouts: [
        {
            type: "info",
            text: "**Mental model cho system prompt:** Coi như 'training một intern trong 5 phút'. Intern này (1) đọc xong là làm việc ngay, (2) không nhớ gì sau khi nghỉ việc. Brief càng rõ, càng có ví dụ, kết quả càng tốt."
        },
        {
            type: "warn",
            text: "**Đừng dùng f-string thẳng vào prompt với user input.** \`prompt = f\"User said: {user_input}\"\` mở cửa cho prompt injection. Validate hoặc tách rõ \`user_query\` trong prompt template."
        }
    ],
    keyPoints: [
        "**Chatbot = 90% prompt, 10% code.** Sản phẩm tốt khác sản phẩm tệ chủ yếu ở chất lượng system prompt.",
        "**\`gr.ChatInterface\` auto-manage history.** Bạn không cần code state — chỉ implement callback. UI tự append, tự scroll, tự render bubble.",
        "**Gradio history format ≠ OpenAI messages format.** Phải convert: dict với \`role\` và \`content\` (cùng key, dễ).",
        "**One-shot trong system prompt giúp model bám format.** Pattern \`'For example, if user says X, you reply Y'\`.",
        "**Dynamic system message** = thay đổi system dựa trên message hiện tại. Hữu ích khi cần inject context khác nhau theo intent.",
        "**Streaming chat = yield mỗi chunk.** Pattern y hệt Day 2."
    ],
    code: [
        {
            title: "Bước 1 — Setup + callback đơn giản nhất",
            lang: "python",
            before: `
**Hello world của chatbot.** Trước khi connect với LLM, làm cho UI chạy với function dummy.

\`gr.ChatInterface\` cần callback signature \`fn(message, history)\` — Gradio sẽ gọi mỗi lần user gõ message.
`,
            code: `import os
from dotenv import load_dotenv
from openai import OpenAI
import gradio as gr

load_dotenv(override=True)
openai = OpenAI()
MODEL = 'gpt-4.1-mini'

# Callback đơn giản nhất - bỏ qua message và history
def chat(message, history):
    return "bananas"

gr.ChatInterface(fn=chat, type="messages").launch()`,
            after: `
**Output:** UI chatbot mở ra. Mọi message user gõ → assistant trả "bananas".

**Mục đích của step ngớ ngẩn này:**
- Verify UI hoạt động trước khi thêm LLM
- Hiểu signature callback Gradio expect
- Tách concern: UI work trước, logic LLM sau

**\`type="messages"\`**: Gradio có 2 history format:
- \`type="tuples"\` (cũ): \`[(user_msg, bot_reply), ...]\`
- \`type="messages"\` (mới, recommended): \`[{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]\`

Dùng \`"messages"\` vì format y hệt OpenAI → không cần convert nhiều.
`
        },
        {
            title: "Bước 2 — Inspect message + history để hiểu Gradio truyền gì",
            lang: "python",
            before: `
**Debug: xem Gradio truyền gì vào callback.** Return text chứa cả 2 param để in lên UI.
`,
            code: `def chat(message, history):
    return f"You said {message} and the history is {history} but I still say bananas"

gr.ChatInterface(fn=chat, type="messages").launch()`,
            after: `
**Output sau vài turn:**

\`\`\`
User: "Hello"
Bot: "You said Hello and the history is [] but I still say bananas"

User: "How are you?"
Bot: "You said How are you? and the history is
      [{'role': 'user', 'content': 'Hello', 'metadata': None, 'options': None},
       {'role': 'assistant', 'content': 'You said Hello and the history is [] but...'}]
      but I still say bananas"
\`\`\`

**Quan sát:**
- \`message\`: string text user vừa gõ
- \`history\`: list dict alternating user/assistant. **KHÔNG bao gồm** message hiện tại — chỉ các lượt trước
- Gradio thêm vài field bonus (\`metadata\`, \`options\`) — bỏ qua, chỉ cần \`role\` và \`content\`

**Insight quan trọng:** mỗi turn, Gradio truyền nguyên history cho callback. Bạn (developer) không cần lưu state — Gradio đã làm. Việc của bạn: nhận data, gọi LLM, trả reply.
`
        },
        {
            title: "Bước 3 — Chatbot thật: gọi OpenAI với history",
            lang: "python",
            before: `
**Connect LLM.** Convert Gradio history sang OpenAI messages format → gọi API → return reply.

**Convert đơn giản:** Gradio dùng \`type="messages"\` → format đã gần OpenAI. Chỉ cần strip các field thừa (\`metadata\`, \`options\`).
`,
            code: `system_message = "You are a helpful assistant"

def chat(message, history):
    # 1. Strip Gradio extras, giữ role+content
    history = [{"role": h["role"], "content": h["content"]} for h in history]

    # 2. Build messages = system + history + new user message
    messages = (
        [{"role": "system", "content": system_message}]
        + history
        + [{"role": "user", "content": message}]
    )

    # 3. Stateless LLM call - gửi nguyên context
    response = openai.chat.completions.create(model=MODEL, messages=messages)

    # 4. Return reply text - Gradio tự append vào history
    return response.choices[0].message.content

gr.ChatInterface(fn=chat, type="messages").launch()`,
            after: `
**Đây là toàn bộ một chatbot.** ~5 dòng logic. Cảm thấy đơn giản? Đúng — vì khó nhằn nhất (UI, state management) đã được Gradio handle.

**Flow của 1 turn:**

\`\`\`
User gõ "Hello" → Gradio gọi chat("Hello", [])
                ↓
chat() build messages = [system, user("Hello")]
                ↓
OpenAI trả "Hi! How can I help?"
                ↓
chat() return "Hi! How can I help?"
                ↓
Gradio append vào UI và history

---

User gõ "Tell me a joke" → Gradio gọi chat("Tell me a joke",
    [{"role":"user","content":"Hello"}, {"role":"assistant","content":"Hi! How can I help?"}])
                ↓
chat() build messages = [system, user("Hello"), assistant("Hi!..."), user("Tell me a joke")]
                ↓
OpenAI có context, trả joke phù hợp
                ↓
Gradio render
\`\`\`

**Mọi turn, full history được pass.** Đây là **illusion of memory** Day 4 Tuần 1 đã giải thích. LLM stateless, Gradio + bạn cùng tạo illusion.
`
        },
        {
            title: "Bước 4 — Upgrade: streaming chatbot với yield",
            lang: "python",
            before: `
**Đổi return → yield**. Y hệt Day 2 Tuần 2 với \`stream_gpt\`. Gradio detect generator → stream UI tự động.
`,
            code: `def chat(message, history):
    history = [{"role": h["role"], "content": h["content"]} for h in history]
    messages = (
        [{"role": "system", "content": system_message}]
        + history
        + [{"role": "user", "content": message}]
    )
    stream = openai.chat.completions.create(model=MODEL, messages=messages, stream=True)

    response = ""
    for chunk in stream:
        response += chunk.choices[0].delta.content or ''
        yield response

gr.ChatInterface(fn=chat, type="messages").launch()`,
            after: `
**UX khác hẳn:**
- Trước: gõ "Tell me a joke" → màn hình trống ~3s → joke xuất hiện
- Sau: gõ → text chảy ra ngay → user thấy bot đang "type"

**Đây là experience chuẩn của ChatGPT.** Implement chỉ thay \`return\` → \`yield\` và thêm \`stream=True\`.

**Lưu ý sub-feature:** Gradio mới hỗ trợ "thinking" hint khi yield empty string đầu tiên — hiện 3 dấu chấm "..." báo bot đang process. Có thể \`yield ""\` đầu mỗi turn để UX mượt hơn.
`
        },
        {
            title: "Bước 5 — One-shot prompting: dạy bot bằng ví dụ",
            lang: "python",
            before: `
**Case study:** chatbot bán hàng thời trang. Cần bot:
1. Khuyến khích user thử items đang sale
2. Sale: hats 60% off, most items 50% off
3. Tone gentle, không aggressive

**Cách dạy không cần fine-tune:** đưa ví dụ trong system message → model bắt chước style.
`,
            code: `system_message = "You are a helpful assistant in a clothes store. You should try to gently encourage \\
the customer to try items that are on sale. Hats are 60% off, and most other items are 50% off. \\
For example, if the customer says 'I'm looking to buy a hat', \\
you could reply something like, 'Wonderful - we have lots of hats - including several that are part of our sales event.'\\
Encourage the customer to buy hats if they are unsure what to get."

gr.ChatInterface(fn=chat, type="messages").launch()`,
            after: `
**Mổ xẻ system prompt:**

1. **Persona:** "helpful assistant in a clothes store" → tone
2. **Goal:** "gently encourage... sale" → behavior
3. **Facts:** "hats 60% off, most items 50% off" → knowledge
4. **One-shot example:** "if customer says X, you could reply something like Y" → pattern
5. **Fallback rule:** "if unsure what to get → encourage hats"

**Tại sao one-shot work?**

LLM được train trên cực nhiều text "user said X, agent replied Y" (chat logs, customer service transcripts). Khi bạn cho 1 ví dụ trong system, model dễ pattern-match: "à, mode 'sales agent' → reply giống ví dụ".

**Test thử:**

\`\`\`
User: "I want a coat"
Bot: "Great choice! Coats are part of our 50% off sale. While you're shopping, did you also consider a hat? We have a wonderful selection at 60% off."
\`\`\`

Bot tự động cross-sell — chính xác như spec.
`
        },
        {
            title: "Bước 6 — Append rule mới: shoes không sale",
            lang: "python",
            before: `
**Iterative prompt development.** Trong Jupyter, có thể \`system_message += ...\` append rule mới mà không sửa function chat. Pattern này thực dụng cho R&D.
`,
            code: `system_message += "\\nIf the customer asks for shoes, you should respond that shoes are not on sale today, \\
but remind the customer to look at hats!"

# Chạy lại UI - chat function dùng system_message global, tự pick up bản mới
gr.ChatInterface(fn=chat, type="messages").launch()`,
            after: `
**Test:**

\`\`\`
User: "Do you have shoes?"
Bot: "Yes, we have a great selection of shoes! Unfortunately, shoes aren't part of our current sale.
However, we do have hats at 60% off — they make great gifts!"
\`\`\`

**Bot bám đúng rule mới.** Quan trọng: model handle nuance — "shoes not on sale" nhưng "kích thích thử hat" trong cùng reply, smooth.

**Iterative pattern trong R&D:**

\`\`\`python
system_message = "base prompt..."
# Test → thấy bot không handle case X
system_message += "\\nIf X, do Y..."
# Test → thấy missing case Z
system_message += "\\nWhen Z, respond with W..."
# ... lặp
\`\`\`

Production: tạm OK để collect rules, sau đó refactor thành structured prompt (sections, clear hierarchy) khi prompt > 1K token.
`
        },
        {
            title: "Bước 7 — Dynamic system message: thay đổi theo intent",
            lang: "python",
            before: `
**Cao cấp hơn:** không phải mọi rule cần ở mỗi turn. Vd rule về "belts" chỉ liên quan khi user mention belts. Inject context có điều kiện → giảm noise system prompt.

**Pattern:** detect keyword trong message → append context tạm thời chỉ cho turn này.
`,
            code: `def chat(message, history):
    history = [{"role": h["role"], "content": h["content"]} for h in history]

    # Inject context có điều kiện
    relevant_system_message = system_message
    if 'belt' in message.lower():
        relevant_system_message += " The store does not sell belts; if you are asked for belts, \\
be sure to point out other items on sale."

    messages = (
        [{"role": "system", "content": relevant_system_message}]
        + history
        + [{"role": "user", "content": message}]
    )

    stream = openai.chat.completions.create(model=MODEL, messages=messages, stream=True)
    response = ""
    for chunk in stream:
        response += chunk.choices[0].delta.content or ''
        yield response

gr.ChatInterface(fn=chat, type="messages").launch()`,
            after: `
**Test:**

\`\`\`
User: "Do you have belts?"
Bot: "I'm sorry, we don't carry belts at this time. But we have a wonderful selection of hats at 60% off — they're a great accessory choice!"
\`\`\`

**Tại sao đây là pattern quan trọng:**

System prompt static sẽ phải nhồi mọi rule edge case ngay từ đầu → vài KB token mỗi request. Dynamic injection chỉ add context khi cần → tiết kiệm token, model focus.

**Generalize pattern (RAG sneak peek):**

\`\`\`python
def chat(message, history):
    # 1. Detect intent / topic của message
    relevant_docs = retrieve_relevant_context(message)

    # 2. Inject relevant context vào system message
    enhanced_system = base_system + "\\n\\nRelevant info:\\n" + format(relevant_docs)

    # 3. Gọi LLM với enhanced system
    ...
\`\`\`

Đây chính là **RAG cốt lõi** — retrieval (tìm docs) + augmentation (vào prompt) + generation (gọi LLM). Tuần 5 sẽ học sâu, dùng vector embedding thay vì keyword match.
`
        }
    ]
});
