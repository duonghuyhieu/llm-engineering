window.LESSONS = window.LESSONS || [];
window.LESSONS.push({
    week: 3,
    day: 2,
    title: "HuggingFace Pipelines API · 30+ task built-in · Multi-modal in 1 line",
    notebooks: [],
    topics: [
        "Pipelines API — high-level abstraction của HF",
        "3 cấp độ abstraction: Pipelines → AutoModel → Raw PyTorch",
        "13 task phổ biến: sentiment, NER, Q&A, summarization, translation",
        "Pipeline cho multi-modal: image, audio, diffusion",
        "Zero-shot classification — phân loại không cần training",
        "Khi nào pipeline đủ · khi nào cần xuống low-level"
    ],
    summary: `
## 1. 3 cấp độ abstraction trong HF

| Cấp độ | API | Khi nào dùng |
|---|---|---|
| **High** | \`pipeline("task", model=...)\` | Inference đơn giản, prototype, demo |
| **Mid** | \`AutoModel.from_pretrained() + AutoTokenizer\` | Batch, custom decoding, fine-tune |
| **Low** | Raw PyTorch / Tensor ops | Research, custom architecture |

## 2. Pipelines — 'magic' high-level

Một pipeline gói cả 3 bước inference vào 1 dòng:

\`\`\`
text → [tokenize] → [model forward] → [decode/post-process] → result
\`\`\`

Bạn không cần biết tokenizer là gì, model output shape ra sao. Chỉ cần:

\`\`\`python
classifier = pipeline("sentiment-analysis")
classifier("I love this!")
# → [{'label': 'POSITIVE', 'score': 0.99}]
\`\`\`

HF có ~30 task được định nghĩa sẵn. Mỗi task có default model và schema input/output cố định.

## 3. 13 task quan trọng

| Task | Input | Output | Model điển hình |
|---|---|---|---|
| \`sentiment-analysis\` | text | label + score | DistilBERT |
| \`ner\` | text | entities list | BERT-NER |
| \`question-answering\` | (context, question) | answer + span | BERT-SQuAD |
| \`summarization\` | text dài | text ngắn | BART, T5 |
| \`translation\` | text src lang | text tgt lang | Helsinki, NLLB |
| \`text-generation\` | prompt | completion | GPT, LLaMA |
| \`zero-shot-classification\` | (text, candidates) | label scores | BART-MNLI |
| \`image-classification\` | image | labels | ViT, ResNet |
| \`object-detection\` | image | boxes + labels | DETR |
| \`automatic-speech-recognition\` | audio | text | Whisper |
| \`text-to-image\` | text | image | Stable Diffusion |
| \`text-to-speech\` | text | audio | SpeechT5 |
| \`fill-mask\` | text với [MASK] | predictions | BERT |
`,
    callouts: [
        {
            type: "info",
            text: "**Mental model cho 3 cấp abstraction:** Pipeline = Photoshop với preset (1-click). AutoModel = Photoshop với layers (control sâu). Raw PyTorch = vẽ bằng tay từng pixel (research). Đa số dùng layer 1–2."
        },
        {
            type: "warn",
            text: "**Đừng load lại model mỗi request.** \`pipeline()\` tải model vào VRAM mất 5–30s. Trong web app, init pipeline 1 lần ở startup, reuse cho mọi request. Pattern singleton."
        }
    ],
    keyPoints: [
        "**Pipelines = 'curl' của ML.** Quick, dirty, 1-liner. Khi prototype xong, biết bài toán, mới chuyển xuống AutoModel.",
        "**Mỗi task có default model có thể không tối ưu.** \`pipeline('sentiment-analysis')\` mặc định DistilBERT-SST2 — chỉ tiếng Anh.",
        "**Zero-shot classification thay thế fine-tune cho ~70% use case.** Trước khi nghĩ fine-tune, thử zero-shot và few-shot prompting.",
        "**Pipeline KHÔNG stream.** Nếu cần stream (UI live), phải tự dùng \`model.generate\` với \`TextIteratorStreamer\`.",
        "**\`device='cuda'\` hoặc \`device=0\`.** Pipeline không tự dùng GPU, phải khai báo explicit.",
        "**Batch size phụ thuộc VRAM.** Trên T4 16GB: model 7B FP16 → batch=1-2. Trên A100 40GB: batch 8-16."
    ],
    code: [
        {
            title: "Bước 1 — Sentiment analysis: 'hello world' của pipelines",
            lang: "python",
            before: `
**Pipeline đơn giản nhất.** Phân loại tích cực/tiêu cực — task NLP cổ điển. Default model DistilBERT fine-tuned trên SST-2.

Setup từ Day 1 đã có. Bắt đầu ngay với pipeline.
`,
            code: `from transformers import pipeline

# Tạo pipeline - lần đầu download model (~250MB)
classifier = pipeline("sentiment-analysis", device="cuda")

# Inference
result = classifier("I love this course!")
print(result)
# [{'label': 'POSITIVE', 'score': 0.9998}]

# Batch input
results = classifier([
    "I love this course!",
    "This is terrible",
    "It's okay, I guess",
])
print(results)
# [{'label': 'POSITIVE', 'score': 0.9998},
#  {'label': 'NEGATIVE', 'score': 0.9994},
#  {'label': 'POSITIVE', 'score': 0.61}]    # ← "okay" được model coi là slightly positive`,
            after: `
**Mổ xẻ:**

- \`pipeline("sentiment-analysis")\`: HF tự chọn default model (DistilBERT trên SST-2)
- \`device="cuda"\`: dùng GPU. Nếu không truyền → CPU (chậm hơn ~10×)
- Input: string hoặc list of strings (auto-batch)
- Output: list of dict với \`label\` và \`score\`

**Output đáng chú ý:**
- "It's okay" → POSITIVE với confidence chỉ 0.61. Model **không có** category "neutral" → mô hình bị forced binary. **Limitation cần biết** khi dùng default.

**Pattern thực tế:** với task production cần "neutral" → dùng model 3-class như \`cardiffnlp/twitter-roberta-base-sentiment-latest\`:

\`\`\`python
classifier = pipeline("sentiment-analysis",
                      model="cardiffnlp/twitter-roberta-base-sentiment-latest",
                      device="cuda")
\`\`\`

**Lesson:** default model là khởi đầu. Đọc model card và pick model phù hợp domain (Twitter, finance, healthcare đều có model riêng).
`
        },
        {
            title: "Bước 2 — Named Entity Recognition (NER): extract entities",
            lang: "python",
            before: `
**NER** = identify person, organization, location, date... trong text. Cực hữu ích cho:
- Extract data từ news/document
- Anonymize PII trước khi gửi LLM
- Build knowledge graph
`,
            code: `ner = pipeline("ner", grouped_entities=True, device="cuda")

text = "Edward Donner founded Nebula AI in San Francisco in 2018."
entities = ner(text)

for entity in entities:
    print(f"{entity['entity_group']}: {entity['word']} (score: {entity['score']:.3f})")

# Output:
# PER: Edward Donner (score: 0.998)
# ORG: Nebula AI (score: 0.992)
# LOC: San Francisco (score: 0.999)`,
            after: `
**\`grouped_entities=True\`** — quan trọng. Không có flag này, model trả từng token riêng:

\`\`\`
PER: Edward    (B-PER)
PER: Donner    (I-PER)
ORG: Nebula    (B-ORG)
ORG: AI        (I-ORG)
\`\`\`

(B-PER = beginning, I-PER = inside — chuẩn BIO tagging). Với \`grouped_entities=True\`, model auto-merge thành entity spans.

**Entity types thường gặp:**
- \`PER\` — person
- \`ORG\` — organization
- \`LOC\` — location
- \`MISC\` — miscellaneous

**Use case practical:** trước khi gửi user input cho LLM cloud, run NER local → mask PII (tên, địa chỉ, email) → gửi version anonymized → privacy compliance.
`
        },
        {
            title: "Bước 3 — Question Answering trên context",
            lang: "python",
            before: `
**QA** task: cho 1 đoạn context + 1 câu hỏi → model extract câu trả lời (span) trong context.

Khác với generative LLM: QA model **không tự nghĩ** ra answer — chỉ trích từ context. An toàn hơn (không hallucinate), nhưng giới hạn (cần có answer trong context).
`,
            code: `qa = pipeline("question-answering", device="cuda")

context = """
Edward Donner is the co-founder and CTO of Nebula AI, an AI startup focused on
talent matching and HR technology. He has over 25 years of experience in software
engineering and has worked at various companies including JP Morgan.
"""

question = "Where does Edward Donner work?"
result = qa(question=question, context=context)
print(result)
# {'score': 0.94, 'start': 50, 'end': 60, 'answer': 'Nebula AI'}

question = "How many years of experience does Edward have?"
result = qa(question=question, context=context)
print(result)
# {'score': 0.99, 'start': 138, 'end': 155, 'answer': '25 years'}`,
            after: `
**Mổ xẻ output:**

- \`answer\`: text được extract
- \`score\`: confidence
- \`start\`, \`end\`: character offset trong context — để highlight trong UI

**Khi nào dùng QA pipeline thay vì LLM:**
- ✅ Context dài, answer thực sự *có* trong text
- ✅ Cần answer chính xác từ source (no paraphrase)
- ✅ Anti-hallucination strict
- ✅ Latency thấp, cost free (chạy local)

**Khi nào dùng LLM:**
- Cần reasoning đa bước, suy luận
- Context complex, answer cần synthesize từ nhiều phần
- Cần generate natural language reply

**Pattern hybrid:** RAG dùng vector search lấy chunk → BERT-QA extract answer ngắn → LLM viết câu trả lời natural. Best of both worlds.
`
        },
        {
            title: "Bước 4 — Zero-shot classification: phân loại không cần fine-tune",
            lang: "python",
            before: `
**Phép màu lớn nhất của transformers.** Phân loại text vào **bất kỳ** taxonomy do bạn định nghĩa runtime, không cần fine-tune.

Cách hoạt động: model BART được fine-tune trên NLI (Natural Language Inference). Khi bạn đưa text + candidate labels, model reframe thành: "Is this text about \\<label\\>?" → entail/contradict score.
`,
            code: `classifier = pipeline("zero-shot-classification",
                       model="facebook/bart-large-mnli",
                       device="cuda")

# Phân loại 1 review vào taxonomy custom
text = "I just got a new MacBook Pro and it runs Llama 70B locally!"
candidate_labels = ["technology", "food", "sports", "politics", "entertainment"]

result = classifier(text, candidate_labels)
print(result)
# {
#   'sequence': 'I just got a new MacBook Pro...',
#   'labels': ['technology', 'entertainment', 'sports', 'politics', 'food'],
#   'scores': [0.978, 0.012, 0.005, 0.003, 0.002]
# }`,
            after: `
**Lưu ý:** labels được **sort theo score** giảm dần, không theo order bạn pass in. Top-1 label = \`result['labels'][0]\`.

**Power của zero-shot:**
- Đổi taxonomy chỉ bằng đổi \`candidate_labels\`
- Không cần training data
- Không cần fine-tune
- Tốc độ inference giống chat model bình thường

**Use cases practical:**
- Email routing (urgent / billing / support / spam)
- Content moderation (acceptable / borderline / violation)
- Intent classification cho chatbot (booking / cancel / info / complaint)
- Topic tagging cho articles

**Limitation:**
- Score absolute không đáng tin (chỉ relative ranking)
- Performance giảm khi labels >10 (model phải so với từng cái)
- Tiếng Anh tốt nhất; ngôn ngữ khác cần multilingual variant như \`MoritzLaurer/mDeBERTa-v3-base-mnli-xnli\`
`
        },
        {
            title: "Bước 5 — Text generation: chạy LLM local qua pipeline",
            lang: "python",
            before: `
**LLM cũng là một pipeline.** Khác với task NLP cổ điển (đầu vào fixed structure), text-generation **autoregressive** — sinh token by token.

Phổ biến: chạy Llama-3.2-3B-Instruct hoặc Phi-3-mini-4k-instruct trên T4.
`,
            code: `from transformers import pipeline
import torch

generator = pipeline(
    "text-generation",
    model="microsoft/Phi-3-mini-4k-instruct",
    torch_dtype=torch.bfloat16,
    device_map="auto",   # tự distribute layers giữa GPU/CPU nếu cần
)

# Format messages chuẩn chat
messages = [
    {"role": "system", "content": "You are a friendly Vietnamese tutor."},
    {"role": "user", "content": "Dạy tôi 5 từ tiếng Việt cơ bản"},
]

output = generator(
    messages,
    max_new_tokens=200,
    do_sample=True,
    temperature=0.7,
)
print(output[0]['generated_text'][-1])   # message cuối là assistant reply`,
            after: `
**Mổ xẻ:**

- \`device_map="auto"\`: Accelerate library tự decide layers nào trên GPU, nào trên CPU. Quan trọng cho model lớn không fit hoàn toàn vào VRAM.
- \`messages\` format giống OpenAI Chat Completions — HF tokenizer apply chat template tự động (Day 3 sẽ học)
- \`max_new_tokens\`: limit output length
- \`do_sample=True\` + \`temperature=0.7\`: random sampling thay vì greedy

**Output structure:**

\`\`\`python
[{
    'generated_text': [
        {"role": "system", "content": "..."},
        {"role": "user", "content": "..."},
        {"role": "assistant", "content": "Chào bạn! 5 từ cơ bản: 1. Xin chào (hello)..."}
    ]
}]
\`\`\`

**Tại sao return cả conversation history:** HF designed để dễ chain (continue conversation by append next user message).

**Reuse pipeline:** generator này ở RAM. Mọi call sau dùng cùng model — không reload. Nếu kill kernel → mất, phải reload.
`
        },
        {
            title: "Bước 6 — Multi-modal: speech-to-text với Whisper",
            lang: "python",
            before: `
**Whisper** từ OpenAI là model STT open-source phổ biến nhất. Multilingual (~99 ngôn ngữ), chạy local được, free.

Pipelines wrap Whisper trong 1 dòng. Cần upload file audio (mp3/wav) lên Colab.
`,
            code: `from transformers import pipeline

asr = pipeline(
    "automatic-speech-recognition",
    model="openai/whisper-large-v3",
    torch_dtype=torch.float16,
    device="cuda",
)

# Transcribe audio file
result = asr("/content/meeting_recording.mp3", return_timestamps=True)
print(result["text"])

# Có timestamps để build subtitle
for chunk in result["chunks"]:
    start = chunk["timestamp"][0]
    end = chunk["timestamp"][1]
    text = chunk["text"]
    print(f"[{start:.1f}s - {end:.1f}s] {text}")

# Output:
# [0.0s - 3.2s]  Welcome to the meeting today.
# [3.2s - 8.5s]  Let's start with the quarterly review.
# ...`,
            after: `
**Mổ xẻ:**

- \`whisper-large-v3\`: 1.5B params, top quality. Variants nhỏ hơn cho speed: \`whisper-medium\`, \`whisper-small\`, \`whisper-base\`, \`whisper-tiny\` (39M, mobile-ready)
- \`return_timestamps=True\`: extra metadata để biết khi nào câu nào được nói. Dùng để build subtitle, hoặc index audio.
- Input: file path (\`str\`), numpy array, hoặc URL

**Multilingual:** Whisper auto-detect ngôn ngữ. Nếu muốn force, truyền \`generate_kwargs={"language": "vietnamese"}\`.

**Performance trên T4:**
- 1 phút audio → ~5s xử lý
- 1 giờ audio → ~5 phút xử lý

**Pitfall:** Whisper hallucinate khi audio im lặng dài (bịa text). Pre-process: cắt silence trước khi feed, hoặc dùng VAD (voice activity detection).

**Day 5 sẽ ráp Whisper + LLM thành Meeting Minutes app.**
`
        }
    ]
});
