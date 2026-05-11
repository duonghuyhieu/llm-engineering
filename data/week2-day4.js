window.LESSONS = window.LESSONS || [];
window.LESSONS.push({
    week: 2,
    day: 4,
    title: "Tool Calling · Function Calling · Airline AI Assistant · Agentic loop",
    notebooks: ["week2/day4.ipynb"],
    topics: [
        "Tool calling — bản chất là gì (LLM KHÔNG chạy code)",
        "Tool schema = JSON Schema làm hợp đồng giữa LLM và developer",
        "Protocol 4 bước của một full tool-calling round-trip",
        "Multiple tool calls trong cùng một response",
        "Sequential calls — agentic loop until-no-tool-calls",
        "Replace dict với SQLite database làm 'data source'"
    ],
    summary: `
## 1. Tool calling — bản chất

Một hiểu nhầm phổ biến: "LLM gọi function của tôi". **SAI**. LLM không bao giờ chạy code của bạn. Cơ chế thực tế:

1. Bạn mô tả function bằng JSON Schema
2. LLM, khi cần dùng function, **trả về một message đặc biệt** chứa tên function và arguments
3. **Code của bạn** parse message, chạy function thật, lấy kết quả
4. Bạn gửi kết quả lại cho LLM dưới dạng tool message
5. LLM đọc kết quả, sinh reply cuối cho user

LLM chỉ là *bộ não quyết định*. Code của bạn là *cánh tay* thực thi. **Không có magic.**

## 2. Tool schema — hợp đồng

Schema phải đủ rõ để LLM biết *khi nào* và *với arguments gì* nên gọi function:

\`\`\`json
{
    "type": "function",
    "function": {
        "name": "get_ticket_price",
        "description": "Get the price of a return ticket to the destination city.",
        "parameters": {
            "type": "object",
            "properties": {
                "destination_city": {
                    "type": "string",
                    "description": "The city the customer wants to travel to"
                }
            },
            "required": ["destination_city"],
            "additionalProperties": false
        }
    }
}
\`\`\`

Quy tắc viết schema tốt:
- \`description\` rõ ràng — như docstring cho LLM
- \`required\` — chỉ liệt kê param thực sự bắt buộc
- Đặt tên function rõ — \`get_ticket_price\` tốt hơn \`gtp\`

## 3. Protocol 4 bước

\`\`\`
Step 1: User → LLM (với tools)
  Response: finish_reason="tool_calls" + tool_calls list

Step 2: Code chạy tool, build tool message với tool_call_id khớp

Step 3: Append cả 2 message (LLM's tool_call + your tool result) vào messages

Step 4: Gọi LLM lần 2 với context đã update → final reply
\`\`\`

Cấu trúc messages sau full round-trip:
- system
- user
- assistant (with tool_calls)
- tool (result)
- assistant (final reply)
`,
    callouts: [
        {
            type: "info",
            text: "**Mental model cho tool calling:** Coi LLM như sếp, code của bạn là nhân viên. Sếp ra quyết định 'gọi nhà cung cấp hỏi giá', nhân viên thực hiện cuộc gọi và báo lại. Sếp không cầm điện thoại trực tiếp."
        },
        {
            type: "warn",
            text: "**Tool calling = attack surface.** Nếu LLM bị prompt injection và bạn cho nó tools nguy hiểm (delete_record, send_email), kẻ tấn công có thể abuse qua user message. Áp dụng principle of least privilege — chỉ expose tools thực sự cần."
        }
    ],
    keyPoints: [
        "**LLM KHÔNG chạy code.** LLM chỉ trả về *yêu cầu chạy*. Code của bạn quyết định có chạy hay không. Đây là lớp bảo mật quan trọng.",
        "**Tool description = 'API doc' cho LLM.** Viết tệ → LLM không gọi (hoặc gọi sai). Viết tốt như docstring cho intern mới.",
        "**\`tool_call_id\` BẮT BUỘC khớp.** Khi gửi tool result về, phải có cùng id với tool_call gốc. Dùng để LLM map result với call (quan trọng khi parallel calls).",
        "**Đừng quên append tool_call message.** Sau khi LLM trả tool_calls, phải append cả message gốc (không chỉ tool result). Thiếu → LLM lần sau confused.",
        "**Sequential vs Parallel calls:** parallel = LLM gọi N tool trong cùng response. Sequential = LLM gọi tool A, đọc kết quả, quyết định gọi tool B. Cần \`while\` loop.",
        "**Set timeout/safeguard cho agentic loop.** Đề phòng infinite loop. \`max_iterations=10\` là minimum. Log mỗi tool call để audit."
    ],
    code: [
        {
            title: "Bước 1 — Chatbot baseline (chưa có tool)",
            lang: "python",
            before: `
**Project: Airline AI Assistant cho hãng FlightAI.** Bắt đầu với chatbot baseline tone công ty — system message ngắn, response 1 câu.

Tới đây Day 3 đã đủ. Tool calling sẽ thêm ở Bước 3.
`,
            code: `import os
import json
from dotenv import load_dotenv
from openai import OpenAI
import gradio as gr

load_dotenv(override=True)
MODEL = "gpt-4.1-mini"
openai = OpenAI()

system_message = """
You are a helpful assistant for an Airline called FlightAI.
Give short, courteous answers, no more than 1 sentence.
Always be accurate. If you don't know the answer, say so.
"""

def chat(message, history):
    history = [{"role": h["role"], "content": h["content"]} for h in history]
    messages = [{"role": "system", "content": system_message}] + history + [{"role": "user", "content": message}]
    response = openai.chat.completions.create(model=MODEL, messages=messages)
    return response.choices[0].message.content

gr.ChatInterface(fn=chat, type="messages").launch()`,
            after: `
**Test:**

\`\`\`
User: "What's the price of a ticket to London?"
Bot: "I'm sorry, I don't have access to real-time pricing information for tickets to London."
\`\`\`

**Bot trung thực — không biết giá thì nói không biết.** Đây là behavior từ system message ("If you don't know the answer, say so").

**Vấn đề:** chatbot này khá vô dụng cho khách hàng — câu hỏi phổ biến nhất (giá vé) không trả lời được.

**2 cách fix:**
1. Nhồi giá vé tất cả tuyến vào system prompt → tốn token, không scale
2. **Cho bot gọi function lookup giá** — đây là tool calling

Bước 2 setup function thực sự để lookup giá.
`
        },
        {
            title: "Bước 2 — Function thật để LLM 'gọi'",
            lang: "python",
            before: `
**Function thường, không có gì đặc biệt.** Lookup giá từ dict hardcoded (sau sẽ replace bằng SQLite). Pattern y hệt function bình thường — không cần decorator/wrapper magic.
`,
            code: `# Dữ liệu giá
ticket_prices = {
    "london": "$799",
    "paris": "$899",
    "tokyo": "$1400",
    "berlin": "$499"
}

def get_ticket_price(destination_city):
    print(f"Tool called for city {destination_city}")
    price = ticket_prices.get(destination_city.lower(), "Unknown ticket price")
    return f"The price of a ticket to {destination_city} is {price}"

# Test bình thường
get_ticket_price("London")
# Output: 'The price of a ticket to London is $799'`,
            after: `
**Quan sát:**
- Function plain Python — case-insensitive lookup, fallback "Unknown"
- \`print()\` ở đầu — debug aid để xem khi nào LLM thực sự "gọi" function
- Return string, không phải dict — format thân thiện cho LLM consume

**Pattern thực tế:** function tool nên:
- ✅ **Idempotent** khi possible — gọi nhiều lần cùng arg trả cùng kết quả
- ✅ **Fast** — LLM call đã chậm rồi, đừng làm tool chậm thêm
- ✅ **Handle edge case** — input không hợp lệ, network fail → trả error message text (đừng raise exception, LLM sẽ confuse)
- ✅ **Output có format dễ đọc** — string > dict cho LLM consume

Function này chưa connect với LLM. Bước 3 sẽ "expose" qua schema.
`
        },
        {
            title: "Bước 3 — JSON Schema mô tả function cho LLM",
            lang: "python",
            before: `
**Schema = API doc cho LLM.** LLM không thấy code Python — chỉ thấy schema. Schema phải tự document đủ để LLM:
- Biết function này làm gì
- Biết khi nào nên gọi
- Biết argument format

OpenAI dùng **JSON Schema** standard. Cấu trúc fixed: \`type: "function"\` ở ngoài, \`function: {name, description, parameters}\` bên trong.
`,
            code: `# Dictionary structure mô tả function
price_function = {
    "name": "get_ticket_price",
    "description": "Get the price of a return ticket to the destination city. Call this whenever you need to know the ticket price, for example when a customer asks 'How much is a ticket to this city'",
    "parameters": {
        "type": "object",
        "properties": {
            "destination_city": {
                "type": "string",
                "description": "The city that the customer wants to travel to",
            },
        },
        "required": ["destination_city"],
        "additionalProperties": False
    }
}

# List of tools (có thể chứa nhiều function)
tools = [{"type": "function", "function": price_function}]`,
            after: `
**Mổ xẻ từng phần:**

- \`name: "get_ticket_price"\` — **PHẢI** khớp tên Python function (sau này dùng để dispatch)
- \`description: "...Call this whenever..."\` — **quan trọng nhất**. Đây là cách LLM biết *khi nào* gọi. Include trigger phrase: "when a customer asks 'How much is a ticket to this city'" — giúp LLM nhận diện intent.
- \`parameters\`:
  - \`type: "object"\` — params dạng dict
  - \`properties: { destination_city: {...} }\` — mỗi field có type + description
  - \`required: ["destination_city"]\` — field bắt buộc
  - \`additionalProperties: False\` — strict, không cho extra fields

**\`tools = [{...}]\`** là list — có thể expose nhiều function cùng lúc. Bài này chỉ có 1.

**Schema KHÔNG include implementation.** LLM chỉ thấy "đây là function, nó nhận destination_city, làm việc X". Implementation hoàn toàn ở Python code phía bạn.
`
        },
        {
            title: "Bước 4 — Chat function với tool calling",
            lang: "python",
            before: `
**Tích hợp tool vào chatbot.** Khác baseline:
- Truyền \`tools=tools\` vào API call
- Check \`finish_reason="tool_calls"\` để biết LLM yêu cầu gọi tool
- Nếu có → run tool, gửi result lại, gọi API lần 2
`,
            code: `def chat(message, history):
    history = [{"role": h["role"], "content": h["content"]} for h in history]
    messages = [{"role": "system", "content": system_message}] + history + [{"role": "user", "content": message}]

    # Lần 1: gọi với tools
    response = openai.chat.completions.create(model=MODEL, messages=messages, tools=tools)
    print("Model response:", response.choices[0])

    # Check LLM có yêu cầu gọi tool không
    if response.choices[0].finish_reason == "tool_calls":
        message = response.choices[0].message
        print(f"Model called tool {message.tool_calls[0].function.name} with arguments {message.tool_calls[0].function.arguments}")

        # Chạy tool và build tool result message
        response = handle_tool_call(message)
        print(f"Tool response: {response}")

        # Append cả 2: tool_call message + tool result
        messages.append(message)
        messages.append(response)

        # Lần 2: gọi LLM với tool result → final reply
        response = openai.chat.completions.create(model=MODEL, messages=messages)

    return response.choices[0].message.content`,
            after: `
**Đọc kỹ flow:**

1. **API call lần 1** với \`tools=tools\`. LLM có 2 lựa chọn:
   - Trả lời thẳng (không cần tool) → \`finish_reason="stop"\`
   - Yêu cầu gọi tool → \`finish_reason="tool_calls"\` + \`message.tool_calls\` list

2. **Nếu tool_calls** → run function, build "tool result" message (Bước 5 sẽ làm), append cả 2:
   - \`message\` (assistant's request to call tool)
   - \`response\` (tool result)

3. **API call lần 2** không cần tools param nữa — LLM giờ có tool result trong context, sẽ tổng hợp thành reply cho user

**Quan trọng:** **PHẢI append cả message gốc**, không chỉ tool result. Nếu thiếu \`messages.append(message)\` → API call lần 2 thấy tool result mà không có tool_call gốc → error \`messages with role 'tool' must be a response to a preceeding message with 'tool_calls'\`.

\`print()\` statements để debug — quan trọng khi develop tool calling. Tắt khi production.
`
        },
        {
            title: "Bước 5 — Handle tool call: run function + build result message",
            lang: "python",
            before: `
**Bridge giữa LLM request và Python function.** LLM gửi tool call dưới dạng JSON string trong \`function.arguments\`. Phải:
1. Parse JSON
2. Extract args
3. Call function
4. Build "tool result" message với \`tool_call_id\` khớp
`,
            code: `def handle_tool_call(message):
    tool_call = message.tool_calls[0]    # lấy tool call đầu

    if tool_call.function.name == "get_ticket_price":
        arguments = json.loads(tool_call.function.arguments)   # parse JSON string
        city = arguments.get('destination_city')
        price_details = get_ticket_price(city)                  # CALL function thật

        # Build "tool result" message
        response = {
            "role": "tool",
            "content": price_details,
            "tool_call_id": tool_call.id    # PHẢI khớp với call id
        }
    return response`,
            after: `
**Mổ xẻ tool result message:**

- \`"role": "tool"\` — role mới chỉ dùng cho tool result (khác system/user/assistant)
- \`"content"\` — string kết quả từ function. LLM sẽ đọc cái này
- \`"tool_call_id"\` — id từ \`tool_call.id\`. **Đây là cách LLM biết result thuộc về call nào** (quan trọng khi LLM gọi nhiều tool parallel)

**Pitfall:** \`tool_call.function.arguments\` là **string JSON**, không phải dict. Phải \`json.loads()\` parse trước khi dùng. Quên → \`AttributeError\` khi access \`arguments.get(...)\`.

**Dispatch pattern:** code trên chỉ handle 1 function \`get_ticket_price\`. Khi có nhiều tool:

\`\`\`python
TOOL_DISPATCH = {
    "get_ticket_price": get_ticket_price,
    "book_flight": book_flight,
    "cancel_booking": cancel_booking,
}

def handle_tool_call(tool_call):
    fn = TOOL_DISPATCH[tool_call.function.name]
    args = json.loads(tool_call.function.arguments)
    result = fn(**args)
    return {"role": "tool", "content": str(result), "tool_call_id": tool_call.id}
\`\`\`

Pattern này scale tốt cho 10+ tools.
`
        },
        {
            title: "Bước 6 — Demo end-to-end: LLM tự gọi tool",
            lang: "python",
            before: `
**Chạy thử.** Mở UI và hỏi giá vé → LLM tự quyết định gọi tool, get_ticket_price chạy, in log, LLM tổng hợp reply.
`,
            code: `gr.ChatInterface(fn=chat, type="messages").launch()

# === Console log thực tế ===
# User: "Hello!"
# Model response: Choice(finish_reason='stop', message=...content='Hello! How can I assist...')
# (KHÔNG gọi tool — chỉ là greeting)

# User: "I want to fly to London"
# Model response: Choice(finish_reason='stop', message=...content='Would you like to know the price of a return ticket to London?')
# (LLM hỏi clarifying question trước)

# User: "Yes"
# Model response: Choice(finish_reason='tool_calls', message=...
#                  tool_calls=[ChatCompletionMessageFunctionToolCall(
#                    id='call_MRlw9...',
#                    function=Function(arguments='{"destination_city":"London"}', name='get_ticket_price'))])
# Model called tool get_ticket_price with arguments {"destination_city":"London"}
# Tool called for city London   ← từ print() trong get_ticket_price
# Tool response: {'role': 'tool', 'content': 'The price of a ticket to London is $799',
#                 'tool_call_id': 'call_MRlw9...'}
# (LLM call lần 2 với tool result)

# UI hiển thị: "The price of a return ticket to London is $799."`,
            after: `
**Quan sát behavior:**

1. **"Hello!" — không gọi tool.** LLM hiểu greeting không cần lookup giá. Đây là điểm mạnh: tool chỉ được gọi khi *cần thiết*.

2. **"I want to fly to London" — LLM hỏi clarifying trước.** Vì description tool nói "when customer asks 'How much is a ticket'", LLM hiểu "I want to fly" chưa phải request giá. Hỏi user xác nhận trước.

3. **"Yes" — LLM tự gọi tool.** Có context (London) và intent (giá vé) → trigger tool call.

4. **LLM tổng hợp reply tự nhiên:** không trả raw "{'role': 'tool', 'content': '...'}". Đọc tool result và viết lại tone phù hợp với system prompt ("short, courteous").

**Đây là agentic AI mức 1.** LLM quyết định *có cần tool không*, *gọi tool nào*, *với arguments gì*, *tổng hợp result thành reply*. Tất cả tự động.
`
        },
        {
            title: "Bước 7 — Multiple tool calls + while loop (agentic loop)",
            lang: "python",
            before: `
**Cases edge:**

1. **Parallel calls:** user hỏi "Giá London và Paris?" → LLM gọi tool 2 lần cùng response. \`tool_calls\` là list nhiều phần tử.

2. **Sequential calls:** LLM gọi tool A, đọc kết quả, quyết định cần gọi tool B nữa. Cần loop.

Code dưới handle cả 2 cases bằng \`while finish_reason == "tool_calls"\`.
`,
            code: `def handle_tool_calls(message):
    """Handle multiple tool calls trong cùng 1 response (parallel)."""
    responses = []
    for tool_call in message.tool_calls:
        if tool_call.function.name == "get_ticket_price":
            arguments = json.loads(tool_call.function.arguments)
            city = arguments.get('destination_city')
            price_details = get_ticket_price(city)
            responses.append({
                "role": "tool",
                "content": price_details,
                "tool_call_id": tool_call.id
            })
    return responses

def chat(message, history):
    history = [{"role": h["role"], "content": h["content"]} for h in history]
    messages = [{"role": "system", "content": system_message}] + history + [{"role": "user", "content": message}]

    response = openai.chat.completions.create(model=MODEL, messages=messages, tools=tools)

    # ← while thay vì if → handle sequential calls
    while response.choices[0].finish_reason == "tool_calls":
        message = response.choices[0].message
        responses = handle_tool_calls(message)
        messages.append(message)
        messages.extend(responses)            # extend cho list (parallel)
        response = openai.chat.completions.create(model=MODEL, messages=messages, tools=tools)

    return response.choices[0].message.content`,
            after: `
**Đây là pattern AGENTIC LOOP — chuẩn cho mọi agent có tool.**

\`\`\`
while LLM yêu cầu tool:
    run tools (1 or many)
    append messages
    ask LLM again
\`\`\`

LLM tự quyết định khi nào dừng — khi nó cảm thấy đủ thông tin để reply user, nó trả \`finish_reason="stop"\` thay vì \`tool_calls\`.

**Trade-off với approach \`if\`:**

| | \`if\` (1 round) | \`while\` (loop) |
|---|---|---|
| Đơn giản | ✓ | |
| Handle parallel calls | (chỉ trong 1 round) | ✓ |
| Handle sequential calls | ✗ | ✓ |
| Risk infinite loop | ✗ | ✓ — cần safeguard |

**Safeguard production:**

\`\`\`python
max_iterations = 10
iter_count = 0
while response.choices[0].finish_reason == "tool_calls" and iter_count < max_iterations:
    ...
    iter_count += 1
\`\`\`

Tránh LLM bug stuck loop (vd gọi cùng tool mãi không quyết định stop).
`
        },
        {
            title: "Bước 8 — Upgrade: SQLite database thay dict hardcoded",
            lang: "python",
            before: `
**Production-ready data source.** Dict hardcoded không scale. Thay bằng SQLite — file-based DB, không cần server.

Function signature và behavior y hệt — chỉ thay implementation. **LLM không quan tâm** data từ đâu.
`,
            code: `import sqlite3

DB = "prices.db"

# Setup table (chạy 1 lần)
with sqlite3.connect(DB) as conn:
    cursor = conn.cursor()
    cursor.execute('CREATE TABLE IF NOT EXISTS prices (city TEXT PRIMARY KEY, price REAL)')
    conn.commit()

# Function get giờ query DB
def get_ticket_price(city):
    print(f"DATABASE TOOL CALLED: Getting price for {city}", flush=True)
    with sqlite3.connect(DB) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT price FROM prices WHERE city = ?', (city.lower(),))
        result = cursor.fetchone()
        return f"Ticket price to {city} is $\${result[0]}" if result else "No price data available for this city"

def set_ticket_price(city, price):
    with sqlite3.connect(DB) as conn:
        cursor = conn.cursor()
        cursor.execute(
            'INSERT INTO prices (city, price) VALUES (?, ?) ON CONFLICT(city) DO UPDATE SET price = ?',
            (city.lower(), price, price)
        )
        conn.commit()

# Seed dữ liệu
ticket_prices = {"london": 799, "paris": 899, "tokyo": 1420, "sydney": 2999}
for city, price in ticket_prices.items():
    set_ticket_price(city, price)

# UI giống cũ — không sửa schema, không sửa chat function
gr.ChatInterface(fn=chat, type="messages").launch()`,
            after: `
**Tại sao đây là big deal:**

1. **Function signature không đổi** → schema không đổi → LLM không cần biết
2. **Data có thể update real-time** — admin chạy \`set_ticket_price("London", 999)\` → next user query trả giá mới
3. **Scale tốt** — SQLite handle vài chục K record dễ, Postgres handle hàng triệu
4. **Decouple concerns** — LLM logic / tool logic / data layer tách biệt

**Production pattern:**

\`\`\`
LLM (decision making)
   ↓ (gọi tool qua schema)
Tool function (Python)
   ↓ (query)
Database / API / Cache
\`\`\`

Mỗi layer thay được độc lập. Đây là **good software architecture** áp dụng vào AI agent.

**Bài tập gợi ý** (cuối notebook): thêm tool \`set_ticket_price\` cho LLM call → bot có thể vừa lookup giá vừa update giá khi admin yêu cầu. Mở rộng schema, thêm vào \`TOOL_DISPATCH\` — pattern y hệt.
`
        }
    ]
});
