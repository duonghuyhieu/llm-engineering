window.LESSONS = window.LESSONS || [];
window.LESSONS.push({
    week: 3,
    day: 5,
    title: "Meeting Minutes · Whisper STT + LLaMA Summarization · Wrap-up Tuần 3",
    notebooks: ["week3/day5.ipynb"],
    topics: [
        "Token-by-token visualization của LLM inference",
        "Capstone Tuần 3: Meeting Minutes Generator",
        "Pipeline 2-step: Whisper STT → LLM summarization",
        "Mount Google Drive cho audio file",
        "Tổng kết Tuần 3 — bộ kỹ năng HF đã có"
    ],
    summary: `
## 1. Day 5 — capstone Tuần 3

**Bài toán:** cho 1 file audio cuộc họp → output Markdown biên bản với agenda, decisions, action items.

**Pipeline:**

\`\`\`
Audio recording (mp3/wav)
   ↓ Whisper STT (open-source, free, local)
Full transcript (~10K tokens cho 1 giờ họp)
   ↓ LLM (LLaMA 3.1 local hoặc GPT-4 cloud)
Biên bản markdown structured
\`\`\`

**Business value:** một trong các use case ROI cao nhất của GenAI:
- Trước: thư ký tốn 1h ghi + 30 phút biên tập
- Sau: $0 (chạy local) hoặc <$0.10 (cloud), 30s

## 2. Tổng kết Tuần 3 — bộ skill HF

| Skill | Day | Concept chính |
|---|---|---|
| HF Hub navigation | 1 | Models, Datasets, Spaces, gated access |
| Pipelines API | 2 | 30+ task built-in, 1-line inference |
| Tokenization | 3 | encode/decode, chat template, special tokens |
| Transformers low-level | 4 | AutoModel, quantization (NF4), inspect structure |
| Multi-modal app | 5 | STT (Whisper) + LLM = practical product |

Sau Tuần 3, bạn có thể:
- Build inference pipeline cho mọi modality (text, image, audio)
- Pick model phù hợp domain từ HF Hub
- Fit large model vào GPU nhỏ với quantization
- Hiểu structure model để debug và customize

## 3. Token-by-token visualization

Trước khi vào capstone, demo nhỏ visualizing LLM "thought process". Mỗi token sinh ra, LLM tính probability distribution trên cả vocab → pick token. Visualizer cho thấy top-k alternatives được consider.
`,
    callouts: [
        {
            type: "info",
            text: "**Mental model cho Meeting Minutes:** Coi như có một intern thông minh siêu nhanh — listen recording, take notes, format thành biên bản. Hàng giờ work → giây. Đây là pattern 'augment knowledge worker', không phải 'replace'."
        },
        {
            type: "warn",
            text: "**Whisper hallucinate ở im lặng dài.** Audio có pause >5s có thể bị bịa text. Pre-process: cắt silence (\`pydub\`), normalize volume, hoặc dùng \`condition_on_prev_tokens=False\` để giảm bịa."
        }
    ],
    keyPoints: [
        "**Hybrid local + cloud thường tốt nhất.** Whisper STT chạy local (privacy + free), LLM summarize cloud (quality cao hơn). Tách 2 step để tối ưu.",
        "**Transcript dài có thể vượt context.** 1 giờ họp = ~10K-15K tokens. GPT-4 (128K) handle dễ, model nhỏ cần chunk.",
        "**Structured prompt cho summary.** Yêu cầu format rõ (agenda, decisions, action items) → output consistent. Không có structure → mỗi lần output style khác.",
        "**Synthetic data generation** là theme cuối Tuần 3. Dùng LLM tạo training data cho fine-tuning (Tuần 7). Pattern phổ biến giảm cost labeling.",
        "**Mount Google Drive cho persistent file storage trong Colab.** \`drive.mount('/content/drive')\` rồi access \`/content/drive/MyDrive/...\`.",
        "**Save final transcript + summary lên Drive.** Audio file lớn — đừng save trong Colab session storage (mất khi disconnect)."
    ],
    code: [
        {
            title: "Bước 1 — Token visualization: 'xem' LLM nghĩ",
            lang: "python",
            before: `
**Demo cool trước capstone.** Visualizer custom của khóa học show top-k candidate tokens ở mỗi position. Hiểu hơn về **diversity** của LLM output.
`,
            code: `from visualizer import TokenPredictor, create_token_graph, visualize_predictions
import matplotlib.pyplot as plt

message = "In one sentence, describe the color orange to someone who has never been able to see"
model_name = "gpt-4.1-mini"

# Lấy predictions: ở mỗi token position, top-k candidates với probability
predictor = TokenPredictor(model_name)
predictions = predictor.predict_tokens(message)

# Build graph và visualize
G = create_token_graph(model_name, predictions)
plt = visualize_predictions(G)
plt.show()`,
            after: `
**Output:** một graph network — mỗi node là một token candidate, edges nối token sinh trước với candidates kế tiếp. Probability đại diện bởi opacity hoặc thickness.

**Insight rút ra:**

- **Mỗi position có nhiều khả năng.** Khi model "sinh" "warm" → top alternatives có thể là "vibrant", "bright", "energetic" với probability gần nhau.
- **Greedy decoding** chỉ pick top-1 → mất diversity.
- **Sampling** (temperature, top-p) pick một trong top-k → output đa dạng hơn.
- **Beam search** explore nhiều path song song → tối ưu cumulative probability.

**Tại sao quan trọng:**

- Hiểu được LLM **không deterministic** ở runtime. Cùng prompt, 2 lần gọi với temp>0 → output khác.
- **Reasoning models** chính là khai thác này — explore nhiều paths trong "thinking", chọn best.
- Khi debug LLM behavior, biết "ở position X, model uncertain giữa Y và Z" giúp diagnose.

**OpenAI API support:** truyền \`logprobs=True\` + \`top_logprobs=5\` → response có top-5 candidates ở mỗi position. Useful cho confidence scoring, classification.
`
        },
        {
            title: "Bước 2 — Setup Colab cho Meeting Minutes",
            lang: "python",
            before: `
**Setup capstone.** Cần:
- Mount Google Drive (audio file lưu ở đó)
- Install transformers, datasets, ffmpeg
- Setup HF token
`,
            code: `# Mount Drive
from google.colab import drive
drive.mount('/content/drive')

# Install dependencies
!pip install -q transformers datasets accelerate bitsandbytes
!apt-get install -y ffmpeg    # Whisper cần ffmpeg để decode audio

# Setup HF token
from google.colab import userdata
import os
os.environ['HF_TOKEN'] = userdata.get('HF_TOKEN')

# Path đến audio file (upload lên Drive trước)
AUDIO_FILE = "/content/drive/MyDrive/llm-course/meeting.mp3"

# Check file tồn tại
print(f"File exists: {os.path.exists(AUDIO_FILE)}")
print(f"Size: {os.path.getsize(AUDIO_FILE) / 1e6:.1f} MB")`,
            after: `
**Mổ xẻ:**

- **\`drive.mount\`**: popup browser yêu cầu authorize (lần đầu mỗi session). Sau đó \`/content/drive/MyDrive\` là root Drive của bạn.
- **\`!apt-get install ffmpeg\`**: Whisper internally dùng ffmpeg để decode mp3/m4a/wav. Without it → error khi load audio.
- **Audio file size:** 1 giờ MP3 thường ~30-50 MB. Upload lên Drive trước qua web UI hoặc \`!gdown\`.

**Pattern Drive cho Tuần 3:**

\`\`\`
/content/drive/MyDrive/llm-course/
    ├── audio/                # input audio files
    ├── transcripts/          # output STT
    ├── summaries/            # output LLM
    └── models/               # cached models (LLaMA, Whisper)
\`\`\`

Cấu trúc folder rõ ràng → workflow tái sử dụng được, không re-download/re-process khi disconnect.
`
        },
        {
            title: "Bước 3 — Whisper transcribe audio thành text",
            lang: "python",
            before: `
**STT bằng Whisper.** Pipeline đơn giản nhưng hiệu quả. \`whisper-large-v3\` là model top-quality, nhưng ~3GB và chậm trên T4. \`whisper-medium\` (~1.5GB) thường đủ cho meeting (audio rõ tiếng).
`,
            code: `from transformers import pipeline
import torch

# Init pipeline (lần đầu download ~3GB)
asr = pipeline(
    "automatic-speech-recognition",
    model="openai/whisper-medium",        # hoặc whisper-large-v3 cho quality cao hơn
    torch_dtype=torch.float16,
    device="cuda",
    return_timestamps=True,
    chunk_length_s=30,                    # chia audio thành chunks 30s để fit memory
)

# Transcribe - có thể mất vài phút cho 1 giờ audio
print("Transcribing... ", end="", flush=True)
result = asr(AUDIO_FILE)
print("done!")

transcript = result["text"]
print(f"Transcript length: {len(transcript)} characters")
print(f"First 500 chars:")
print(transcript[:500])

# Save transcript
with open("/content/drive/MyDrive/llm-course/transcripts/meeting.txt", "w") as f:
    f.write(transcript)`,
            after: `
**Mổ xẻ:**

- **\`chunk_length_s=30\`**: Whisper context window là 30s. Audio dài hơn được chunk + stitch automatically. Critical cho long audio.
- **\`return_timestamps=True\`**: trả về cả \`chunks\` với timestamps. Có thể skip nếu chỉ cần text thuần.
- **\`torch_dtype=torch.float16\`**: FP16 tiết kiệm VRAM, accuracy không giảm đáng kể.

**Performance trên T4:**

- whisper-medium: ~1 phút audio = 5-10s xử lý → 1 giờ audio = 5-10 phút
- whisper-large-v3: ~2-3× chậm hơn

**Limitations cần biết:**

1. **Hallucination ở im lặng:** audio có pause >5s → có thể bịa text. Mitigate: \`condition_on_prev_tokens=False\` hoặc preprocess cắt silence
2. **Accent đặc biệt:** Whisper train chủ yếu trên accent Mỹ/Anh standard. Accent regional có thể tệ hơn
3. **No speaker diarization:** Whisper KHÔNG phân biệt ai đang nói. Cần tool ngoài như \`pyannote-audio\` cho "Speaker 1: ...", "Speaker 2: ..."
4. **Technical jargon:** model thường confuse domain-specific terms. Có thể prompt với \`initial_prompt="meeting về machine learning, ngôn ngữ: tiếng Việt"\` để guide
`
        },
        {
            title: "Bước 4 — LLM summarization với structured prompt",
            lang: "python",
            before: `
**Step 2: từ transcript → biên bản structured.**

Có 2 lựa chọn:
- **Cloud (GPT-4o)**: quality cao nhất, dễ dùng, $$ per call
- **Local (LLaMA 3.1 8B INT4)**: free, chạy trên T4, quality vẫn rất tốt

Day 5 demo local — tận dụng Tuần 3 quantization knowledge.
`,
            code: `from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

model_id = "meta-llama/Meta-Llama-3.1-8B-Instruct"

bnb = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_compute_dtype=torch.bfloat16)
tokenizer = AutoTokenizer.from_pretrained(model_id)
model = AutoModelForCausalLM.from_pretrained(model_id, quantization_config=bnb, device_map="auto")

# Structured prompt
system = """You are an assistant that produces structured meeting minutes from a transcript.

Output a markdown document with these sections:
## Summary (2-3 sentences overview)
## Attendees
## Key Decisions
## Action Items (with owner and deadline if mentioned)
## Open Questions
## Next Steps

Be concise. Focus on factual content; do not invent details."""

messages = [
    {"role": "system", "content": system},
    {"role": "user", "content": f"Generate meeting minutes from this transcript:\\n\\n{transcript}"}
]

prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
inputs = tokenizer(prompt, return_tensors="pt").to("cuda")

with torch.no_grad():
    outputs = model.generate(
        **inputs,
        max_new_tokens=1500,
        do_sample=False,                # deterministic - meeting minutes cần accurate
        pad_token_id=tokenizer.eos_token_id,
    )

new_tokens = outputs[0][inputs.input_ids.shape[1]:]
minutes = tokenizer.decode(new_tokens, skip_special_tokens=True)
print(minutes)`,
            after: `
**Mổ xẻ prompt design:**

- **System prompt structured:** liệt kê 6 sections rõ ràng. Model sẽ generate theo đúng format.
- **"Be concise":** important. Without explicit instruction, LLM tend to verbose.
- **"do not invent details":** anti-hallucination guard. Quan trọng cho document có legal weight (meeting minutes).
- **\`do_sample=False\`:** greedy decoding. Deterministic — cùng transcript → cùng output. Reproducible cho audit.

**Output mẫu:**

\`\`\`markdown
## Summary
Quarterly review meeting discussed Q1 performance, identifying revenue growth of 15%
while flagging concerns about engineering team capacity for Q2 roadmap.

## Attendees
- Sarah (CEO)
- John (CTO)
- Maria (Product Lead)

## Key Decisions
1. Hire 3 additional senior engineers in Q2
2. Postpone mobile app redesign to Q3
3. Increase marketing budget by 20%

## Action Items
- John: post job listings by Friday (March 8)
- Maria: prepare mobile redesign scope doc by Q3 planning
- Sarah: approve marketing budget proposal in next exec meeting
...
\`\`\`

**Cost comparison cho 1 giờ meeting:**

| Approach | Cost | Quality | Privacy |
|---|---|---|---|
| Whisper local + LLaMA 8B INT4 local | $0 + GPU time | Tốt | Hoàn toàn |
| Whisper local + GPT-4o cloud | $0.05 | Xuất sắc | Data đi cloud |
| AssemblyAI + GPT-4o full cloud | $0.20 | Xuất sắc | Data đi cloud |
| Otter.ai SaaS | $20/month subscription | Tốt | Data đi cloud |

Self-host local hoàn toàn miễn phí marginally — chỉ cần 1 GPU rental.
`
        },
        {
            title: "Bước 5 — Save final + wrap up Tuần 3",
            lang: "python",
            before: `
**Final step:** save kết quả lên Drive cho persistent.

Tổng kết: sau 5 dòng code (Step 3) + 10 dòng code (Step 4), đã có Meeting Minutes generator hoàn chỉnh. Production app chỉ cần thêm Gradio UI và scheduler.
`,
            code: `# Save minutes
output_path = "/content/drive/MyDrive/llm-course/summaries/meeting_minutes.md"
os.makedirs(os.path.dirname(output_path), exist_ok=True)

with open(output_path, "w") as f:
    f.write(minutes)

print(f"Saved to {output_path}")

# Hiển thị final
from IPython.display import Markdown, display
display(Markdown(minutes))`,
            after: `
**Wrap-up Tuần 3:**

Sau 5 days, bạn đã có:

✅ **Hub access:** browse, download, push model trên HF
✅ **Pipelines API:** 30+ task in 1 line
✅ **Tokenizers:** encode, chat template, debug tokenization issues
✅ **Low-level Transformers:** load custom, quantize 4-bit, inspect attention
✅ **Multi-modal pipeline:** STT → LLM → structured output

**So sánh trước/sau Tuần 3:**

| | Trước Tuần 3 | Sau Tuần 3 |
|---|---|---|
| Inference | Chỉ qua API cloud | Local + cloud |
| Models có thể dùng | ~10 frontier | 1M+ trên HF Hub |
| Cost mỗi inference | $0.001+ | $0 (sau setup) |
| Privacy | Data đi cloud | Hoàn toàn local |
| Customization | Prompt only | Quantize, swap component |

**Tuần 4 sẽ chuyển sang Model Selection** — biết bao nhiêu model rồi, **chọn model nào** cho task của mình? Benchmarks, leaderboards, eval pipelines.

**Tuần 5: RAG** — augment LLM với knowledge ngoài.

**Tuần 6-7: Fine-tuning** — biến model generic thành model chuyên biệt.

**Tuần 8: Agentic** — combine tất cả thành autonomous system.

Tuần 3 là **nền tảng kỹ thuật** cho mọi thứ sau.
`
        }
    ]
});
