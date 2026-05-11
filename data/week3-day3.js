window.LESSONS = window.LESSONS || [];
window.LESSONS.push({
    week: 3,
    day: 3,
    title: "Tokenizer như object · encode/decode · Chat templates · So sánh vocab",
    notebooks: [],
    topics: [
        "Tokenizer là object có state — không chỉ là function",
        "3 cách tương tác: encode, decode, __call__",
        "Special tokens: BOS, EOS, PAD, UNK, role markers",
        "Chat templates — wire format giữa app và model",
        "apply_chat_template: serialize messages → prompt string",
        "So sánh tokenizer giữa các family (GPT, LLaMA, Qwen, Phi, DeepSeek)"
    ],
    summary: `
## 1. Tokenizer là object có state

\`tokenizer = AutoTokenizer.from_pretrained(...)\` trả về object chứa:

- **Vocabulary** (vd 32K từ → ID): mapping cố định
- **Merges rules** (BPE): cách combine subwords
- **Special tokens**: BOS, EOS, PAD, UNK + custom (vd \`<|im_start|>\`)
- **Chat template**: Jinja2 string format messages thành prompt
- **Padding side, truncation strategy**: hành vi default

Cùng text qua 2 tokenizer khác nhau → ID khác nhau hoàn toàn. **Tokenizer phải khớp model** — nếu không, model nhận token ID 'lạ' và sinh nonsense.

## 2. 3 cách tương tác

\`\`\`python
tokenizer.encode("Hello")           # text → list IDs
tokenizer.decode([15496])           # list IDs → text
tokenizer("Hello", return_tensors="pt")   # full call, trả input_ids + attention_mask
\`\`\`

\`__call__\` là cách 'production' — trả về tensor sẵn sàng feed thẳng vào model.

## 3. Special tokens — không phải data thường

| Token | Vai trò | Ví dụ |
|---|---|---|
| BOS | Bắt đầu sequence | \`<s>\`, \`<bos>\` |
| EOS | Kết thúc — model dừng generate ở đây | \`</s>\`, \`<eos>\`, \`<\\|im_end\\|>\` |
| PAD | Lấp đầy khi batch nhiều sequence ngắn | \`<pad>\` |
| UNK | Token không có trong vocab (hiếm với BPE) | \`<unk>\` |
| Role markers | Phân tách system/user/assistant | \`<\\|im_start\\|>system\\n...\` |

Special token có ID cố định, không bao giờ collision với text thật. Đây là cơ chế model phân biệt 'metadata' và 'content'.

## 4. Chat template — wire format

Vấn đề: mỗi model family train trên format khác nhau (LLaMA dùng \`<|begin_of_text|>\`, Qwen dùng \`<|im_start|>\`, Phi dùng \`<|user|>\`). Nếu prompt sai format → model confuse role → output kém.

\`apply_chat_template\` serialize messages → string đúng format cho model:

\`\`\`python
messages = [{"role": "user", "content": "Hi"}]
prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
\`\`\`

Mỗi tokenizer biết format đúng cho model của nó qua field \`chat_template\` trong \`tokenizer_config.json\`.
`,
    callouts: [
        {
            type: "info",
            text: "**Mental model cho chat template:** Coi như 'wire format' giữa application và model. Application nói chuyện bằng list messages (cao cấp), wire format là string với special tokens (thấp cấp). Tokenizer là 'serializer' chuyển đổi 2 chiều."
        },
        {
            type: "warn",
            text: "**Tokenizer mismatch là bug khó debug.** Symptom: model sinh text vô nghĩa, lặp lại token đầu, không stop đúng. Trước khi đổ lỗi cho model, kiểm tra tokenizer có cùng repo không."
        }
    ],
    keyPoints: [
        "**Tokenizer phải khớp model.** Tải model X với tokenizer Y → garbage output. Luôn dùng \`AutoTokenizer.from_pretrained()\` cùng repo với model.",
        "**Special tokens có ID cố định và không tokenize lại.** Khi user gửi text \`<|im_end|>\` thật (hiếm), tokenizer mặc định sẽ bóc thành special token → có thể bị prompt injection.",
        "**Chat template là Jinja2** nằm trong \`tokenizer_config.json\` field \`chat_template\`. Inspect bằng \`tokenizer.chat_template\`.",
        "**\`add_generation_prompt=True\` cho inference, \`False\` cho training/SFT data.** Sai chỗ này → fine-tune lệch.",
        "**Vocab size khác nhau ảnh hưởng cost rõ rệt cho non-English.** Tiếng Việt với GPT tokenizer tốn ~2× token tiếng Anh.",
        "**Tokenizer object có thể save lại.** \`tokenizer.save_pretrained('./my_tokenizer')\` để bundle với fine-tuned model."
    ],
    code: [
        {
            title: "Bước 1 — Load tokenizer và xem structure",
            lang: "python",
            before: `
**\`AutoTokenizer.from_pretrained\`** load tokenizer của bất kỳ model nào trên Hub. Pattern y hệt model:
`,
            code: `from transformers import AutoTokenizer

# Load tokenizer của Phi-3
tokenizer = AutoTokenizer.from_pretrained("microsoft/Phi-3-mini-4k-instruct")

# Inspect các property quan trọng
print(f"Vocab size: {tokenizer.vocab_size}")          # số từ trong vocab
print(f"Model max length: {tokenizer.model_max_length}")  # context window
print(f"Padding side: {tokenizer.padding_side}")      # 'right' hoặc 'left'

print(f"BOS token: {tokenizer.bos_token}")
print(f"EOS token: {tokenizer.eos_token}")
print(f"PAD token: {tokenizer.pad_token}")
print(f"UNK token: {tokenizer.unk_token}")

# Output mẫu:
# Vocab size: 32000
# Model max length: 4096
# Padding side: left
# BOS token: <s>
# EOS token: <|endoftext|>
# PAD token: <|endoftext|>
# UNK token: <unk>`,
            after: `
**Mổ xẻ:**

- **\`vocab_size = 32000\`**: Phi-3 có 32K subword tokens. So sánh: GPT-4o ~200K, LLaMA 3 ~128K.
- **\`model_max_length = 4096\`**: context window 4K tokens. Trong tên model "Phi-3-mini-**4k**-instruct" đã ghi rõ.
- **\`padding_side = 'left'\`**: với generation model, padding bên trái để token sinh sau cùng "đúng vị trí". Với encoder model (BERT), padding bên phải.
- **\`pad_token = eos_token\`**: Phi-3 reuse EOS làm PAD (không có PAD riêng) — practice phổ biến.

**Lưu ý:** một số model **không có pad_token** mặc định → khi batch process sẽ lỗi. Fix:

\`\`\`python
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token
\`\`\`

Pattern này dùng nhiều khi fine-tune (Tuần 7).
`
        },
        {
            title: "Bước 2 — Encode: text → tokens",
            lang: "python",
            before: `
**Encode** là chuyển text thành list số (token IDs) — input cho model.

Xem chi tiết text bị chia thế nào để hiểu tokenizer.
`,
            code: `text = "Hi my name is Ed and I like banoffee pie"
tokens = tokenizer.encode(text)
print(tokens)
# [13347, 856, 836, 482, 28069, 268, 358, 1093, 326, 17699, 1561, 4447]

# Decode từng token riêng để xem chữ gì
for token_id in tokens:
    token_text = tokenizer.decode([token_id])
    print(f"{token_id:>6} = {token_text!r}")

# Output:
# 13347 = 'Hi'
#   856 = ' my'
#   836 = ' name'
#   482 = ' is'
# 28069 = ' Ed'
#   358 = ' I'
#  1093 = ' like'
#   326 = ' ban'
# 17699 = 'off'
#  1561 = 'ee'
#  4447 = ' pie'`,
            after: `
**Quan sát quan trọng:**

- **Từ phổ biến** (\`Hi\`, \`name\`, \`is\`) → 1 token mỗi từ
- **Từ hiếm** \`banoffee\` → 3 token (\`ban\` + \`off\` + \`ee\`)
- **Whitespace đi kèm token sau** (\` my\` chứ không phải \`my\`) — quirk BPE
- **\`Ed\`** đứng riêng — phổ biến trong English

**Quy luật:**
- Token = subword unit
- Word phổ biến → 1 token
- Word hiếm hoặc tên riêng → vài token
- Mỗi tokenizer family có vocab khác nhau → cùng text tokens khác

**Đo cost prediction:** \`len(tokenizer.encode(text))\` cho biết bao nhiêu token sẽ tốn. Quan trọng để estimate API cost trước khi gọi.

**Tiếng Việt:**
\`\`\`python
vi_text = "Phở Hà Nội ngon nhất Việt Nam"
print(len(tokenizer.encode(vi_text)))
# 15-20 tokens (so với ~8 tokens nếu tiếng Anh tương đương)
\`\`\`

Hệ quả cost: tiếng Việt đắt hơn tiếng Anh ~2× với hầu hết tokenizer.
`
        },
        {
            title: "Bước 3 — __call__: format chuẩn cho model input",
            lang: "python",
            before: `
**\`tokenizer(...)\` (call method)** — cách production. Trả về dict với \`input_ids\` (tensor) + \`attention_mask\`. Sẵn sàng feed thẳng vào model.
`,
            code: `# Đơn lẻ
inputs = tokenizer("Hello world", return_tensors="pt")
print(inputs)
# {
#   'input_ids': tensor([[15496, 1917]]),
#   'attention_mask': tensor([[1, 1]])
# }

# Batch nhiều input với padding
texts = ["Short", "A bit longer text", "The longest text in this batch right here"]
inputs = tokenizer(texts, return_tensors="pt", padding=True, truncation=True, max_length=20)

print(inputs.input_ids.shape)        # torch.Size([3, 20]) hoặc length of longest
print(inputs.attention_mask)
# tensor([[1, 1, 0, 0, 0, 0, 0, 0, 0, 0, ...],   # short - padded
#         [1, 1, 1, 1, 0, 0, 0, 0, 0, 0, ...],
#         [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, ...]])  # longer`,
            after: `
**Mổ xẻ:**

- **\`return_tensors="pt"\`**: \`pt\` = PyTorch. \`tf\` = TensorFlow, \`np\` = NumPy. Default trả Python list — không feed model được.

- **\`padding=True\`**: với batch input độ dài khác nhau, pad sequence ngắn lên = length of longest. Cần để stack thành tensor 2D.

- **\`truncation=True\`** + **\`max_length=20\`**: nếu input dài hơn 20 token, cắt đi. Bảo vệ khỏi out-of-bounds.

- **\`attention_mask\`**: 1 cho real token, 0 cho padding. Model dùng để **ignore padding** trong attention computation. Không có mask → padding tokens được attend → output sai.

**Pattern chuẩn cho inference:**

\`\`\`python
inputs = tokenizer(prompt, return_tensors="pt").to("cuda")
outputs = model.generate(**inputs, max_new_tokens=100)
text = tokenizer.decode(outputs[0], skip_special_tokens=True)
\`\`\`

**\`**inputs\`** unpack dict thành keyword args. Model nhận \`input_ids=...\`, \`attention_mask=...\`.
`
        },
        {
            title: "Bước 4 — Chat template: serialize messages cho model",
            lang: "python",
            before: `
**Concept quan trọng nhất Day 3.**

Mỗi model family có **format chat** riêng (special tokens, separators). Nếu prompt sai format → model confuse role → kết quả tệ.

\`apply_chat_template\` là **serializer**: nhận list messages (cao cấp) → trả string đúng format cho model (thấp cấp).
`,
            code: `messages = [
    {"role": "system", "content": "You are a helpful AI assistant."},
    {"role": "user", "content": "What is the capital of Vietnam?"},
]

# Serialize với chat template của Phi-3
prompt_string = tokenizer.apply_chat_template(
    messages,
    tokenize=False,                  # trả string thay vì token IDs
    add_generation_prompt=True       # thêm role marker cho assistant để model biết generate tiếp
)
print(prompt_string)`,
            after: `
**Output cho Phi-3:**

\`\`\`
<|system|>
You are a helpful AI assistant.<|end|>
<|user|>
What is the capital of Vietnam?<|end|>
<|assistant|>
\`\`\`

**Phân tích:**

- \`<|system|>\`, \`<|user|>\`, \`<|assistant|>\`: **role markers**. Special tokens (1 ID mỗi cái), KHÔNG được tokenize thành text.
- \`<|end|>\`: separator sau mỗi message.
- **\`<|assistant|>\` cuối** không có \`<|end|>\` — đây là "mở" lượt assistant để model biết phải generate tiếp.
- Đây là behavior của \`add_generation_prompt=True\`.

**So với LLaMA 3:**

\`\`\`
<|begin_of_text|><|start_header_id|>system<|end_header_id|>

You are a helpful AI assistant.<|eot_id|><|start_header_id|>user<|end_header_id|>

What is the capital of Vietnam?<|eot_id|><|start_header_id|>assistant<|end_header_id|>
\`\`\`

**Khác hoàn toàn.** Cùng messages → 2 string khác nhau. Đây là vì sao **tokenizer phải khớp model**.

**Sai pattern:** dùng chat template của Phi-3 cho model LLaMA → model gặp special tokens lạ → output rác.
`
        },
        {
            title: "Bước 5 — So sánh tokenizer 4 model family",
            lang: "python",
            before: `
**Demo lớn nhất Day 3.** Load tokenizer của 4 model phổ biến, encode cùng text → compare results.
`,
            code: `from transformers import AutoTokenizer

models = {
    "Llama 3.1":  "meta-llama/Meta-Llama-3.1-8B-Instruct",
    "Phi-3":      "microsoft/Phi-3-mini-4k-instruct",
    "Qwen 2.5":   "Qwen/Qwen2.5-7B-Instruct",
    "DeepSeek":   "deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B",
}

text = "The quick brown fox jumps over the lazy dog. Banoffee pie is delicious."

for name, model_id in models.items():
    tok = AutoTokenizer.from_pretrained(model_id)
    tokens = tok.encode(text)
    print(f"{name:>12} | vocab: {tok.vocab_size:>7,} | tokens: {len(tokens):>3}")

# Output:
#    Llama 3.1 | vocab: 128,256 | tokens:  18
#        Phi-3 | vocab:  32,000 | tokens:  21
#     Qwen 2.5 | vocab: 151,936 | tokens:  17
#     DeepSeek | vocab: 152,064 | tokens:  17`,
            after: `
**Quan sát:**

- **Vocab lớn hơn** thường = **ít token hơn** cho cùng text (mỗi token cover nhiều chữ hơn)
- **Llama 3.1, Qwen, DeepSeek** có vocab 128K+ → tokens count thấp
- **Phi-3** vocab 32K → tokens count cao hơn

**Hệ quả thực tế:**

- Cùng prompt 1000 ký tự English: Phi-3 tốn ~300 tokens, Qwen tốn ~250 tokens
- Cùng prompt 1000 ký tự **tiếng Việt**: Phi-3 tốn ~600 tokens, Qwen tốn ~400 tokens (Qwen trained nhiều Á → tokenize tốt hơn)
- **Cost gọi API** scale với token count → chọn model với tokenizer phù hợp language quan trọng

**Quy tắc lựa chọn:**
- Tiếng Anh chủ yếu → mọi model OK
- Tiếng Việt / Á → **Qwen, Gemma, GPT-4o** (vocab tối ưu)
- Code-heavy → **DeepSeek Coder, Phi-3** (tokenizer ưu tiên code patterns)

**Khám phá thêm:** chat template của từng model cũng khác. Run \`tok.apply_chat_template([{...}])\` cho mỗi cái để thấy 4 format hoàn toàn khác nhau.
`
        }
    ]
});
