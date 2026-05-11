window.LESSONS = window.LESSONS || [];
window.LESSONS.push({
    week: 3,
    day: 4,
    title: "Transformers low-level · AutoModel · Quantization · Bên trong LLaMA",
    notebooks: [],
    topics: [
        "Vì sao xuống low-level: control + fine-tune + custom decoding",
        "AutoModel family — chọn 'head' đúng cho task",
        "Quantization: FP32 → FP16 → INT8 → INT4",
        "BitsAndBytes — thư viện quantization de-facto",
        "Inspect kiến trúc model với print(model)",
        "Bên trong LLaMA: embedding · decoder layers · attention · MLP · lm_head"
    ],
    summary: `
## 1. Vì sao xuống low-level

Pipeline (Day 2) đủ cho 80% nhiệm vụ. Khi nào cần \`AutoModel\`:

- **Fine-tune**: Pipeline không hỗ trợ training
- **Custom decoding**: beam search, contrastive search, custom stopping
- **Streaming**: \`TextIteratorStreamer\` cho UI live
- **Quantization**: load 4/8-bit để fit GPU nhỏ
- **Multi-GPU**: \`device_map='auto'\` để shard model
- **Inspect internals**: hidden states, attention weights cho research

## 2. AutoModel family — chọn 'head' đúng

Cùng base model (vd \`bert-base-uncased\`), có nhiều "head" cho các task khác nhau:

| Class | Head | Output | Task |
|---|---|---|---|
| \`AutoModel\` | None | (batch, seq, hidden) | Embedding extraction |
| \`AutoModelForCausalLM\` | LM head | (batch, seq, vocab) | Generation (GPT, LLaMA) |
| \`AutoModelForSequenceClassification\` | Classification | (batch, num_labels) | Sentiment, topic |
| \`AutoModelForTokenClassification\` | Per-token | (batch, seq, num_labels) | NER, POS |
| \`AutoModelForQuestionAnswering\` | Span prediction | (batch, seq, 2) | Q&A trên context |
| \`AutoModelForSeq2SeqLM\` | Encoder + decoder | (batch, seq, vocab) | Translation (T5, BART) |

Chọn sai head → output sai shape → error khó hiểu. **Đọc model card** để biết class nào.

## 3. Quantization — đánh đổi precision và memory

| Dtype | Bits | VRAM cho 7B | Quality loss |
|---|---|---|---|
| FP32 | 32 | 28 GB | None — baseline |
| FP16 / BF16 | 16 | 14 GB | Gần như không |
| INT8 | 8 | 7 GB | <1% |
| INT4 (NF4) | 4 | 3.5 GB | 1–3% |

**Quy luật ngón tay:** \`VRAM ≈ params × bytes_per_param × 1.2\`. 7B FP16 = 7 × 2 × 1.2 ≈ 17GB.
`,
    callouts: [
        {
            type: "info",
            text: "**Mental model cho decoder layer:** Coi mỗi layer là một 'iteration of refinement'. Embedding ban đầu = 'token này là gì'. Sau layer 1 = 'ý nghĩa cơ bản'. Sau layer 32 = 'token tiếp theo là gì'. Càng nhiều layer = càng tinh chỉnh."
        },
        {
            type: "warn",
            text: "**Quantization KHÔNG miễn phí 100%.** Cho task định lượng (math, code), 4-bit có thể mất 5%+ accuracy. Test trên use case của bạn trước khi quyết định production setup."
        }
    ],
    keyPoints: [
        "**Quantization là free lunch (gần như).** 4-bit giảm VRAM 8× với chỉ 1–3% accuracy loss → đa số production deploy ở 4 hoặc 8 bit.",
        "**\`device_map='auto'\` shard model qua nhiều GPU/CPU.** Cẩn thận: layer ở CPU sẽ chậm hơn 100×.",
        "**Số layer × hidden size > vocab size cho big model.** LLaMA 70B có 80 layers × 8192 hidden — đa số params ở layers.",
        "**Activation = nonlinearity = học pattern.** SwiGLU/GELU/SiLU là activation phổ biến trong LLM hiện đại.",
        "**\`model.config\`** chứa mọi hyperparameter (\`hidden_size\`, \`num_hidden_layers\`...). Đọc config thay vì đoán.",
        "**Inference vs Training memory khác nhau lớn.** Training cần thêm gradient + optimizer state ≈ 4× weights memory. Đây là lý do QLoRA tồn tại."
    ],
    code: [
        {
            title: "Bước 1 — Load model với AutoModelForCausalLM",
            lang: "python",
            before: `
**Mid-level abstraction.** Load model thuần (không có pipeline wrapper). Bạn control tokenize, decode, generate.

\`AutoModelForCausalLM\` cho generation task (LLaMA, Phi, GPT, etc).
`,
            code: `from transformers import AutoModelForCausalLM, AutoTokenizer
import torch

model_id = "microsoft/Phi-3-mini-4k-instruct"

tokenizer = AutoTokenizer.from_pretrained(model_id)
model = AutoModelForCausalLM.from_pretrained(
    model_id,
    torch_dtype=torch.bfloat16,     # mixed precision
    device_map="auto",               # auto-distribute layers
    trust_remote_code=True,          # Phi-3 cần (model định nghĩa custom class)
)

# Inspect model size
total_params = sum(p.numel() for p in model.parameters())
trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
print(f"Total params: {total_params / 1e9:.2f} B")
print(f"Trainable: {trainable / 1e9:.2f} B")

# Memory footprint
mem_gb = sum(p.numel() * p.element_size() for p in model.parameters()) / 1e9
print(f"Memory: {mem_gb:.2f} GB")`,
            after: `
**Mổ xẻ:**

- **\`torch_dtype=torch.bfloat16\`**: load weights ở BF16. Tiết kiệm 50% VRAM vs FP32, quality gần identical
- **\`device_map="auto"\`**: HF Accelerate decide layer nào ở đâu. Trên 1 GPU: tất cả vào VRAM. Nhiều GPU: shard. Không đủ VRAM: spill ra CPU
- **\`trust_remote_code=True\`**: cho phép HF run custom code từ repo (Phi-3 dùng custom classes). **Chỉ enable cho repo tin cậy** — security risk

**Output:**

\`\`\`
Total params: 3.82 B
Trainable: 3.82 B    (mọi param đều trainable - chưa freeze gì)
Memory: 7.66 GB      (3.82B × 2 bytes/param)
\`\`\`

**Phi-3-mini ~3.8B params, BF16 = ~7.6GB VRAM.** Fit thoải mái T4 16GB.

**Lưu ý training memory:** đây mới chỉ là **weights**. Khi train còn cần:
- **Gradients**: same size as weights (~7.6GB)
- **Optimizer states** (Adam): 2× weights (~15.3GB)
- **Activations**: phụ thuộc batch + seq length

Total: 7.6 (weights) + 7.6 (grad) + 15.3 (optim) + activations = **40GB+** cho 3.8B model full fine-tune. Đây là lý do QLoRA tồn tại (Tuần 7).
`
        },
        {
            title: "Bước 2 — Inspect kiến trúc với print(model)",
            lang: "python",
            before: `
**Mở 'nắp' model.** \`print(model)\` show structure layer-by-layer. Pattern giống với mọi decoder-only LLM (LLaMA, Phi, Qwen, DeepSeek).
`,
            code: `print(model)`,
            after: `
**Output (rút gọn):**

\`\`\`
Phi3ForCausalLM(
  (model): Phi3Model(
    (embed_tokens): Embedding(32064, 3072, padding_idx=32000)
    (layers): ModuleList(
      (0-31): 32 x Phi3DecoderLayer(
        (self_attn): Phi3Attention(
          (qkv_proj): Linear(in_features=3072, out_features=9216, bias=False)
          (o_proj): Linear(in_features=3072, out_features=3072, bias=False)
        )
        (mlp): Phi3MLP(
          (gate_up_proj): Linear(in_features=3072, out_features=16384, bias=False)
          (down_proj): Linear(in_features=8192, out_features=3072, bias=False)
        )
        (input_layernorm): Phi3RMSNorm()
        (post_attention_layernorm): Phi3RMSNorm()
      )
    )
    (norm): Phi3RMSNorm()
  )
  (lm_head): Linear(in_features=3072, out_features=32064, bias=False)
)
\`\`\`

**Mổ xẻ structure:**

- **\`embed_tokens\`**: \`Embedding(32064, 3072)\` → vocab × hidden_size. Token ID → vector 3072 chiều
- **\`layers\`**: 32 decoder layer giống hệt nhau (Phi-3 có 32; LLaMA 8B có 32; LLaMA 70B có 80)
- Mỗi **DecoderLayer** có 2 sub-block:
  - **\`self_attn\`**: attention mechanism với \`qkv_proj\` (Q, K, V combined) + \`o_proj\` (output)
  - **\`mlp\`**: feed-forward với \`gate_up_proj\` (gate + up projection, SwiGLU activation) + \`down_proj\`
- **\`norm\`** (RMSNorm): normalize trước/sau attention và MLP
- **\`lm_head\`**: projection cuối từ hidden state → vocab. Output logits cho softmax

**Mọi decoder-only LLM đều có cấu trúc tương tự** — chỉ khác tên class và một số chi tiết kiến trúc (Phi dùng RMSNorm + SwiGLU, GPT-2 dùng LayerNorm + GELU).
`
        },
        {
            title: "Bước 3 — Quantization 4-bit với BitsAndBytes",
            lang: "python",
            before: `
**Magic trick để fit 8B+ model vào T4 16GB.** BitsAndBytes quantize weights xuống 4-bit (16× nhỏ hơn FP32), nhưng compute vẫn ở BF16 → quality giữ gần như nguyên.

NF4 (NormalFloat4) là format của QLoRA paper — phân phối tối ưu cho weights distribution.
`,
            code: `from transformers import BitsAndBytesConfig

# 4-bit quantization config
bnb = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",                      # NormalFloat4 — optimal cho weights
    bnb_4bit_compute_dtype=torch.bfloat16,           # compute ở BF16 (decode khi cần)
    bnb_4bit_use_double_quant=True,                  # quantize cả quantization constants
)

# Load model 8B với 4-bit
model_id = "meta-llama/Meta-Llama-3.1-8B-Instruct"
model = AutoModelForCausalLM.from_pretrained(
    model_id,
    quantization_config=bnb,
    device_map="auto",
)

# Memory footprint
mem_gb = sum(p.numel() * p.element_size() for p in model.parameters()) / 1e9
print(f"Memory: {mem_gb:.2f} GB")
# Output: ~5.5 GB (so với 16GB nếu FP16)`,
            after: `
**Mổ xẻ NF4 config:**

- **\`load_in_4bit=True\`**: master flag
- **\`bnb_4bit_quant_type="nf4"\`**: 4-bit NormalFloat. 16 giá trị có thể, phân phối optimal cho weights ~ N(0, 1)
- **\`bnb_4bit_compute_dtype=torch.bfloat16\`**: weights lưu 4-bit, **compute** dequantize on-the-fly về BF16. Trade-off: chậm hơn FP16 thuần ~10-20%, nhưng VRAM tiết kiệm 4×
- **\`bnb_4bit_use_double_quant=True\`**: quantize cả **quantization constants** (mỗi block 64 weights có 1 scale FP32). Tiết kiệm thêm ~0.4 bit/param

**Kết quả thực tế:**
- LLaMA 8B FP16: **16 GB VRAM** → fit T4 nhưng sát mép
- LLaMA 8B INT4 NF4: **~5.5 GB VRAM** → fit T4 thoải mái, còn space cho activations

**Quality test:**
- HumanEval (code): NF4 drop ~2%
- MMLU (knowledge): NF4 drop <1%
- Trade-off **rất tốt** với 3× memory savings

**Quan trọng cho Tuần 7:** QLoRA fine-tuning chỉ khả thi nhờ quantization. Train 8B với full FP16 cần A100 80GB. Với 4-bit, T4 16GB đủ.
`
        },
        {
            title: "Bước 4 — Manual generation với model.generate()",
            lang: "python",
            before: `
**Direct generation control.** Khác pipeline (high-level), \`model.generate()\` cho phép custom mọi tham số decoding.
`,
            code: `# Build prompt với chat template
messages = [
    {"role": "system", "content": "You are a friendly AI assistant."},
    {"role": "user", "content": "Explain attention mechanism in 2 sentences."},
]
prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)

# Tokenize, send lên GPU
inputs = tokenizer(prompt, return_tensors="pt").to("cuda")

# Generate
with torch.no_grad():    # disable autograd để save memory
    outputs = model.generate(
        **inputs,
        max_new_tokens=200,
        do_sample=True,
        temperature=0.7,
        top_p=0.9,
        pad_token_id=tokenizer.eos_token_id,
    )

# Decode - chỉ phần mới sinh, không bao gồm prompt
new_tokens = outputs[0][inputs.input_ids.shape[1]:]
response = tokenizer.decode(new_tokens, skip_special_tokens=True)
print(response)`,
            after: `
**Mổ xẻ generation params:**

- **\`max_new_tokens=200\`**: giới hạn output length. Khác \`max_length\` (limit tổng cả prompt + output).
- **\`do_sample=True\`**: random sampling thay vì greedy. Required nếu dùng temperature/top_p.
- **\`temperature=0.7\`**: control randomness. 0 = deterministic, 1+ = creative.
- **\`top_p=0.9\`**: nucleus sampling. Chỉ sample từ top 90% probability mass — tránh outlier tokens.
- **\`pad_token_id=tokenizer.eos_token_id\`**: nếu pad cần dùng, dùng EOS. Tránh warning.

**\`with torch.no_grad():\`** quan trọng cho **inference**. Disable autograd → không build computation graph → giảm 50% memory, speed gấp đôi.

**Slice output:** \`outputs[0][inputs.input_ids.shape[1]:]\` cắt bỏ prompt phần đầu, chỉ lấy phần model sinh ra. Default \`outputs\` chứa **cả prompt + completion**.

**\`skip_special_tokens=True\`** trong decode: bỏ qua \`<|end|>\`, \`<|user|>\` etc → chỉ trả về text "thật".

**Pattern này là chuẩn cho mọi LLM local inference.** Production code dùng pattern y hệt, chỉ thêm streaming và batch.
`
        },
        {
            title: "Bước 5 — Inspect attention weights (research level)",
            lang: "python",
            before: `
**Power của low-level: xem 'bên trong'.** Lấy attention weights ra để hiểu model 'attention' vào đâu.

Use case: nghiên cứu, debug, interpretability.
`,
            code: `# Forward pass với output_attentions=True
inputs = tokenizer("The cat sat on the mat", return_tensors="pt").to("cuda")

with torch.no_grad():
    outputs = model(
        **inputs,
        output_attentions=True,    # bật để trả về attention weights
        output_hidden_states=True, # bật để trả về hidden states mỗi layer
    )

# Attentions: tuple of (num_layers,) tensors, mỗi tensor shape (batch, num_heads, seq, seq)
print(f"Số layer: {len(outputs.attentions)}")
print(f"Shape attention layer 0: {outputs.attentions[0].shape}")
# Shape: torch.Size([1, 32, 7, 7])
# 1 batch, 32 attention heads, 7 tokens × 7 tokens (attention matrix)

# Hidden states: tuple of (num_layers + 1,) tensors, mỗi shape (batch, seq, hidden)
print(f"Số hidden states: {len(outputs.hidden_states)}")
print(f"Shape hidden layer 0: {outputs.hidden_states[0].shape}")
# Shape: torch.Size([1, 7, 3072])`,
            after: `
**Mổ xẻ output:**

- **\`attentions\`**: list 32 tensor (một cho mỗi layer). Mỗi tensor shape \`(batch, heads, seq, seq)\`. Phần tử \`[b, h, i, j]\` = mức độ token i attend đến token j ở head h, layer này.
- **\`hidden_states\`**: list 33 tensor (1 embedding + 32 layers). Mỗi tensor shape \`(batch, seq, hidden_size)\`. Đây là vector representation của tokens **sau** layer đó.

**Use case nghiên cứu:**

1. **Visualize attention**: heatmap cho thấy "the cat sat on the mat" — token \`sat\` thường attend mạnh đến \`cat\` (subject) và \`mat\` (location)
2. **Layer probing**: train classifier nhỏ trên hidden_states[i] cho task X. Layer nào học gì?
3. **Activation patching** (interpretability research): swap hidden states giữa 2 prompt → xem behavior thay đổi
4. **Knowledge editing**: locate "fact neurons" trong specific layer/dim, modify

**Lưu ý memory:** \`output_attentions=True\` ngốn VRAM đáng kể (lưu N×heads×seq² floats). Chỉ enable khi cần research, KHÔNG cho production inference.

**Đây là sức mạnh low-level:** mọi thứ trong model expose ra được — gradient, activation, attention, weights. Nền tảng cho interpretability research và advanced fine-tuning.
`
        }
    ]
});
