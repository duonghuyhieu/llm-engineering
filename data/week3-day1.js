window.LESSONS = window.LESSONS || [];
window.LESSONS.push({
    week: 3,
    day: 1,
    title: "Hugging Face Hub · Google Colab · Setup environment · First model trên GPU",
    notebooks: [],
    topics: [
        "Hugging Face — 'GitHub của ML': vai trò trong ngành",
        "3 trụ cột: Models, Datasets, Spaces",
        "Hệ sinh thái thư viện: Transformers, Datasets, Diffusers, PEFT, TRL, Accelerate",
        "Google Colab — free GPU cho học",
        "Setup HF token trong Colab Secrets",
        "Chạy Stable Diffusion / FLUX trên Colab T4"
    ],
    summary: `
## 1. Hugging Face — vị trí trong ngành

Trước Hugging Face, mỗi research lab tự host model trên S3/Drive với code reproduce khó. HuggingFace làm được hai việc đột phá:

1. **Hub trung tâm** với hơn 1 triệu model và 200K+ dataset, version-control như Git
2. **Thư viện chuẩn** \`transformers\` cho phép load *bất kỳ* model nào với cùng API

Hệ quả: cộng đồng open-source ML thống nhất. Khi LLaMA 4 ra → có sẵn trên HF trong 24h.

## 2. Ba trụ cột của HF

| Trụ cột | Tương đương | Nội dung |
|---|---|---|
| **Models** | Repository code | Weights + config + tokenizer + model card |
| **Datasets** | Repository data | Dataset chuẩn hóa, có version, có schema |
| **Spaces** | Replit / Vercel | Host Gradio/Streamlit app, có GPU optional |

Mỗi mục trên Hub là một Git repo (LFS cho file lớn). Có thể \`git clone\`, push, fork, PR — đúng workflow Git.

## 3. Hệ sinh thái thư viện

| Library | Vai trò |
|---|---|
| \`transformers\` | Load model + tokenizer + inference. Trung tâm nhất |
| \`datasets\` | Tải, stream, transform datasets — lazy loading |
| \`huggingface_hub\` | Auth, push/pull repo, model card |
| \`diffusers\` | Diffusion models (Stable Diffusion, FLUX) |
| \`accelerate\` | Multi-GPU / distributed training abstraction |
| \`peft\` | Parameter-Efficient Fine-Tuning (LoRA, QLoRA) — Tuần 7 dùng |
| \`trl\` | Transformers Reinforcement Learning — Tuần 7 dùng |

Đa số thời gian chỉ cần \`transformers\` + \`datasets\`.

## 4. Google Colab — free GPU cho ai chưa có

| Tier | GPU | VRAM | Use case |
|---|---|---|---|
| Free | T4 (sometimes) | 16GB | Học, model <8B |
| Colab Pro ($10/mo) | T4/L4 ưu tiên | 16–24GB | Daily work, model 8–13B |
| Pro+ ($50/mo) | A100 (40GB) | 40GB | Fine-tune, model 30B+ |

Free tier có T4 đủ cho ~80% nhiệm vụ Tuần 3.
`,
    callouts: [
        {
            type: "info",
            text: "**Mental model cho HF Hub:** Coi như 'GitHub + Docker Hub + npm cho ML'. Repo có code, có data, có pre-built artifact (model weights). \`pip install transformers\` là entry point, sau đó \`from_pretrained('owner/repo')\` là 'pull image'."
        },
        {
            type: "warn",
            text: "**Đừng commit HF token lên Git.** Token có quyền truy cập gated model + private repo. Lộ token = thiệt hại. Trong Colab dùng **Secrets** (tab khóa bên trái sidebar), không hardcode."
        }
    ],
    keyPoints: [
        "**HF Hub là Git LFS dưới capo.** \`git clone\` model về dùng được. Push model riêng cũng vậy. Không có magic.",
        "**License > performance.** Model siêu mạnh nhưng license cấm commercial → vô dụng cho startup. Apache 2.0 và MIT là 'sạch' nhất, LLaMA license có điều kiện.",
        "**Gated model yêu cầu HF token.** LLaMA, Gemma cần request access trước. Approve có thể vài phút đến vài ngày.",
        "**Colab GPU không persistent.** Mỗi disconnect → mất môi trường. Pattern: mount Google Drive → save model + checkpoint vào Drive → restart vẫn có data.",
        "**Free T4 đủ cho ~80% nhiệm vụ học.** Đừng vội pay Pro+. Chỉ cần khi fine-tune model >13B."
    ],
    code: [
        {
            title: "Bước 1 — Setup Colab notebook với HF token",
            lang: "python",
            before: `
**Standard setup mỗi Colab notebook Tuần 3.**

Trong Colab UI, click icon **chìa khóa** (Secrets) bên trái sidebar → add new secret:
- Name: \`HF_TOKEN\`
- Value: \`hf_...\` (lấy từ huggingface.co/settings/tokens)
- Bật toggle "Notebook access"

Sau đó trong notebook:
`,
            code: `# Cài đặt libraries
!pip install -q transformers datasets diffusers accelerate

# Load HF token từ Colab Secrets
from google.colab import userdata
import os

hf_token = userdata.get('HF_TOKEN')
os.environ['HF_TOKEN'] = hf_token   # set env để libraries tự pick up

# Login để cache token (tránh prompt liên tục)
from huggingface_hub import login
login(hf_token, add_to_git_credential=True)`,
            after: `
**Mổ xẻ:**

- \`!pip install -q\`: magic \`!\` cho shell command trong Colab. \`-q\` quiet bớt output dài
- \`userdata.get('HF_TOKEN')\`: Colab built-in API truy cập Secrets. **An toàn hơn** hardcode hay biến môi trường — token không hiện trong notebook
- \`login(...)\`: cache token vào \`~/.huggingface\` → các call sau (\`from_pretrained()\`) tự dùng token, không cần truyền explicit

**Tại sao cần token?**
- **Gated models** (LLaMA, Gemma, Mistral 7B): require accept license → HF token verify
- **Private repos** của bạn
- **Push model** lên Hub (write permission)
- **Rate limit**: anonymous có limit thấp hơn

Token có 2 loại: **Read** (dùng đủ) và **Write** (cần khi push model).
`
        },
        {
            title: "Bước 2 — Check GPU available",
            lang: "python",
            before: `
**Always verify GPU before run.** Trong Colab, GPU không phải lúc nào cũng có (free tier random). Nếu không có GPU → đổi runtime: Runtime → Change runtime type → T4 GPU.
`,
            code: `import torch

print(f"CUDA available: {torch.cuda.is_available()}")
print(f"Device count: {torch.cuda.device_count()}")
if torch.cuda.is_available():
    print(f"Device name: {torch.cuda.get_device_name(0)}")
    print(f"VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")

# Output mong đợi:
# CUDA available: True
# Device count: 1
# Device name: Tesla T4
# VRAM: 15.8 GB`,
            after: `
**Diễn giải:**

- \`torch.cuda.is_available()\`: True nếu PyTorch detect GPU
- \`get_device_name(0)\`: tên GPU. Trên Colab free thường là **Tesla T4** (16GB VRAM)
- \`total_memory\`: VRAM total. T4 = ~16GB, A100 = ~40GB, H100 = ~80GB

**Quy luật ngón tay VRAM:**

| Model size | FP16 cần | INT4 (QLoRA) cần |
|---|---|---|
| 1B params | 2 GB | ~0.5 GB |
| 3B | 6 GB | 1.5 GB |
| 7B | 14 GB | 4 GB |
| 13B | 26 GB | 7 GB |
| 70B | 140 GB | 35 GB |

T4 16GB **đủ** cho model 7B với 4-bit (QLoRA, Tuần 7), hoặc 3B với FP16.
`
        },
        {
            title: "Bước 3 — First HF inference: Stable Diffusion XL",
            lang: "python",
            before: `
**Magic moment đầu của Tuần 3.** \`diffusers\` library wrap Stable Diffusion thành 3 dòng — chạy model 6B param GPU local.

Note: SDXL cần ~10GB VRAM với FP16. Trên T4 16GB vẫn fit.
`,
            code: `from diffusers import StableDiffusionXLPipeline
import torch

# Load model (lần đầu tải ~10GB - mất vài phút)
pipe = StableDiffusionXLPipeline.from_pretrained(
    "stabilityai/stable-diffusion-xl-base-1.0",
    torch_dtype=torch.float16,    # FP16 thay FP32 → tiết kiệm 50% VRAM
    variant="fp16",
    use_safetensors=True,
)
pipe = pipe.to("cuda")            # move weights lên GPU

# Generate image
prompt = "A cyberpunk Hanoi at night, neon lights, rain on streets, photorealistic"
image = pipe(prompt).images[0]
image.save("output.png")
image`,
            after: `
**Mổ xẻ:**

- \`from_pretrained("owner/repo-id")\`: download model từ HF Hub (~10GB), cache vào \`~/.cache/huggingface\`. Lần sau load từ cache, fast
- \`torch_dtype=torch.float16\`: load weights ở FP16 thay FP32. Quality gần như identical, VRAM giảm 50%, speed tăng
- \`variant="fp16"\`: chỉ download FP16 variant (~5GB) thay vì FP32 full (~10GB). Lưu bandwidth
- \`use_safetensors=True\`: dùng format \`.safetensors\` thay \`.bin\`. An toàn hơn (không exec pickle), load nhanh hơn
- \`.to("cuda")\`: di chuyển model từ CPU RAM sang GPU VRAM
- \`pipe(prompt)\`: invoke pipeline. \`.images[0]\` lấy PIL Image

**Output:** PIL Image. \`image.save("output.png")\` save, hoặc display inline trong Colab cell.

**Latency:** trên T4, SDXL ~10-15s per image với default settings. A100 ~3-5s. Trên CPU: vài phút (không khuyến khích).

**Pattern \`pipe = X.from_pretrained(...).to("cuda")\`** là CÁCH chuẩn load mọi model HF cho inference GPU.
`
        },
        {
            title: "Bước 4 — Save image vào Google Drive cho persistent",
            lang: "python",
            before: `
**Vấn đề Colab:** mỗi session disconnect → mất file. Workaround: mount Google Drive → save lên đó.

Pattern này dùng xuyên Tuần 3 — cho model checkpoint, generated content, dataset cached.
`,
            code: `from google.colab import drive
drive.mount('/content/drive')   # popup yêu cầu authorize lần đầu

# Save image vào Drive
import os
os.makedirs('/content/drive/MyDrive/llm-course/images', exist_ok=True)
image.save('/content/drive/MyDrive/llm-course/images/cyberpunk_hanoi.png')

print("Saved to Drive!")`,
            after: `
**Sau khi mount:**
- \`/content/drive/MyDrive/\` = root của Google Drive của bạn
- File save vào đây persistent qua session disconnect
- File hiện ngay trên Drive web UI

**Use cases:**
- Save trained model checkpoint (Tuần 7)
- Save generated images / audio
- Load private dataset upload sẵn
- Backup notebooks

**Lưu ý:** \`/content/...\` trên Colab là ephemeral storage (mất khi disconnect). Chỉ \`/content/drive/...\` mới persistent.
`
        },
        {
            title: "Bước 5 — Try Flux: thế hệ image gen mới hơn",
            lang: "python",
            before: `
**FLUX** là model image gen từ Black Forest Labs — top open-source 2024+, beat SDXL về quality. Cùng pattern \`from_pretrained\`, chỉ khác tên.

FLUX có 2 variant:
- \`FLUX.1-dev\`: full quality, gated (cần accept license)
- \`FLUX.1-schnell\`: distilled nhanh (4 steps), open, ngon cho prototype
`,
            code: `from diffusers import FluxPipeline
import torch

# Schnell variant - không cần gated access
pipe = FluxPipeline.from_pretrained(
    "black-forest-labs/FLUX.1-schnell",
    torch_dtype=torch.bfloat16,    # FLUX recommend BF16 hơn FP16
)
pipe.enable_model_cpu_offload()    # tự move parts giữa CPU/GPU khi cần - tiết kiệm VRAM

prompt = "A detailed photograph of a Vietnamese pho restaurant in a rainy Hanoi alley"
image = pipe(
    prompt,
    num_inference_steps=4,    # schnell: chỉ cần 4 steps (SDXL cần 30-50)
    guidance_scale=0.0,        # schnell không dùng classifier-free guidance
).images[0]
image`,
            after: `
**Khác biệt vs SDXL:**

- **\`bfloat16\` thay \`float16\`**: range số rộng hơn FP16, đỡ overflow. Khuyến khích cho training và inference với model lớn.
- **\`enable_model_cpu_offload()\`**: nếu VRAM không đủ, parts model auto offload sang CPU RAM, swap khi cần. Latency tăng nhưng fit GPU nhỏ.
- **\`num_inference_steps=4\`**: schnell distilled → chỉ cần 4 steps thay vì 30+ của SDXL. Nhanh ~10×.
- **\`guidance_scale=0.0\`**: schnell architecture khác, không dùng classifier-free guidance.

**Quality typical:**
- FLUX.1-schnell: tốt hơn SDXL cho prompt complex
- FLUX.1-dev: tốt hơn schnell ~20%, slower 7-8×

**Pattern này dạy bài quan trọng:** mỗi model có default settings tốt nhất khác nhau. **Đọc model card** trước khi dùng → biết \`num_inference_steps\`, \`guidance_scale\`, \`torch_dtype\` recommend.
`
        }
    ]
});
