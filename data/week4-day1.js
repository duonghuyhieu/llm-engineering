window.LESSONS = window.LESSONS || [];
window.LESSONS.push({
    week: 4,
    day: 1,
    title: "Model Selection Framework · Chinchilla Scaling Law · Benchmarks fundamentals",
    notebooks: [],
    topics: [
        "Day concept — không có lab",
        "7 tiêu chí chọn model cho production",
        "Chinchilla Scaling Law — quy luật P:D = 1:20",
        "Benchmark technical: MMLU, GPQA, HumanEval, HLE, AIME, SWE-Bench",
        "Limitations của benchmark: data contamination, overfitting, gaming",
        "Connect-4 leaderboard — eval thực dụng tự build"
    ],
    summary: `
## 1. Day 1 = concept day

Không có lab notebook. Day 1 thiết lập **framework lựa chọn model** sẽ dùng cho Day 3-4-5 (Code Generation showdown) và xuyên suốt khóa.

## 2. Khung 7 tiêu chí

Mỗi quyết định "dùng model nào" nên đi qua bộ câu hỏi này:

| Tiêu chí | Câu hỏi | Trade-off |
|---|---|---|
| **1. Capability** | Model có đủ giỏi cho task không? | Mạnh hơn = đắt hơn |
| **2. Cost** | Per-token, monthly, total cost ownership? | Cheaper = chậm/kém hơn |
| **3. Latency** | TTFT và TTLT user chấp nhận được? | Reasoning models chậm 5–10× |
| **4. Context window** | Đủ chứa data cần xử lý? | Lớn hơn = đắt hơn O(n²) |
| **5. License** | Commercial OK? Restriction nào? | Open-weight có license khác nhau |
| **6. Data privacy** | Data được gửi cloud không? | On-prem/local rất khác cloud |
| **7. Customization** | Cần fine-tune, system prompt đặc thù? | Frontier hạn chế, open-source tự do |

**Lỗi phổ biến:** chỉ chọn theo (1) capability mà bỏ qua (2)-(7). Production tốt cân bằng cả 7.

## 3. Chinchilla Scaling Law

Google DeepMind 2022 phát hiện: với compute budget cố định, model **nhỏ hơn + train nhiều data hơn** thường tốt hơn model lớn + ít data.

Quy luật: số parameter (P) và số token training (D) nên tỉ lệ ~1:20.
- Model 7B → cần ~140B tokens training
- Model 70B → cần ~1.4T tokens training

**Ý nghĩa quan trọng:** trước Chinchilla, "to là tốt" → train GPT-3 175B trên 300B token (under-trained). Sau Chinchilla → LLaMA train 'compute-optimal'.

**Tại sao "lỗi thời" nhưng vẫn quan trọng:**

- 2024+: cộng đồng phát hiện train **over-Chinchilla** (gấp 5-10× data) cho model nhỏ → kết quả vượt trội cho inference (LLaMA 3 train 15T tokens cho 8B)
- Mixture of Experts (MoE) phá vỡ luật ban đầu — tổng 600B params nhưng chỉ active 30B mỗi token
- Tuy nhiên ratio P:D vẫn là kim chỉ nam đánh giá model có 'undertrained' không

## 4. Benchmarks technical

| Benchmark | Đo gì | Top score |
|---|---|---|
| **MMLU** | General knowledge 57 môn | Top model >85% |
| **MMLU-Pro** | Khó hơn MMLU, 10 lựa chọn | Top >70% |
| **GPQA** | PhD-level science | Top >60% |
| **HumanEval** | Code generation Python | Top >90% |
| **HLE** | Humanity's Last Exam | Top <30% (rất khó) |
| **AIME** | Toán Olympics Mỹ | Top >70% |
| **MATH** | Toán university | Top >90% |
| **SWE-Bench** | Real-world code fix from GitHub | Top ~70% |

**Quy tắc thực tế:** không tin 1 benchmark duy nhất. Cross-check ít nhất 3, chọn theo task gần với use case của bạn.
`,
    callouts: [
        {
            type: "info",
            text: "**Mental model cho model selection:** Coi như tuyển dụng. CV (benchmark) chỉ là filter ban đầu. Phỏng vấn (custom eval với task của bạn) mới quyết định. Đừng tuyển ai chỉ vì điểm GPA cao."
        },
        {
            type: "warn",
            text: "**Benchmark inflation theo thời gian.** Mỗi thế hệ model 'top mọi benchmark'. Đừng bị marketing đánh lừa. Câu hỏi đúng: 'tốt hơn bao nhiêu cho task của tôi'."
        }
    ],
    keyPoints: [
        "**Benchmark là điểm khởi đầu, không phải kết luận.** Top MMLU không có nghĩa tốt cho task của bạn. Phải tự eval trên use case riêng.",
        "**P:D ratio 1:20 là baseline.** Model có ratio thấp hơn → likely undertrained. Cao hơn 1:50 → diminishing returns.",
        "**Data contamination khó loại trừ 100%.** Mitigate: tin LiveBench, contamination-free benchmarks.",
        "**MCQ vs free-form khác nhau lớn.** GPT có thể đạt 85% MMLU (MCQ) nhưng chỉ 50% free-form cùng nội dung.",
        "**LM Arena Elo là 'public sentiment'**, không phải 'objective truth'. User thiên về output dài, có structure, đẹp.",
        "**Mỗi domain có benchmark riêng.** Coding: SWE-Bench. Math: AIME. Long context: NIAH. Y tế: MedQA. Đừng so chéo."
    ],
    code: []
});
