window.LESSONS = window.LESSONS || [];
window.LESSONS.push({
    week: 4,
    day: 2,
    title: "Leaderboards · LM Arena · 3 Archetype use case thương mại",
    notebooks: [],
    topics: [
        "Day concept tiếp — không có lab",
        "6 leaderboard quan trọng và đặc điểm",
        "LM Arena blind testing — Elo từ crowd",
        "Cost vs Quality plot — Pareto frontier",
        "3 archetype: Automation, Augmentation, Agentic",
        "Industry-specific benchmarks (code, legal, medical, finance)",
        "Build internal leaderboard cho công ty"
    ],
    summary: `
## 1. Hệ sinh thái leaderboard

| Leaderboard | URL | Mục đích | Tin cậy |
|---|---|---|---|
| **Artificial Analysis** | artificialanalysis.ai | Intelligence vs Cost vs Speed | Cao — methodology công khai |
| **HF Open LLM Leaderboard** | huggingface.co/spaces/open-llm-leaderboard | Open-source models | Trung — bị contamination, gaming |
| **Vellum** | vellum.ai/llm-leaderboard | Cost-quality cho production | Cao — focus enterprise |
| **SEAL** (Scale AI) | scale.com/leaderboard | Private prompts, expert curated | Cao — không bị contamination |
| **LiveBench** | livebench.ai | Câu hỏi mới mỗi tháng | Cao — anti-contamination by design |
| **LM Arena** | chat.lmsys.org | Chatbot Arena Elo từ user | Cao — blind, crowdsourced |

Quy tắc khi đọc:
- Single number ("MMLU 85%") → cẩn thận, có thể bị game
- Curve trade-off (cost vs quality) → tin hơn
- Multiple benchmarks composite → tin nhất

## 2. Pareto Frontier

Trên chart Cost (X) vs Intelligence (Y):
- **Pareto frontier**: model nằm trên đường cong — best in class cho mức cost của nó
- **Phía dưới frontier**: quality kém hơn so với cost — tránh

Phân vùng điển hình 2024-2025:
- **Low cost, low quality**: GPT-4o-mini, Claude Haiku, Gemini Flash, Phi-3
- **Mid cost, mid-high quality**: GPT-4.1, Claude Sonnet, Gemini Pro
- **High cost, top quality**: GPT-5, Claude 4.5 Opus, o3, Gemini 2.5 Pro

## 3. LM Arena — blind testing

Cách hoạt động:
1. User vào chat.lmsys.org gõ prompt
2. Hệ thống chọn 2 model ẩn danh (Model A, Model B)
3. User nhận 2 output, vote 'A wins', 'B wins', 'Tie', 'Both bad'
4. Elo rating cập nhật giống cờ vua

Sau hàng triệu lượt vote, có Elo cho ~150 models. Top model hiện ~1400+, bottom ~800.

**Ưu điểm:** không game được (model không biết đang test), real-world preference, đa task.

**Hạn chế:** length bias (output dài hay win), self-selection (người vote là tech-savvy), khó break down theo task.

## 4. 3 Archetype use case thương mại

| Archetype | Định nghĩa | LLM role | Risk |
|---|---|---|---|
| **Automation** | Thay thế human cho task lặp lại | "Worker" theo flow định sẵn | Thấp |
| **Augmentation** | Tăng tốc human, vẫn cần review | "Assistant" — đề xuất, human duyệt | Trung |
| **Agentic** | Hệ tự chủ multi-step | "Agent" — quyết định và thực thi | Cao |

**Quy tắc:** sai sót trong Automation (vd phân loại sai 1%) thường accept. Sai sót trong Agentic (đặt nhầm chuyến bay) — không.

## 5. Industry-specific benchmarks

| Domain | Benchmark |
|---|---|
| Coding | SWE-Bench, HumanEval, MBPP, BigCodeBench, LiveCodeBench |
| Legal | LegalBench, CaseHOLD |
| Medical | MedQA, MedMCQA, USMLE |
| Finance | FinQA, FinanceBench |
| Math | MATH, GSM8K, AIME |
| Long context | NIAH (Needle-in-a-Haystack), RULER |
| Multilingual | MGSM, XCOPA, FLORES |

Một model hạng top general có thể trung bình cho domain hẹp. **Luôn cross-check.**
`,
    callouts: [
        {
            type: "info",
            text: "**Mental model cho leaderboard:** Coi như review trên Amazon. Vài nghìn review tốt → đáng tin hơn 1 điểm 5 sao đơn lẻ. Tổng hợp nhiều leaderboard → bức tranh đầy đủ hơn 1 con số."
        },
        {
            type: "warn",
            text: "**Bias formatting trong LM Arena.** Output dài, có heading, có bullet → user vote nhiều hơn dù chưa chắc đúng hơn. Nếu model nội bộ output thuần ngắn gọn, đừng so trực tiếp với 'verbose' model trên Arena."
        }
    ],
    keyPoints: [
        "**Không tin một leaderboard duy nhất.** Cross-check ít nhất 3: LM Arena (preference), Artificial Analysis (cost-quality), domain-specific.",
        "**Pareto frontier > absolute score.** 'Best model' ít nghĩa hơn 'best per dollar'. GPT-4.1-mini có thể đạt 95% performance của GPT-5 với 5% cost.",
        "**Reasoning model không phải lúc nào trên Pareto frontier.** Cho summarization/classification, chat model thường win.",
        "**Archetype quyết định approach.** Automation cần model nhỏ + structured output. Agentic cần reasoning + tool use mạnh.",
        "**LM Arena Elo có ceiling effect.** Model trên 1300 Elo gần tương đương về preference. Chênh 10-20 Elo ít ý nghĩa thực tế.",
        "**Internal eval bắt buộc cho production.** Public benchmark chỉ là sàng lọc — quyết định cuối luôn dựa eval trên data của bạn."
    ],
    code: []
});
