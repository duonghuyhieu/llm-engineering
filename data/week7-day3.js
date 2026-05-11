window.LESSONS = window.LESSONS || [];
window.LESSONS.push({
    week: 7,
    day: 3,
    title: "QLoRA Training Part 1 · SFTTrainer · Hyperparameters · Weights & Biases",
    notebooks: [],
    topics: [
        "Day 3 — code chính ở Colab. Khái niệm core về training",
        "Setup model với 4-bit + PEFT wrapper",
        "TRL SFTTrainer — high-level training loop",
        "Hyperparameters: LR, batch, grad accumulation, scheduler",
        "Weights & Biases tracking",
        "Save checkpoint cho persistence"
    ],
    summary: `
## 1. Day 3-4 — Training trên Colab A100

Edward chạy training trên **Colab Pro+ A100 40GB**. Students có thể chạy:
- T4 16GB (free): batch size nhỏ, full dataset 820K (overnight)
- A100 40GB (Pro+ $50/mo): batch lớn, faster
- L4 24GB (Pro $10/mo): middle ground

## 2. Full training stack

\`\`\`
Base model: LLaMA 3.2-3B (NF4 quantized)
   ↓
PEFT LoRA wrapper (rank=32, alpha=64, qkvo targets)
   ↓
SFT Trainer (TRL library)
   ↓ training loop
LoRA adapter weights (saved every N steps)
   ↓
Push adapter lên HF Hub
\`\`\`

## 3. Critical hyperparameters

| HP | Day 3 value | Vai trò |
|---|---|---|
| **learning_rate** | 1e-4 | Most important. Default Adam OK |
| **num_train_epochs** | 1 | Dataset lớn → 1 epoch đủ |
| **per_device_train_batch_size** | 4 | Phụ thuộc VRAM |
| **gradient_accumulation_steps** | 4 | Effective batch = 16 |
| **warmup_ratio** | 0.03 | 3% steps warm up LR |
| **lr_scheduler_type** | "cosine" | Decay LR theo time |
| **optim** | "paged_adamw_8bit" | Tiết kiệm RAM cho QLoRA |
| **max_seq_length** | 128 | Match CUTOFF từ Day 2 |
| **save_steps** | 5000 | Save checkpoint mỗi 5K steps |

## 4. Effective batch size = product of 3 numbers

\`\`\`
effective_batch = per_device_batch × grad_accumulation × num_gpus
                 = 4 × 4 × 1 (single GPU)
                 = 16
\`\`\`

Effective batch 16-32 thường tốt cho LLM training. Lớn hơn → ổn định gradient nhưng cần data lớn.

## 5. Gradient accumulation - trick fit lớn batch trong GPU nhỏ

\`\`\`
for i in range(grad_accumulation_steps):
    loss = compute_loss(mini_batch_i)
    loss.backward()             # accumulate gradient (KHÔNG step)

optimizer.step()                # step sau khi accumulate đủ
optimizer.zero_grad()
\`\`\`

Effect: same as 1 large batch, nhưng VRAM của 1 small batch. Slow nhẹ (4 forward passes thay 1) nhưng critical cho fit T4.

## 6. paged_adamw_8bit optimizer

Standard Adam stores 2 moments (m, v) per param → **3× weights memory** trên optimizer states.

**paged_adamw_8bit** từ \`bitsandbytes\`:
- Quantize optimizer states xuống 8-bit
- Page out không-active states ra CPU RAM
- Tiết kiệm 70%+ optimizer memory

Cho QLoRA T4, không có optimizer này thường → OOM. Required for QLoRA training.

## 7. Weights & Biases tracking

\`report_to="wandb"\` enable auto-logging:
- Loss per step (train + val)
- Learning rate schedule
- Gradient norm
- GPU utilization
- System metrics

Free tier đủ cho cá nhân. Critical cho serious work — manual log không scale.
`,
    callouts: [
        {
            type: "info",
            text: "**Mental model cho HP:** LR là 'tốc độ học'. Batch size là 'số bài làm cùng lúc trước khi rút kinh nghiệm'. Epoch là 'số lần đọc lại sách giáo khoa'. Optimizer là 'cách rút kinh nghiệm'. Tuning là tìm combination phù hợp với học sinh (model)."
        },
        {
            type: "warn",
            text: "**Đừng dùng 1 GPU cho experiment + production.** Train job lớn block GPU. Có máy riêng cho experiment (Colab) và production training (Modal/RunPod hourly)."
        }
    ],
    keyPoints: [
        "**LR là HP đầu tiên cần tune.** Sai LR → mọi HP khác vô nghĩa. Cosine với 3% warmup là default an toàn.",
        "**Effective batch size matter, không phải per_device.** Khi compare runs, so effective batch.",
        "**Gradient accumulation = free large batch.** Trade time lấy memory. Fit batch lớn trên GPU nhỏ.",
        "**\`packing=True\`** quick win — 2-3× speedup miễn phí cho dataset có example ngắn-dài hỗn hợp.",
        "**W&B bắt buộc cho serious work.** Manual log không scale. Setup 1 lần, dùng forever.",
        "**Save checkpoint mỗi N step.** Crash giữa chừng = mất tất cả nếu không save."
    ],
    code: [
        {
            title: "Bước 1 — Setup Colab + load model + tokenizer",
            lang: "python",
            before: `
**Day 3 setup trên Colab A100.** Install dependencies + load LLaMA 3.2-3B với 4-bit quantization.

Cell này typically chạy ~2-3 phút trên A100 (download model + setup).
`,
            code: `# Install (lần đầu mỗi Colab session)
!pip install -q transformers peft bitsandbytes accelerate trl wandb

# Imports
import os
import torch
from datasets import load_dataset
from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from trl import SFTTrainer, SFTConfig
import wandb

# Auth
from google.colab import userdata
os.environ['HF_TOKEN'] = userdata.get('HF_TOKEN')
os.environ['WANDB_API_KEY'] = userdata.get('WANDB_API_KEY')
wandb.login()

# Config
BASE_MODEL = "meta-llama/Llama-3.2-3B"
PROJECT_NAME = "pricer"
HF_USER = "ed-donner"
DATASET_NAME = f"{HF_USER}/items_prompts_full"
MAX_SEQUENCE_LENGTH = 128

# Load tokenizer
tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL, trust_remote_code=True)
tokenizer.pad_token = tokenizer.eos_token   # LLaMA không có pad token, reuse EOS
tokenizer.padding_side = "right"             # standard cho causal LM`,
            after: `
**Mổ xẻ:**

**\`tokenizer.pad_token = tokenizer.eos_token\`** — LLaMA base không có pad token. Reuse EOS. Lưu ý: trainer sẽ pass \`attention_mask\` để model ignore padding tokens, không bị nhầm là content.

**\`tokenizer.padding_side = "right"\`** — pad bên phải sequence. Cho generation model, có 2 conventions:
- "right" + attention_mask: standard
- "left" cho generation: tokens được pad ở đầu, output token đứng đúng vị trí cuối

Cho training, "right" + mask là sufficient. Inference có thể switch "left".

**Colab Secrets pattern:**
- HF_TOKEN: access gated models (LLaMA)
- WANDB_API_KEY: log to W&B project

Add trong Colab UI → Secrets tab → never hardcode trong notebook.
`
        },
        {
            title: "Bước 2 — Load model với QLoRA setup",
            lang: "python",
            before: `
**Load LLaMA 3.2-3B với 4-bit quantization + LoRA wrapper.**

Tổng memory: ~2GB base (4-bit) + 30MB adapter + buffer training = ~5GB. Fit T4, comfortable A100.
`,
            code: `# 4-bit quantization config
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.bfloat16,
    bnb_4bit_use_double_quant=True,
)

# Load model với quantization
model = AutoModelForCausalLM.from_pretrained(
    BASE_MODEL,
    quantization_config=bnb_config,
    device_map="auto",
)
model = prepare_model_for_kbit_training(model)

# LoRA config
LORA_R = 32
LORA_ALPHA = 64
LORA_DROPOUT = 0.1
TARGET_MODULES = ["q_proj", "k_proj", "v_proj", "o_proj"]

lora_config = LoraConfig(
    r=LORA_R,
    lora_alpha=LORA_ALPHA,
    lora_dropout=LORA_DROPOUT,
    target_modules=TARGET_MODULES,
    bias="none",
    task_type="CAUSAL_LM",
)

model = get_peft_model(model, lora_config)
model.print_trainable_parameters()
# trainable params: 13,189,120 || all params: 3,225,892,608 || trainable%: 0.4090`,
            after: `
**Mổ xẻ:**

**Quantization config chuẩn QLoRA paper:**
- \`nf4\`: optimal cho weights N(0,1)
- \`bfloat16\` compute: dequantize cho compute
- \`double_quant\`: extra ~0.4 bit savings

**LoRA config:**
- \`r=32\`: rank 32 (Day 1 đã giải thích — sweet spot)
- \`alpha=64\` = 2×r (scaling)
- \`target_modules\` = qkvo: chỉ attention projections (sufficient cho most tasks)

**Trainable params analysis:**

- **13M trainable** / **3.2B total** = 0.4%
- Train chỉ 0.4% params mà adapt model cho task niche
- Memory cho gradients: 13M × 4 bytes = 52MB (tiny)

Compared full fine-tune:
- 3.2B × 4 bytes = 12.8GB cho gradients
- + 3.2B × 8 bytes = 25.6GB cho Adam states
- → Just gradients alone không fit T4

LoRA / QLoRA = enabler cho amateur fine-tuning. Pre-2023 không thể.
`
        },
        {
            title: "Bước 3 — Load dataset prompts",
            lang: "python",
            before: `
**Load dataset đã prep ở Day 2.** Dataset đã có \`prompt\` và \`completion\` fields — direct ready cho SFTTrainer.
`,
            code: `# Load training data
ds = load_dataset(DATASET_NAME)
train_ds = ds["train"]
val_ds = ds["val"]

print(f"Train samples: {len(train_ds):,}")
print(f"Val samples: {len(val_ds):,}")
print(f"Sample:")
print(train_ds[0])
# Train samples: 800,000
# Val samples: 10,000
# Sample:
# {'prompt': 'What does this cost to the nearest dollar?...Price is $',
#  'completion': '399.00'}`,
            after: `
**Mổ xẻ dataset:**

- **800K train samples** — đủ lớn cho 1 epoch training
- **10K val** — đủ statistical significance để track loss
- **Format \`prompt\` + \`completion\`** — chuẩn SFTTrainer accept

**SFTTrainer auto handle:**
1. Concatenate prompt + completion vào single sequence
2. Tokenize với padding/truncation
3. Compute loss **chỉ trên completion tokens** (mask prompt out)
4. Backprop standard

**Lưu ý loss masking:**

Default behavior: loss tính trên **toàn bộ** sequence. Cho task này, ta muốn loss chỉ trên completion (number).

SFTTrainer hỗ trợ via \`DataCollatorForCompletionOnlyLM\` — pass collator này để mask prompt tokens trong loss computation.

Cho LLaMA 3.2 cookies experiment đơn giản, default OK. Production có thể wants strict completion-only loss.
`
        },
        {
            title: "Bước 4 — SFTConfig: training hyperparameters",
            lang: "python",
            before: `
**SFTConfig** kế thừa từ TrainingArguments — define mọi HP. Đây là tệp config quan trọng nhất.
`,
            code: `from datetime import datetime

RUN_NAME = f"pricer-{datetime.now().strftime('%Y-%m-%d-%H-%M-%S')}"

# Hyperparameters
EPOCHS = 1
BATCH_SIZE = 4
GRAD_ACCUMULATION_STEPS = 4
LEARNING_RATE = 1e-4
LR_SCHEDULER_TYPE = 'cosine'
WARMUP_RATIO = 0.03
OPTIMIZER = "paged_adamw_8bit"

sft_config = SFTConfig(
    output_dir=f"./outputs/{RUN_NAME}",
    num_train_epochs=EPOCHS,
    per_device_train_batch_size=BATCH_SIZE,
    gradient_accumulation_steps=GRAD_ACCUMULATION_STEPS,
    eval_strategy="steps",
    eval_steps=5000,
    save_steps=5000,
    save_total_limit=5,
    logging_steps=50,
    learning_rate=LEARNING_RATE,
    weight_decay=0.001,
    warmup_ratio=WARMUP_RATIO,
    lr_scheduler_type=LR_SCHEDULER_TYPE,
    optim=OPTIMIZER,
    bf16=True,                            # mixed precision
    max_seq_length=MAX_SEQUENCE_LENGTH,
    dataset_text_field="prompt",          # which field is text
    packing=True,                         # pack short sequences
    run_name=RUN_NAME,
    report_to="wandb",                    # log to W&B
    push_to_hub=True,
    hub_model_id=f"{HF_USER}/{PROJECT_NAME}",
    hub_strategy="every_save",
)`,
            after: `
**Mổ xẻ critical params:**

**\`per_device_train_batch_size=4\` + \`gradient_accumulation_steps=4\`:**
- Effective batch = 16
- VRAM cost: only 4-batch worth (small)

**\`learning_rate=1e-4\`:**
- Higher than full fine-tune (1e-5) vì train ít params hơn
- LoRA tolerance LR cao hơn — train fast, converge tốt

**\`lr_scheduler_type='cosine'\` + \`warmup_ratio=0.03\`:**
- 3% steps đầu warmup từ 0 → LR
- Sau đó cosine decay → 0 ở cuối training
- Helps stability + convergence

**\`packing=True\` huge win:**
- Concat multiple examples vào 1 sequence
- Use full max_seq_length thay vì padding
- 2-3× throughput speedup miễn phí

**\`bf16=True\`** trên A100:
- BFloat16 mixed precision
- Faster + ổn định hơn FP16
- A100 native support, T4 không (T4 dùng FP16)

**Save + push to Hub:**
- \`hub_strategy="every_save"\`: mỗi save checkpoint → auto push lên HF Hub
- Persistent: Colab session disconnect → adapter vẫn còn trên Hub

**\`save_total_limit=5\`**: chỉ giữ 5 checkpoint mới nhất. Tránh fill disk.

**\`eval_strategy="steps"\` + \`eval_steps=5000\`**: eval trên val set mỗi 5K steps. Track overfitting.
`
        },
        {
            title: "Bước 5 — Init SFTTrainer + Train",
            lang: "python",
            before: `
**Final step Day 3.** Create trainer, kick off training. Day 3 monitor first half. Day 4 monitor remainder + analyze results.
`,
            code: `# Wandb init
wandb.init(project=PROJECT_NAME, name=RUN_NAME)

# Trainer
trainer = SFTTrainer(
    model=model,
    args=sft_config,
    train_dataset=train_ds,
    eval_dataset=val_ds,
    tokenizer=tokenizer,
    peft_config=lora_config,
    formatting_func=lambda x: f"{x['prompt']}{x['completion']}",
)

# Kick off training
trainer.train()`,
            after: `
**What happens after \`trainer.train()\`:**

1. **Init**: model loaded, optimizer prepared, scheduler set
2. **Loop**: mỗi batch → forward → loss → backward → step
3. **Periodic events**:
   - Every 50 steps: log to W&B (loss, LR, gradient norm)
   - Every 5000 steps: eval on val set
   - Every 5000 steps: save checkpoint + push to Hub

**Time estimates trên A100 40GB:**

- 800K samples / effective batch 16 = 50K steps
- ~0.5 second/step (A100) → ~7 giờ total
- T4 16GB ~3 second/step → ~40 giờ (3 sessions overnight)

**W&B dashboard real-time** show:
- Train loss curve (giảm từ ~5 → ~1.5)
- Val loss curve (parallel với train, slight gap)
- LR schedule (warmup 3% → cosine decay)
- GPU utilization (~95% on A100, lower trên T4)

**Day 3 stop point:** training started, kiểm tra W&B chart sau 30-60 phút. Verify:
- Loss decreasing
- No NaN/inf
- LR schedule shape correct

If issues → Cancel, fix config, restart. **Đừng để chạy 7 giờ rồi mới phát hiện bug.**

Day 4 sẽ continue + analyze final results.
`
        }
    ]
});
