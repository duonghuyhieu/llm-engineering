window.LESSONS = window.LESSONS || [];
window.LESSONS.push({
    week: 7,
    day: 1,
    title: "QLoRA · LoRA mathematics · 4-bit quantization · PEFT setup",
    notebooks: [],
    topics: [
        "Day concept — không có lab trong repo, link sang Colab",
        "Vấn đề của full fine-tuning: cost, memory, catastrophic forgetting",
        "LoRA — toán học cốt lõi (low-rank decomposition W + BA)",
        "QLoRA = LoRA + 4-bit quantization của base model",
        "Hyperparameters: rank, alpha, target_modules, dropout",
        "Tính số params trainable với LoRA",
        "Ecosystem: PEFT, BitsAndBytes, TRL"
    ],
    summary: `
## 1. Day 1 — concept

Notebook day1.ipynb chỉ link tới Colab. Day 1 setup conceptual foundation cho fine-tune LLaMA 3.2 trên Colab Pro+.

## 2. Vấn đề của full fine-tuning

Fine-tune full một model 8B parameter cần:
- **Memory**: ~80GB VRAM (FP16: weights 16GB + gradients 16GB + optimizer 32GB + activations 16GB)
- **Compute**: hàng chục GPU-hour
- **Storage**: mỗi checkpoint là file 16GB
- **Catastrophic forgetting**: full fine-tune dễ làm model quên general knowledge

→ Không thể fine-tune LLaMA 8B trên Colab T4 16GB. Cần kỹ thuật **parameter-efficient**.

## 3. LoRA — Low-Rank Adaptation

Idea cốt lõi (Hu et al., 2021): khi fine-tune, **không** update toàn bộ weight matrix W. Thay vào đó, học một **delta** dạng low-rank:

\`\`\`
W_new = W_frozen + ΔW
ΔW = B × A     (A: r × d, B: d × r,  với r << d)
\`\`\`

- W_frozen: weight pretrained (giữ nguyên, không train)
- A, B: 2 matrix mới được train, nhỏ hơn nhiều
- r (rank): hyperparameter, thường 8, 16, 32, 64

**Số liệu cụ thể:**

LLaMA 3.2 3B (Day 2 sẽ dùng) có ~32 attention layers × 4 projection × (3072 × 3072) params.

Với LoRA rank=16 cho 4 projection:
- Mỗi projection: 3072 × 16 + 16 × 3072 = ~100K params
- 32 layers × 4 proj = ~13M params trainable

→ Train **13M params** (0.4% của 3B model) thay vì train cả 3B.

## 4. QLoRA — LoRA + 4-bit quantization

Dettmers et al. 2023: quantize **base model** xuống 4-bit, chỉ giữ LoRA adapter ở FP16.

\`\`\`
[Base model 4-bit, FROZEN]      ~2GB cho 3B model
   ↓
[LoRA adapters FP16, TRAINED]   ~30MB
   ↓
[Output]
\`\`\`

**Memory savings:**
- LLaMA 3.2 3B full FP16: 6GB
- LLaMA 3.2 3B QLoRA: 2GB base + 30MB adapter = **2GB total** cho inference
- Training: ~4-6GB (with gradients + activations)

→ Fit T4 16GB **comfortably**, cho serious training.

## 5. LoRA hyperparameters

| Param | Day 2-3 default | Vai trò |
|---|---|---|
| **r (rank)** | 32 | Capacity adapter. Lớn → train tốt hơn nhưng tốn memory |
| **lora_alpha** | 64 (2×r) | Scaling: ΔW = (alpha/r) × BA |
| **target_modules** | ['q_proj','k_proj','v_proj','o_proj'] | Layer nào áp dụng LoRA |
| **lora_dropout** | 0.1 | Regularization |
| **bias** | 'none' | Không train bias |

## 6. Ecosystem

| Library | Vai trò |
|---|---|
| **PEFT** (HF) | LoRA, IA3, Prefix Tuning, P-Tuning. \`get_peft_model()\` |
| **BitsAndBytes** | 4-bit/8-bit quantization. \`BitsAndBytesConfig\` |
| **TRL** (HF) | RLHF/DPO/SFT Trainer. \`SFTTrainer\` (Day 3-4) |
| **Transformers** | Foundation: model load, tokenizer |
| **Accelerate** | Distributed training abstraction |

Stack chuẩn 2024-2025: \`transformers + peft + bitsandbytes + trl + accelerate\`. 5 packages, ~50 lines code, fine-tune LLaMA 3.2 3B.
`,
    callouts: [
        {
            type: "info",
            text: "**Mental model cho LoRA:** Coi như sticker dán lên model. Base model (LLaMA) là 'tủ lạnh trắng'. Fine-tune full = sơn lại cả tủ (đắt, mất gốc). LoRA = dán decal — vẫn nhìn thấy cả tủ trắng bên dưới, decal có thể bóc ra/dán cái khác. Adapter = decal."
        },
        {
            type: "warn",
            text: "**Đừng load LoRA adapter sai base model.** Adapter trained cho LLaMA 3.1 8B Instruct sẽ corrupt khi merge vào LLaMA 3.2 3B. Tag adapter rõ ràng base model trong metadata."
        }
    ],
    keyPoints: [
        "**LoRA giảm trainable params 100-1000×.** Đây là lý do duy nhất fine-tune local khả thi cho amateur.",
        "**Low-rank hypothesis** vẫn 'open question'. Khoa học chưa giải thích đầy đủ tại sao rank thấp đủ. Empirically work.",
        "**Rank vs Alpha độc lập.** Tăng rank → capacity. Tăng alpha → effective scale lớn hơn (như LR).",
        "**\`target_modules\` cho LLaMA family đã được community study kỹ.** Default qkvo (chỉ attention) là sweet spot.",
        "**QLoRA loss <1%** so với full fine-tune trên hầu hết benchmark. Cost saving ~95%. ROI extremely high.",
        "**LoRA adapter portable.** Một adapter 30MB có thể merge vào nhiều base model variant. Practical cho deploy nhiều variant."
    ],
    code: [
        {
            title: "Bước 1 — Conceptual: LoRA toán học",
            lang: "python",
            before: `
**Day 1 không có code chạy trong notebook**, chỉ link Colab. Nhưng concept LoRA quan trọng — minh họa toán học cốt lõi.

LoRA = train 2 small matrices A và B sao cho \`ΔW = BA\` approximate update mà full fine-tune sẽ compute.
`,
            code: `import torch

# Original weight matrix (giả sử của Q projection trong attention)
# LLaMA 3.2 3B có hidden_size = 3072
W = torch.randn(3072, 3072)   # 9.4M params - frozen during training

# LoRA adapter với rank r=16
r = 16
A = torch.randn(r, 3072) * 0.01    # ~50K params, init small random
B = torch.zeros(3072, r)            # ~50K params, init zero

# Trainable: A và B
trainable = A.numel() + B.numel()
print(f"LoRA trainable: {trainable:,} params")
print(f"Full would be: {W.numel():,} params")
print(f"Reduction: {W.numel() / trainable:.0f}×")
# LoRA trainable: 98,304 params
# Full would be: 9,437,184 params
# Reduction: 96×

# Forward pass với LoRA
def forward_with_lora(x):
    alpha = 32                       # scaling
    delta = (B @ A) * (alpha / r)    # tính delta on-the-fly
    return x @ (W + delta).T

# Training: chỉ optimize A và B (98K params), W giữ nguyên
# → reduction 96× trainable params, gần identical quality`,
            after: `
**Mổ xẻ:**

**Init pattern:**
- \`A ~ N(0, 0.01²)\`: small random. Nếu init bigger → unstable training.
- \`B = 0\`: init zero. Đảm bảo ΔW = BA = 0 ở step đầu → model start identical với base.

**Sau training:**
- \`B\` learn signal trong rank-r subspace
- \`A\` project x vào subspace đó
- Combined \`BA\` capture "direction" của fine-tune update

**Theoretical foundation:** **Low-rank hypothesis** — weight update khi fine-tune intrinsically low-rank. Empirical observation, không có proof formal nhưng work consistently.

**Trade-off rank:**

| Rank | Trainable | Quality vs full FT |
|---|---|---|
| 4 | 24K | ~95% |
| 8 | 49K | ~97% |
| 16 | 98K | ~98% |
| 32 | 197K | ~99% |
| 64 | 393K | ~99% (plateau) |

→ rank 16-32 = sweet spot cho most tasks. Tăng rank không lift đáng kể nhưng tốn memory.

**Critical insight:** với 13M trainable params (LLaMA 3.2 3B + LoRA rank=32 cho qkvo), bạn có thể fine-tune trên Colab T4 free trong vài giờ. Production grade ML.
`
        },
        {
            title: "Bước 2 — Conceptual: QLoRA = LoRA + 4-bit base",
            lang: "python",
            before: `
**QLoRA paper trick:** base model quantize xuống 4-bit, chỉ LoRA adapter giữ FP16. Memory tiết kiệm cực lớn.

**NF4 (NormalFloat 4-bit):** format đặc biệt cho weights distribution ~ N(0,1). Tối ưu hơn INT4 generic.
`,
            code: `from transformers import AutoModelForCausalLM, BitsAndBytesConfig
import torch

# 4-bit quantization config
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",                       # NormalFloat 4-bit
    bnb_4bit_compute_dtype=torch.bfloat16,            # compute ở BF16
    bnb_4bit_use_double_quant=True,                   # quantize cả quant constants
)

# Load LLaMA 3.2 3B với 4-bit
model = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-3.2-3B",
    quantization_config=bnb_config,
    device_map="auto",
)

# Memory check
mem_gb = sum(p.numel() * p.element_size() for p in model.parameters()) / 1e9
print(f"Model memory: {mem_gb:.2f} GB")
# Model memory: ~2 GB (vs 6 GB nếu FP16, vs 12 GB nếu FP32)`,
            after: `
**Mổ xẻ NF4 config:**

- **\`load_in_4bit=True\`**: master flag
- **\`bnb_4bit_quant_type="nf4"\`**: NormalFloat 4-bit. 16 possible values, distributed optimally for N(0,1) weights
- **\`bnb_4bit_compute_dtype=torch.bfloat16\`**: weights stored 4-bit, **compute** dequantize on-the-fly về BF16. Trade-off: slower than FP16 native ~10%, nhưng VRAM tiết kiệm 4×
- **\`bnb_4bit_use_double_quant=True\`**: quantize cả **quantization constants** (mỗi block 64 weights có scale FP32). Saves additional ~0.4 bit/param

**Memory comparison cho LLaMA 3.2 3B:**

| Setting | VRAM |
|---|---|
| FP32 (full) | 12 GB |
| FP16 / BF16 | 6 GB |
| INT8 | 3 GB |
| **NF4** | **~2 GB** |

→ Training với QLoRA: base 2GB + adapter 30MB + gradients 30MB + activations ~1-2GB = **~4-5GB total**.

T4 16GB → fit comfortably. Còn buffer cho batch size lớn hơn.

**Quality loss của NF4:**
- HumanEval: -2% vs FP16
- MMLU: <1% vs FP16
- Generation task (chat, summarize): essentially identical

**Tradeoff cực tốt.** QLoRA là one of major enablers of "democratized fine-tuning" 2023+.
`
        },
        {
            title: "Bước 3 — PEFT config: wrap base model với LoRA adapter",
            lang: "python",
            before: `
**PEFT library** wrap base model với LoRA adapter. Sau khi wrap, training chỉ update adapter params, base frozen.
`,
            code: `from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training

# Prepare 4-bit model cho training (cast input layers to FP32)
model = prepare_model_for_kbit_training(model)

# LoRA config
lora_config = LoraConfig(
    r=32,                                        # rank
    lora_alpha=64,                                # scaling = 2 × r
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],   # attention projections
    lora_dropout=0.1,
    bias="none",
    task_type="CAUSAL_LM",                        # generation task
)

# Wrap model
model = get_peft_model(model, lora_config)

# Verify trainable params
model.print_trainable_parameters()
# trainable params: 13,189,120 || all params: 3,225,892,608 || trainable%: 0.4090

# Now model.train() only updates adapter (13M params)
# Base 3B params frozen and quantized 4-bit`,
            after: `
**Mổ xẻ:**

**\`prepare_model_for_kbit_training(model)\`** quan trọng:
- Cast input embeddings to FP32 (numerical stability)
- Enable gradient checkpointing (memory savings, slower)
- Disable cache during training

**Output \`print_trainable_parameters()\`:**

\`\`\`
trainable params: 13,189,120         ← LoRA adapter
all params: 3,225,892,608             ← LLaMA 3.2 3B total
trainable%: 0.4090
\`\`\`

**Train chỉ 0.4% params** mà có thể adapt model cho task niche → magic của LoRA.

**Memory breakdown cho training:**

- Base model (4-bit, frozen): 2GB
- LoRA adapter (FP16, trainable): 26MB
- Gradients for adapter: 26MB
- Optimizer states (Adam 8-bit): ~50MB
- Activations (batch=4, seq=512): ~1-2GB

**Total: ~4-5GB.** T4 16GB → có thể tăng batch lên 8-16.

**Save adapter sau training:**

\`\`\`python
model.save_pretrained("./my_lora_adapter")
# Save chỉ 26MB - portable, easy share
\`\`\`

Load back để inference:

\`\`\`python
from peft import PeftModel
base = AutoModelForCausalLM.from_pretrained("meta-llama/Llama-3.2-3B", ...)
model = PeftModel.from_pretrained(base, "./my_lora_adapter")
\`\`\`

Day 5 sẽ làm exactly pattern này.
`
        }
    ]
});
