window.LESSONS = window.LESSONS || [];
window.LESSONS.push({
    week: 2,
    day: 5,
    title: "Multi-modal AI Assistant · DALL-E · TTS · gr.Blocks UI",
    notebooks: ["week2/day5.ipynb"],
    topics: [
        "Multi-modality — text + image + audio trong cùng app",
        "DALL-E 3: text-to-image qua OpenAI",
        "TTS (Text-to-Speech): chuyển reply thành giọng nói",
        "gr.Blocks: custom layout với row/column",
        "Hooking events trong Blocks: .submit().then() chain",
        "Integrate tool calling + image gen + TTS thành 1 product"
    ],
    summary: `
## 1. Day 5 — capstone của Tuần 2

Ráp tất cả Tuần 2 thành **1 sản phẩm hoàn chỉnh**: Airline Assistant với:
- ✅ Chatbot (Day 3)
- ✅ Tool calling lookup giá (Day 4)
- ✅ **NEW**: Tạo poster destination (DALL-E)
- ✅ **NEW**: Đọc reply bằng giọng nói (TTS)
- ✅ **NEW**: Multi-modal UI (gr.Blocks)

Đây là **agentic workflow đầy đủ** đầu tiên trong khóa — text input → text + image + audio output.

## 2. Multi-modality — 4 modality cốt lõi

| Modality | Input | Output | Models trong Day 5 |
|---|---|---|---|
| Text → Text | text | text | GPT-4.1-mini (chat) |
| Text → Image | text | image | DALL-E 3 |
| Text → Audio | text | audio | gpt-4o-mini-tts |

Tuần 3 sẽ thêm:
- Image → Text (vision)
- Audio → Text (Whisper STT)

## 3. 3 loại UI trong Gradio

| Loại | Vai trò | Khi nào dùng |
|---|---|---|
| \`gr.Interface\` | Standard simple UI | Function 1→1 (Day 2) |
| \`gr.ChatInterface\` | Chatbot UI | Conversational (Day 3, 4) |
| \`gr.Blocks\` | Custom layout | UI phức tạp với multi-component (Day 5) |

\`gr.Blocks\` là 'low-level' nhất — bạn control mọi component và event. \`Interface\` và \`ChatInterface\` là wrapper trên Blocks.
`,
    callouts: [
        {
            type: "info",
            text: "**Mental model cho multi-modal:** Coi mỗi modality là một 'kênh' (channel) input/output. App của bạn = orchestrator gọi đúng model cho đúng kênh, ghép output lại. Không phải 1 model làm tất cả."
        },
        {
            type: "warn",
            text: "**Image gen đắt hơn chat 10–100×.** DALL-E 3 standard ~$0.04/image. Nếu user spam 100 message → $4. Cache theo prompt, hoặc chỉ gen ảnh khi LLM 'quyết định' (qua tool calling) — không tự động mỗi turn."
        }
    ],
    keyPoints: [
        "**DALL-E 3 trả base64 hoặc URL.** \`response_format='b64_json'\` cho image trực tiếp, không phải tải URL.",
        "**Voice cloning có rủi ro pháp lý.** Một số quốc gia coi giọng nói là biometric. Có consent trước khi clone giọng người thật.",
        "**Streaming TTS giảm latency cảm nhận.** Đợi 5s mới có audio = tệ. Phát sau 500ms (dù chưa full) = tốt.",
        "**\`gr.Blocks\` cần khi:** image+audio+chat đồng thời, custom event chain, multi-tab UI.",
        "**Event chaining \`.submit().then()\`:** sequence callbacks — submit text trước, sau đó chạy chat function, sau đó update UI.",
        "**\`autoplay=True\` cho audio**: Gradio tự phát khi nhận audio output. UX mượt hơn yêu cầu user click play."
    ],
    code: [
        {
            title: "Bước 1 — Setup + recap chat function với tool",
            lang: "python",
            before: `
**Continuation từ Day 4.** Setup tương tự — chat function với SQLite tool, while loop cho sequential calls.
`,
            code: `import os
import json
from dotenv import load_dotenv
from openai import OpenAI
import gradio as gr
import sqlite3

load_dotenv(override=True)
MODEL = "gpt-4.1-mini"
openai = OpenAI()
DB = "prices.db"

system_message = """
You are a helpful assistant for an Airline called FlightAI.
Give short, courteous answers, no more than 1 sentence.
Always be accurate. If you don't know the answer, say so.
"""

# Tool function từ Day 4 (SQLite version)
def get_ticket_price(city):
    print(f"DATABASE TOOL CALLED: Getting price for {city}", flush=True)
    with sqlite3.connect(DB) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT price FROM prices WHERE city = ?', (city.lower(),))
        result = cursor.fetchone()
        return f"Ticket price to {city} is $\${result[0]}" if result else "No price data available"

# Tool schema từ Day 4
price_function = {
    "name": "get_ticket_price",
    "description": "Get the price of a return ticket to the destination city.",
    "parameters": {
        "type": "object",
        "properties": {
            "destination_city": {"type": "string", "description": "The city the customer wants to travel to"}
        },
        "required": ["destination_city"],
        "additionalProperties": False
    }
}
tools = [{"type": "function", "function": price_function}]`,
            after: `
**Setup này là baseline từ Day 4.** Code y hệt — chỉ để có context cho phần tiếp theo.

Day 5 sẽ **extend** function chat:
- Trả về 3 thứ: text reply, audio voice, optional image
- Track tools đã gọi → biết destination city nào được mention → gen image cho nó
`
        },
        {
            title: "Bước 2 — DALL-E 3: tạo image từ text prompt",
            lang: "python",
            before: `
**Image generation cơ bản.** DALL-E 3 nhận text prompt → trả base64-encoded PNG.

Quy ước Day 5: pop-art style cho mọi destination → visual nhất quán.
`,
            code: `import base64
from io import BytesIO
from PIL import Image

def artist(city):
    image_response = openai.images.generate(
        model="dall-e-3",
        prompt=f"An image representing a vacation in {city}, showing tourist spots and everything unique about {city}, in a vibrant pop-art style",
        size="1024x1024",
        n=1,
        response_format="b64_json",   # base64 string thay vì URL
    )
    image_base64 = image_response.data[0].b64_json
    image_data = base64.b64decode(image_base64)
    return Image.open(BytesIO(image_data))   # PIL Image object

# Test
image = artist("New York City")
display(image)
# Output: PIL image — vẽ NYC theo pop-art style`,
            after: `
**Mổ xẻ:**

- \`openai.images.generate(...)\` — endpoint khác Chat Completions. Cùng client, khác method.
- \`response_format="b64_json"\`: trả base64 inline thay vì URL. Lợi: không phải tải về sau. Hại: response payload to (vài MB).
- \`response.data[0].b64_json\` → string base64
- \`base64.b64decode(...)\` → bytes
- \`Image.open(BytesIO(...))\` → PIL Image object (Gradio nhận trực tiếp)

**Cost warning:** mỗi image DALL-E 3 standard ~$0.04. **Mỗi cell run** là $0.04. Tránh chạy nhầm trong loop hay debug session — bills tăng nhanh.

**Pop-art prompt trick:** "vibrant pop-art style" → output có visual identity đồng nhất. Production: lock style trong prompt template để brand consistency.
`
        },
        {
            title: "Bước 3 — TTS: chuyển text → giọng nói",
            lang: "python",
            before: `
**Text-to-Speech.** OpenAI có model \`gpt-4o-mini-tts\` chuyên TTS. Nhận text + voice preset → trả audio MP3 bytes.

Voice presets phổ biến: \`alloy\` (neutral), \`onyx\` (male deep), \`coral\` (female warm), \`nova\` (female young).
`,
            code: `def talker(message):
    response = openai.audio.speech.create(
        model="gpt-4o-mini-tts",
        voice="onyx",          # male voice
        input=message
    )
    return response.content    # bytes MP3

# Test
audio_bytes = talker("Welcome to FlightAI! How can I help you today?")
# audio_bytes is raw MP3 bytes - Gradio nhận trực tiếp`,
            after: `
**API design đáng chú ý:**

- \`openai.audio.speech.create(...)\` — endpoint thứ 3 (Chat, Images, Audio)
- \`response.content\` trả **raw bytes** (không phải base64). Gradio Audio component nhận bytes trực tiếp
- \`voice="onyx"\` — pick từ ~6 preset. Không có custom voice trong basic API (cần Voice Cloning API cao cấp)

**Cost:** TTS rẻ hơn DALL-E. ~$0.015 per 1K characters. 1 cuộc hội thoại 30 turn × 100 chars = $0.045 — chấp nhận được.

**Latency:** TTS chậm — vài giây cho output. Hai chiến lược:
- **Sync**: chờ full audio → trả về (đơn giản, latency cao)
- **Streaming TTS**: nhận audio chunk từng giây → phát ngay (phức tạp, UX tốt)

Day 5 dùng sync để đơn giản. Production app nên dùng streaming nếu có thể.
`
        },
        {
            title: "Bước 4 — Chat function tổng hợp: text + voice + image",
            lang: "python",
            before: `
**Tổng hợp 3 modality.** Function chat giờ:
1. Run tool calling loop như Day 4
2. Trong khi loop, **track** city nào được mention
3. Sau khi có final reply → gen voice (TTS) cho reply
4. Nếu có city → gen image (DALL-E) cho city
5. Return 3 outputs: history, audio, image
`,
            code: `def chat(history):
    history = [{"role": h["role"], "content": h["content"]} for h in history]
    messages = [{"role": "system", "content": system_message}] + history
    response = openai.chat.completions.create(model=MODEL, messages=messages, tools=tools)
    cities = []
    image = None

    # Tool loop — track cities được mention
    while response.choices[0].finish_reason == "tool_calls":
        message = response.choices[0].message
        responses, cities = handle_tool_calls_and_return_cities(message)
        messages.append(message)
        messages.extend(responses)
        response = openai.chat.completions.create(model=MODEL, messages=messages, tools=tools)

    reply = response.choices[0].message.content
    history += [{"role": "assistant", "content": reply}]

    # Gen voice cho reply
    voice = talker(reply)

    # Gen image nếu có city
    if cities:
        image = artist(cities[0])

    return history, voice, image


def handle_tool_calls_and_return_cities(message):
    """Variant của handle_tool_calls — extract city để gen image."""
    responses = []
    cities = []
    for tool_call in message.tool_calls:
        if tool_call.function.name == "get_ticket_price":
            arguments = json.loads(tool_call.function.arguments)
            city = arguments.get('destination_city')
            cities.append(city)               # ← TRACK city
            price_details = get_ticket_price(city)
            responses.append({
                "role": "tool",
                "content": price_details,
                "tool_call_id": tool_call.id
            })
    return responses, cities`,
            after: `
**Khác biệt key vs Day 4:**

- **Signature đổi**: \`chat(message, history)\` → \`chat(history)\`. Lý do: trong Blocks UI, message đã được append vào history trước khi gọi chat. Function chỉ cần history.
- **Return 3-tuple**: history, voice, image. Gradio Blocks nhận multi-output.
- **Track cities**: variant \`handle_tool_calls_and_return_cities\` lưu city để gen image.

**Logic gen image:**
- Chỉ gen nếu có ít nhất 1 city
- Chỉ gen image cho city đầu tiên (\`cities[0]\`) — tránh spam cost

**Flow agentic:**

\`\`\`
User: "How much is a ticket to Paris?"
   ↓
LLM call 1 → tool_calls=[get_ticket_price(Paris)]
   ↓
Run tool, save "Paris" vào cities, append result
   ↓
LLM call 2 → "A return ticket to Paris is $899"
   ↓
TTS("A return ticket to Paris is $899") → voice MP3
DALL-E("vacation in Paris, pop-art style") → image
   ↓
Return (history, voice, image)
   ↓
Gradio render 3 components đồng thời
\`\`\`
`
        },
        {
            title: "Bước 5 — gr.Blocks: custom layout với 3 component",
            lang: "python",
            before: `
**\`gr.Blocks\` cho phép custom layout** thực sự — row, column, multiple components, event chaining.

UI Day 5:
- Row 1: chatbot (left) + image (right)
- Row 2: audio player
- Row 3: textbox cho user input
`,
            code: `def put_message_in_chatbot(message, history):
    """Helper: append user message vào history, clear textbox."""
    return "", history + [{"role": "user", "content": message}]


with gr.Blocks() as ui:
    with gr.Row():
        chatbot = gr.Chatbot(height=500, type="messages")
        image_output = gr.Image(height=500, interactive=False)
    with gr.Row():
        audio_output = gr.Audio(autoplay=True)
    with gr.Row():
        message = gr.Textbox(label="Chat with our AI Assistant:")

    # Event chain: submit textbox → put_message_in_chatbot → chat
    message.submit(
        put_message_in_chatbot,
        inputs=[message, chatbot],
        outputs=[message, chatbot]
    ).then(
        chat,
        inputs=chatbot,
        outputs=[chatbot, audio_output, image_output]
    )

ui.launch(inbrowser=True, auth=("ed", "bananas"))`,
            after: `
**Mổ xẻ Blocks:**

- **\`with gr.Blocks() as ui:\`**: context manager — mọi component bên trong thuộc UI này
- **\`with gr.Row():\`**: components bên trong xếp ngang (horizontal flexbox)
- **\`gr.Chatbot()\`**: chat bubble component (khác Textbox)
- **\`gr.Image(interactive=False)\`**: chỉ display, user không upload
- **\`gr.Audio(autoplay=True)\`**: tự phát khi có audio data

**Event chaining — \`.submit().then()\`:**

\`\`\`
message.submit(fn1, inputs, outputs)   ← user nhấn Enter trên textbox
  .then(fn2, inputs, outputs)          ← chain: chạy sau khi fn1 xong
\`\`\`

- **fn1 \`put_message_in_chatbot\`**:
  - Input: message text + history
  - Output: clear textbox (\`""\`) + append user msg vào history
  - **Effect:** UI hiện ngay user message, textbox clear

- **fn2 \`chat\`**:
  - Input: chatbot (đã có user message)
  - Output: chatbot updated + audio + image
  - **Effect:** sau ~5s, bot reply xuất hiện, audio auto-play, image show

**Tại sao tách 2 step?**

Nếu chỉ có \`chat\` thẳng, user phải đợi 5s mới thấy gì → tệ. Pattern này: user message xuất hiện *ngay*, sau đó bot reply load dần. UX tốt hơn nhiều.
`
        }
    ]
});
