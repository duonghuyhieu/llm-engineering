window.LESSONS = window.LESSONS || [];
window.LESSONS.push({
    week: 5,
    day: 4,
    title: "RAG Evaluation · MRR · nDCG · LLM-as-Judge · Golden dataset",
    notebooks: ["week5/day4.ipynb"],
    topics: [
        "Vì sao evaluation quan trọng hơn architecture",
        "Golden test dataset với 7 categories",
        "Retrieval metrics: MRR, nDCG, keyword coverage",
        "Answer metrics: accuracy, completeness, relevance",
        "LLM-as-Judge với structured output (Pydantic)",
        "Iterate pipeline dựa trên eval scores"
    ],
    summary: `
## 1. Day 4 - Evaluation matters most

Edward emphasize: "People focus on RAG architecture và frameworks. **Even more important: evaluations!**"

Without eval, không biết:
- RAG có thực sự work tốt hơn no-RAG?
- Chunking strategy A vs B — cái nào tốt hơn?
- Top-k=4 hay k=10 — optimum?
- Có cần re-rank không?

Eval pipeline = **scientific method cho RAG**.

## 2. Golden test dataset

\`evaluation/test.py\` của khóa cung cấp 150 test cases curated:

\`\`\`
TestCase(
    question="Who won the prestigious IIOTY award in 2023?",
    category="direct_fact",
    reference_answer="Maxine Thompson won the prestigious Insurellm Innovator of the Year (IIOTY) award in 2023.",
    keywords=['Maxine', 'Thompson', 'IIOTY'],
)
\`\`\`

**7 categories** trong test set:

| Category | Count | Description |
|---|---|---|
| direct_fact | 70 | Câu hỏi simple, 1 fact |
| temporal | 20 | Câu hỏi về thời gian, date |
| spanning | 20 | Cần multiple chunks để trả lời |
| comparative | 10 | So sánh 2 entity |
| numerical | 10 | Câu hỏi về số |
| relationship | 10 | Quan hệ giữa entities |
| holistic | 10 | Câu hỏi general, big picture |

**Tại sao đa dạng category quan trọng:**

RAG có thể giỏi direct_fact nhưng tệ spanning. Trung bình eval che dấu pattern này. Per-category eval reveal weakness.

## 3. Retrieval metrics

**Tách biệt eval retrieval với eval answer.** Lỗi mỗi stage khác:
- Retrieval fail: chunk đúng không trong top-k
- Generation fail: chunks đúng nhưng LLM trả lời sai

**3 metrics retrieval:**

| Metric | Định nghĩa | Khi nào dùng |
|---|---|---|
| **MRR** (Mean Reciprocal Rank) | trung bình 1/rank của doc đúng đầu tiên | Q&A: chỉ cần 1 doc đúng |
| **nDCG** (Normalized Discounted Cumulative Gain) | weighted ranking quality | Research: cần ranking tốt |
| **Keyword coverage** | % keywords expected có trong context | Sanity check |

## 4. Answer metrics

**LLM-as-Judge** đánh giá 3 dimensions:

| Metric | Scale | Định nghĩa |
|---|---|---|
| **Accuracy** | 1-5 | Có đúng facts không? |
| **Completeness** | 1-5 | Có cover toàn bộ aspects? |
| **Relevance** | 1-5 | Có liên quan câu hỏi? |

Output structured với Pydantic → parse dễ, aggregate được.

## 5. Pattern eval + iterate

\`\`\`
Build baseline RAG
   ↓
Run eval on 150 cases
   ↓
Aggregate scores
   ↓
Identify weakness (which category? retrieval or answer?)
   ↓
Fix → re-run eval → compare scores
   ↓ (loop)
\`\`\`

Đây là **scientific iteration**, không phải "vibe coding".
`,
    callouts: [
        {
            type: "info",
            text: "**Mental model cho RAG eval:** Coi như chấm thi. Có 2 phần thi (retrieval + generation), mỗi phần có rubric riêng. Tổng điểm là tổng hợp 2 phần. Đề thi cố định (golden set) để so sánh giữa các 'thí sinh' (model/config) công bằng."
        },
        {
            type: "warn",
            text: "**LLM-as-Judge cần calibration.** Đo agreement với human judges trên ~50 ví dụ. Nếu Cohen's kappa < 0.6 → judge không đáng tin, cần prompt tốt hơn."
        }
    ],
    keyPoints: [
        "**Eval retrieval và generation tách biệt.** Lỗi rất khác nhau, fix khác nhau.",
        "**MRR và nDCG cho 2 use case khác nhau.** Q&A đơn → MRR. Research multi-doc → nDCG.",
        "**Faithfulness > Relevance.** Answer hay nhưng không grounded = nguy hiểm. Production cần faithfulness ≥ 4/5 trước khi care relevance.",
        "**Pydantic + structured output** giảm parsing bug 99%. Đừng tự parse string từ LLM judge.",
        "**Golden dataset là one-time investment.** 1 ngày build, dùng nhiều tháng. ROI cao nhất.",
        "**Per-category breakdown reveal pattern.** Trung bình che dấu weakness — phải drill down."
    ],
    code: [
        {
            title: "Bước 1 — Load test dataset 150 cases",
            lang: "python",
            before: `
**\`evaluation/test.py\`** module của khóa load 150 test cases pre-built. Pattern này (golden dataset) cần invest 1 lần — pay-off nhiều tháng.

Mỗi \`TestCase\` là Pydantic model với question + reference_answer + keywords + category.
`,
            code: `from evaluation import test
from collections import Counter

tests = test.load_tests()
print(f"Total: {len(tests)} test cases")

# Inspect 1 case
example = tests[0]
print(f"Q: {example.question}")
print(f"Category: {example.category}")
print(f"Reference: {example.reference_answer}")
print(f"Keywords: {example.keywords}")
# Q: Who won the prestigious IIOTY award in 2023?
# Category: direct_fact
# Reference: Maxine Thompson won the prestigious Insurellm Innovator of the Year (IIOTY) award in 2023.
# Keywords: ['Maxine', 'Thompson', 'IIOTY']

# Distribution by category
count = Counter([t.category for t in tests])
print(count)
# Counter({'direct_fact': 70, 'temporal': 20, 'spanning': 20,
#          'comparative': 10, 'numerical': 10, 'relationship': 10, 'holistic': 10})`,
            after: `
**Mổ xẻ TestCase:**

- **\`question\`**: input cho RAG system
- **\`category\`**: phân loại để per-category eval
- **\`reference_answer\`**: golden answer — LLM-as-Judge so sánh
- **\`keywords\`**: list từ phải có trong context để answer đúng

**Tại sao 4 field này:**

1. **Question + reference**: classic test case input + expected output
2. **Category**: enable per-category breakdown
3. **Keywords**: enable retrieval check (không cần LLM-as-Judge cho retrieval — chỉ check keywords có trong retrieved chunks)

**Distribution analysis:**

- Direct_fact dominant (70/150 = 47%) — đại đa số queries thực tế là simple lookups
- Spanning + comparative + holistic (40/150 = 27%) — multi-chunk reasoning
- Edge cases (temporal, numerical, relationship) đủ representation để test

**Build golden dataset cho company của bạn:**

1. **Sample**: lấy 100-500 query thực từ production logs
2. **Annotate**: human pick chunk đúng và viết expected answer
3. **Categorize**: tag với category meaningful cho domain
4. **Review**: peer review để giảm bias
5. **Versioning**: lưu version, không thay đổi sau khi baseline

ROI: 1 tuần work → eval reuse cho mọi RAG iteration tiếp theo.
`
        },
        {
            title: "Bước 2 — Evaluate retrieval: MRR, nDCG, keyword coverage",
            lang: "python",
            before: `
**\`evaluate_retrieval()\`** chạy retrieval cho 1 test case, đo 3 metrics.

Function wrap logic:
1. Embed question → search vectorstore → top-k chunks
2. Check chunks có chứa keywords expected
3. Compute MRR (rank của first relevant chunk)
4. Compute nDCG (weighted ranking quality)
`,
            code: `from evaluation.eval import evaluate_retrieval

# Evaluate 1 test case
result = evaluate_retrieval(example)
print(result)
# RetrievalEval(
#   mrr=0.16666666666666666,
#   ndcg=0.28711770538226206,
#   keywords_found=2,
#   total_keywords=3,
#   keyword_coverage=66.66666666666666
# )`,
            after: `
**Mổ xẻ scores:**

**MRR = 0.167**:
- Reciprocal Rank = 1/rank của chunk đúng đầu tiên
- 1/1 = 1.0 (chunk đúng ở vị trí 1) — ideal
- 1/2 = 0.5 (vị trí 2)
- 1/6 = 0.167 (vị trí 6) — chunk đúng ở vị trí 6 trong top-k

→ Score 0.167 = chunk có keywords ở vị trí 6. Retrieval không tốt — relevant chunk không đứng đầu.

**nDCG = 0.287**:
- Discounted Cumulative Gain — weighted theo position
- Top 1 nặng nhất, top 10 nhẹ nhất
- Normalize / IDCG (ideal case)
- 1.0 = perfect ranking, 0 = no relevant in top-k

→ Score 0.287 = ranking quality ~30% so với ideal. Bad ranking.

**Keyword coverage = 66.7%**:
- 2/3 keywords (Maxine, Thompson, IIOTY) found trong retrieved chunks
- Missing 1 → có thể là chunk khác chứa keyword đó

**Insight:**

MRR và nDCG đều thấp + 1 keyword miss → retrieval **fail cho test case này**. Có 2 fix:

1. **Tăng k**: \`as_retriever(search_kwargs={"k": 20})\` → bắt được chunk đúng
2. **Re-rank** (Day 5): retrieve k=20, rerank top-3 → chunk đúng nhảy lên
3. **Better embedding**: thử \`text-embedding-3-large\` thay \`all-MiniLM-L6-v2\`
4. **Hybrid search**: combine vector + BM25 → match keyword \`IIOTY\` (unique acronym)
`
        },
        {
            title: "Bước 3 — Evaluate answer: LLM-as-Judge với structured output",
            lang: "python",
            before: `
**\`evaluate_answer()\`** chạy end-to-end RAG, đánh giá answer.

Bên trong: gọi LLM-as-Judge với prompt template + Pydantic schema → trả structured score.
`,
            code: `from evaluation.eval import evaluate_answer

eval_result, answer, chunks = evaluate_answer(example)
print(eval_result)
# AnswerEval(
#   feedback="The answer correctly identifies Maxine as the winner and mentions the IIOTY award in 2023,
#             but it omits Thompson's full name, which is present in the reference. This affects completeness.
#             The relevance is high, as it directly addresses the question about the award winner.",
#   accuracy=5.0,
#   completeness=4.0,
#   relevance=5.0,
# )

# Inspect detailed feedback
print(eval_result.feedback)
print(f"Accuracy: {eval_result.accuracy}")
print(f"Completeness: {eval_result.completeness}")
print(f"Relevance: {eval_result.relevance}")`,
            after: `
**Mổ xẻ scores:**

- **Accuracy = 5/5**: facts đúng — "Maxine" identified, "IIOTY 2023" mention chính xác
- **Completeness = 4/5**: missing "Thompson" (last name)
- **Relevance = 5/5**: trực tiếp address câu hỏi "who won"

**Feedback dạng natural language** từ LLM-as-Judge cực hữu ích cho debug:

> "omits Thompson's full name, which is present in the reference"

Đọc feedback → biết exactly gì miss. Có thể adjust:
- System prompt: "Provide full names when available"
- Retriever: lấy thêm chunks (có chunk khác chứa Thompson)
- Chunk size: lớn hơn để chunk cover full name + first name + award

**LLM-as-Judge implementation đằng sau:**

\`\`\`python
class AnswerEval(BaseModel):
    feedback: str = Field(description="Detailed feedback in 1-2 sentences")
    accuracy: float = Field(ge=1, le=5)
    completeness: float = Field(ge=1, le=5)
    relevance: float = Field(ge=1, le=5)

def evaluate_answer(test_case):
    # 1. Run RAG để lấy answer
    answer, chunks = run_rag_pipeline(test_case.question)

    # 2. LLM-as-Judge compare answer vs reference
    judge_prompt = f"""Compare answer with reference:
Question: {test_case.question}
Reference: {test_case.reference_answer}
Answer: {answer}

Rate 1-5: accuracy, completeness, relevance."""

    response = openai.beta.chat.completions.parse(
        model="gpt-4o-2024-08-06",
        messages=[{"role": "user", "content": judge_prompt}],
        response_format=AnswerEval,
    )
    return response.choices[0].message.parsed, answer, chunks
\`\`\`

**Pydantic schema** ensures output format — không bao giờ parse fail.
`
        },
        {
            title: "Bước 4 — Eval pipeline đầy đủ trên 150 cases",
            lang: "python",
            before: `
**Scale up:** run eval cho cả 150 test cases, aggregate scores per-category.

Pattern này produce **eval dashboard** — biết RAG strong/weak ở đâu.
`,
            code: `# Pseudocode framework (logic actual trong evaluation/eval.py)

from collections import defaultdict
import statistics

# Run eval cho tất cả test cases
results = []
for test_case in tests:
    retrieval_eval = evaluate_retrieval(test_case)
    answer_eval, answer, chunks = evaluate_answer(test_case)
    results.append({
        'test_case': test_case,
        'retrieval': retrieval_eval,
        'answer': answer_eval,
    })

# Aggregate per-category
by_category = defaultdict(list)
for r in results:
    by_category[r['test_case'].category].append(r)

# Print summary
print(f"{'Category':<15} {'N':>3} {'MRR':>6} {'nDCG':>6} {'Acc':>4} {'Comp':>4} {'Rel':>4}")
for category, items in by_category.items():
    n = len(items)
    mrr = statistics.mean(r['retrieval'].mrr for r in items)
    ndcg = statistics.mean(r['retrieval'].ndcg for r in items)
    acc = statistics.mean(r['answer'].accuracy for r in items)
    comp = statistics.mean(r['answer'].completeness for r in items)
    rel = statistics.mean(r['answer'].relevance for r in items)
    print(f"{category:<15} {n:>3} {mrr:>6.2f} {ndcg:>6.2f} {acc:>4.1f} {comp:>4.1f} {rel:>4.1f}")`,
            after: `
**Output mẫu:**

\`\`\`
Category         N    MRR   nDCG   Acc Comp  Rel
direct_fact      70  0.78   0.81  4.6  4.4  4.7
temporal         20  0.65   0.72  4.2  4.0  4.5
spanning         20  0.42   0.58  3.5  3.0  4.1   ← yếu
comparative      10  0.51   0.64  3.8  3.3  4.2
numerical        10  0.55   0.68  3.7  3.4  4.0
relationship     10  0.45   0.62  3.6  3.2  4.0   ← yếu
holistic         10  0.38   0.54  3.4  2.9  4.1   ← yếu
\`\`\`

**Per-category breakdown reveal pattern:**

**RAG strong on direct_fact, weak on holistic/spanning/relationship.**

Lý do:
- **Direct_fact**: 1 fact đơn lẻ, dễ retrieve chunk + extract answer
- **Spanning**: cần multiple chunks → top-k=4 không đủ
- **Relationship**: cần hiểu ngữ cảnh giữa entities → embedding khó capture
- **Holistic**: cần "synthesize" từ nhiều chunks → LLM cần reasoning

**Fix priorities:**

1. **Spanning** → tăng k, add re-ranking
2. **Holistic** → query rewriting để decompose
3. **Relationship** → GraphRAG hoặc knowledge graph augment

Day 5 sẽ implement re-ranking + query rewriting → đo lại → xem có lift không.

**Pattern này là core của ML engineering:** measure → identify weakness → fix → re-measure. Iterate scientific.
`
        }
    ]
});
