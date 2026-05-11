window.LESSONS = window.LESSONS || [];
window.LESSONS.push({
    week: 8,
    day: 5,
    title: "The Price Is Right Finale · Gradio UI · Memory persistence · Course wrap-up",
    notebooks: ["week8/day5.ipynb"],
    topics: [
        "Gradio UI advanced: Blocks + Dataframe + State",
        "DealAgentFramework — orchestrator class",
        "Opportunity dataclass — Deal + estimate + discount",
        "Memory persistence trong memory.json",
        "Click-to-notify pattern trong Dataframe",
        "Course wrap-up - what we built"
    ],
    summary: `
## 1. Day 5 — Final UI + capstone

Day 1-4 built 7 agents. Day 5 wrap thành **user-friendly Gradio app**:

\`\`\`
"The Price is Right" - Deal Hunting Agentic AI
[Dataframe display deals: description / price / estimate / discount / URL]
↓ click row
Push notification về deal đó
\`\`\`

App runs autonomous trong background, surfaces deals to UI continuously.

## 2. Architecture overview

\`\`\`
                    ┌─────────────────────────┐
                    │ Gradio UI               │
                    │ (Dataframe + State)     │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │ DealAgentFramework      │
                    │ (orchestrator + memory) │
                    └────────────┬────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        │                        │                        │
┌───────▼────────┐  ┌───────────▼──────────┐  ┌─────────▼─────────┐
│ ScannerAgent   │  │ EnsembleAgent        │  │ MessagingAgent    │
│ (RSS scrape)   │  │ - FrontierAgent      │  │ (Pushover)        │
│                │  │   (RAG + GPT-5.1)    │  │                   │
│                │  │ - SpecialistAgent    │  │                   │
│                │  │   (LLaMA Modal)      │  │                   │
│                │  │ - NN Agent           │  │                   │
└────────────────┘  └──────────────────────┘  └───────────────────┘
\`\`\`

7 agents, 1 framework, 1 UI. **Multi-agent system production-grade.**

## 3. Opportunity data model

\`\`\`python
@dataclass
class Deal:
    product_description: str
    price: float
    url: str

@dataclass
class Opportunity:
    deal: Deal
    estimate: float
    discount: float       # estimate - price
\`\`\`

**Opportunity** = deal có **discount profitable**. Framework filter deals → opportunities.

## 4. Memory persistence

\`memory.json\`:

\`\`\`json
[
  {"deal": {"product_description": "...", "price": 189, "url": "..."},
   "estimate": 300, "discount": 111},
  ...
]
\`\`\`

**Purpose:**
- **Dedup**: don't surface same deal twice
- **Tracking**: history of found opportunities
- **Resume**: survive Gradio restart

\`DealAgentFramework.run()\` loop: scan → filter new → estimate → store → display.

## 5. Course wrap-up

**8 weeks. 40 lessons. Capstone:**

\`\`\`
✅ Week 1: Frontier APIs + Web Summarizer
✅ Week 2: Gradio + Chatbot + Tool calling
✅ Week 3: HuggingFace + Transformers + Quantization
✅ Week 4: Model Selection + Code Translation
✅ Week 5: RAG + Vector DB + Evaluation
✅ Week 6: Traditional ML + Deep Learning + Frontier fine-tune
✅ Week 7: QLoRA Fine-tune LLaMA 3.2-3B
✅ Week 8: Modal serverless + Multi-agent Agentic AI
\`\`\`

**What you can now do:**
- Build LLM products from prompt engineering
- Build chatbots with Gradio
- RAG pipelines end-to-end
- Fine-tune open-source LLMs (QLoRA)
- Deploy models lên serverless GPU
- Orchestrate multi-agent systems
- Eval pipelines, monitoring

**Field này best time để vào.** AI Engineer = one of hottest roles 2024-2026.
`,
    callouts: [
        {
            type: "info",
            text: "**Mental model cho production agent system:** Coi như công ty với CEO + departments. CEO (Planner) sets goal. Departments (specialist agents) execute. Communication qua message passing. Performance evaluated qua outcomes (deals found, notifications sent)."
        },
        {
            type: "info",
            text: "**Lời cảm ơn:** Bạn đã đi qua 40 bài học. Đó là cam kết đáng ghi nhận. Bây giờ về mở project nào đó — cứ build cái gì đó nhỏ với LLM, ship lên public, kể chuyện về nó. Đó là lúc bạn thực sự thành AI Engineer."
        }
    ],
    keyPoints: [
        "**Gradio gr.Blocks** cho production-grade UI. Dataframe + State pattern hữu ích cho data-heavy apps.",
        "**Memory persistence** essential cho agent system. Dedup critical — không spam user.",
        "**\`@dataclass\` thay BaseModel cho simple data** — lighter weight, sufficient cho internal types.",
        "**Click-to-action UX** trong Dataframe — \`select\` event return row index → trigger action.",
        "**Open-source AI tier** disrupted economics. Tự host model thay vì pay-per-API call cho high volume.",
        "**Multi-agent ≠ silver bullet.** Adds complexity, debugging difficulty. Use when single agent insufficient."
    ],
    code: [
        {
            title: "Bước 1 — Simple Gradio scaffold",
            lang: "python",
            before: `
**Start simple.** Day 5 build UI từ basic → advanced. Bắt đầu với title + description chỉ.
`,
            code: `import gradio as gr
from deal_agent_framework import DealAgentFramework
from agents.deals import Opportunity, Deal

# Simple scaffold
with gr.Blocks(title="The Price is Right", fill_width=True) as ui:
    with gr.Row():
        gr.Markdown('<div style="text-align: center;font-size:24px">The Price is Right - Deal Hunting Agentic AI</div>')
    with gr.Row():
        gr.Markdown('<div style="text-align: center;font-size:14px">Autonomous agent framework that finds online deals, collaborating with a proprietary fine-tuned LLM deployed on Modal, and a RAG pipeline with a frontier model and Chroma.</div>')

ui.launch(inbrowser=True)`,
            after: `
**Output:** simple page với title + description. Verify Gradio working + project layout.

**Pattern build UI incrementally:**

1. Empty scaffold (title only) — verify framework works
2. Add 1 component (Dataframe)
3. Add state (initial data)
4. Add interactions (click handlers)
5. Connect to backend (agent framework)
6. Add background process (auto-update)

Each step verifiable independently. **5-10× faster** than building all at once.

**\`fill_width=True\`**: UI takes full browser width. Good cho data tables.
`
        },
        {
            title: "Bước 2 — Add Dataframe với State",
            lang: "python",
            before: `
**Add main UI component.** \`gr.Dataframe\` display opportunities. \`gr.State\` hold backing data (Python list of Opportunity objects).

**Pattern:** State holds rich Python objects, Dataframe display flat tabular view.
`,
            code: `with gr.Blocks(title="The Price is Right", fill_width=True) as ui:
    # Initial test data
    initial_deal = Deal(
        product_description="Example description",
        price=100.0,
        url="https://cnn.com",
    )
    initial_opportunity = Opportunity(
        deal=initial_deal,
        estimate=200.0,
        discount=100.0,
    )
    opportunities = gr.State([initial_opportunity])

    # Function to flatten Opportunity → table rows
    def get_table(opps):
        return [
            [opp.deal.product_description, opp.deal.price,
             opp.estimate, opp.discount, opp.deal.url]
            for opp in opps
        ]

    # UI layout
    with gr.Row():
        gr.Markdown('<div style="text-align: center;font-size:24px">"The Price is Right" - Deal Hunting Agentic AI</div>')
    with gr.Row():
        gr.Markdown('<div style="text-align: center;font-size:14px">Deals surfaced so far:</div>')
    with gr.Row():
        opportunities_dataframe = gr.Dataframe(
            headers=["Description", "Price", "Estimate", "Discount", "URL"],
            wrap=True,
            column_widths=[4, 1, 1, 1, 2],
            row_count=10,
            col_count=5,
            max_height=400,
        )

    # On page load, populate dataframe from state
    ui.load(get_table, inputs=[opportunities], outputs=[opportunities_dataframe])

ui.launch(inbrowser=True)`,
            after: `
**Mổ xẻ:**

**\`gr.State([initial_opportunity])\`**: holds Python objects in session state. Persist across UI events. Not visible — internal data.

**\`get_table()\` flatten function**: convert list of Opportunity → list of [col1, col2, ...] rows. Bridge between Python data model và UI display.

**\`gr.Dataframe(...)\`** config:
- \`headers\`: column names
- \`column_widths\`: relative widths (4 cho description = widest)
- \`row_count=10\`: visible rows
- \`max_height=400\`: scrollable past 10
- \`wrap=True\`: wrap long text

**\`ui.load(fn, inputs, outputs)\`**: event handler — runs khi UI loads. Populate Dataframe từ State.

**Result:** UI hiển thị 1 row test data. Verify display logic before connect backend.
`
        },
        {
            title: "Bước 3 — Add click-to-notify interaction",
            lang: "python",
            before: `
**Interactive UX.** User click row → trigger notification cho deal đó. Pattern: \`dataframe.select(fn, inputs, outputs)\` — event handler cho row click.
`,
            code: `# Init real agent framework
agent_framework = DealAgentFramework()
agent_framework.init_agents_as_needed()

with gr.Blocks(title="The Price is Right", fill_width=True) as ui:
    initial_deal = Deal(
        product_description="Example description",
        price=100.0,
        url="https://cnn.com",
    )
    initial_opportunity = Opportunity(
        deal=initial_deal,
        estimate=200.0,
        discount=100.0,
    )
    opportunities = gr.State([initial_opportunity])

    def get_table(opps):
        return [[opp.deal.product_description, opp.deal.price,
                 opp.estimate, opp.discount, opp.deal.url] for opp in opps]

    def do_select(opportunities, selected_index: gr.SelectData):
        """Click handler - trigger notification cho selected deal."""
        row = selected_index.index[0]
        opportunity = opportunities[row]
        agent_framework.planner.messenger.alert(opportunity)

    # UI layout
    with gr.Row():
        gr.Markdown('<div style="text-align: center;font-size:24px">"The Price is Right" - Deal Hunting Agentic AI</div>')
    with gr.Row():
        gr.Markdown('<div style="text-align: center;font-size:14px">Deals surfaced so far:</div>')
    with gr.Row():
        opportunities_dataframe = gr.Dataframe(
            headers=["Description", "Price", "Estimate", "Discount", "URL"],
            wrap=True,
            column_widths=[4, 1, 1, 1, 2],
            row_count=10,
            col_count=5,
            max_height=400,
        )

    # Events
    ui.load(get_table, inputs=[opportunities], outputs=[opportunities_dataframe])
    opportunities_dataframe.select(do_select, inputs=[opportunities], outputs=[])

ui.launch(inbrowser=True)`,
            after: `
**Mổ xẻ:**

**\`gr.SelectData\`**: special parameter — Gradio inject info về click. Contains:
- \`index\`: tuple (row, col) của clicked cell
- \`value\`: clicked cell value

\`selected_index.index[0]\` = row index → lookup opportunity từ state.

**\`agent_framework.planner.messenger.alert(opportunity)\`**:

Drill down through agent hierarchy:
- \`agent_framework\` (DealAgentFramework)
- \`.planner\` (AutonomousPlannerAgent)
- \`.messenger\` (MessagingAgent)
- \`.alert(opportunity)\` — push notification cho specific opportunity

**Production-grade UX:**

- See all deals in table
- Click interesting one → instant phone notification
- Manual override agent decision (planner may not notify all good deals)

**Tiếp theo:** background process auto-add new opportunities to State. \`price_is_right.py\` script implement full loop:

\`\`\`python
while True:
    new_opps = agent_framework.run()  # scan + estimate
    state.value.extend(new_opps)       # add to UI
    time.sleep(3600)                    # repeat every hour
\`\`\`

**Day 5 demo:** \`!uv run price_is_right.py\` từ notebook để chạy full app.
`
        },
        {
            title: "Bước 4 — Full production script",
            lang: "python",
            before: `
**\`price_is_right.py\`** — standalone script. Background loop + Gradio UI.

Run từ terminal (hoặc notebook \`!uv run\`):
`,
            code: `# price_is_right.py (simplified)
import gradio as gr
import time
import threading
from deal_agent_framework import DealAgentFramework
from agents.deals import Opportunity, Deal

framework = DealAgentFramework()
framework.init_agents_as_needed()

# Background loop
def background_loop(state):
    """Run agent framework periodically, add new opportunities to state."""
    while True:
        new_opps = framework.run()    # full pipeline: scan → estimate → filter
        if new_opps:
            state.value.extend(new_opps)
        time.sleep(3600)               # 1 hour interval

# Gradio UI
with gr.Blocks(title="The Price is Right") as ui:
    opportunities = gr.State(framework.memory)   # load from memory.json

    # ... Dataframe + events ...

# Start background thread
thread = threading.Thread(target=background_loop, args=(opportunities,), daemon=True)
thread.start()

ui.launch()

# Run: uv run price_is_right.py
# Output:
# Running on local URL: http://127.0.0.1:7860
# Background: ScannerAgent scanning...
# Background: 3 new opportunities found
# Background: Sending notification for best deal...`,
            after: `
**Mổ xẻ:**

**Background thread pattern:**
- Daemon thread = dies khi main exits
- Loop every 3600s (1 hour)
- Updates \`gr.State\` từ outside Gradio
- Gradio polls state, re-renders UI

**Production considerations:**

1. **Rate limit**: respect RSS feed rate limits
2. **Error recovery**: try/except trong loop, log errors
3. **Cost tracking**: log API costs per scan
4. **Cooldown for notifications**: don't notify same deal repeatedly
5. **Health endpoint**: \`/health\` cho monitoring

**Real run output:**

\`\`\`
[Hour 0]
ScannerAgent: 87 raw deals from RSS
ScannerAgent: 5 quality deals filtered
EnsembleAgent: estimating deal 1/5...
EnsembleAgent: deal 1 = $250, estimate $400, discount $150 ✓
EnsembleAgent: deal 2 = $50, estimate $30, discount -$20 ✗
...
MessagingAgent: notifying user of best deal: Sony WH-1000XM5
UI: opportunities updated, 1 new entry

[Hour 1] (repeat)
\`\`\`

**Capstone product complete.** User receive notifications về real deals, surfaced by autonomous AI system, ranked by AI ensemble.
`
        },
        {
            title: "Bước 5 — Course wrap-up + what's next",
            lang: "python",
            before: `
**8 weeks completed.** Đây là cuối khóa. Recap what built + what's next.
`,
            code: `# === Full system stack ===

# Week 1: Frontier API access
from openai import OpenAI
client = OpenAI()

# Week 2: Multi-provider + Gradio
import gradio as gr

# Week 3: HuggingFace + local models
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

# Week 5: RAG
import chromadb
from sentence_transformers import SentenceTransformer

# Week 6-7: Custom fine-tuned model
# (Modal hosts the model)
import modal

# Week 8: Agentic system
from agents.autonomous_planning_agent import AutonomousPlanningAgent
from agents.deals import Opportunity

# This is the full stack of modern AI Engineering.
# After 8 weeks, bạn đã viết code dùng MỌI thing này.

# ============================================
# WHAT'S NEXT?
# ============================================

# 1. Build your portfolio:
#    - Pick 1-2 projects, polish, deploy on HF Spaces / Modal
#    - Blog post detailed write-up
#    - GitHub README professional

# 2. Stay updated:
#    - Follow Andrej Karpathy, Jeremy Howard
#    - Read Anthropic + OpenAI cookbooks
#    - HF Hub trending models

# 3. Specialize:
#    - Production deployment (Modal, BentoML)
#    - Evaluation infrastructure (LangSmith, Helicone)
#    - Agentic frameworks (LangGraph, CrewAI)
#    - Multi-modal (vision, audio, video)

# 4. Career paths:
#    - AI Engineer (build product) ← khóa này align với
#    - ML Engineer (train custom models)
#    - Research Scientist (publish papers)
#    - Solutions Architect (customer-facing)

print("🎉 CONGRATULATIONS! 🎉")
print("You've completed LLM Engineering 8-week course.")
print("Now go build something amazing!")`,
            after: `
**Final stats:**

| Metric | Value |
|---|---|
| **Weeks completed** | 8 |
| **Lessons** | 40 |
| **Code examples** | 200+ |
| **Models touched** | 20+ (GPT, Claude, Gemini, LLaMA, Qwen, etc.) |
| **Frameworks learned** | 15+ (transformers, peft, trl, langchain, gradio, modal, etc.) |
| **Capstone built** | The Price Is Right Agentic AI |

**Skills acquired:**

✅ Prompt engineering (system/user/few-shot/multi-shot)
✅ Multi-provider API (OpenAI, Anthropic, Google, Ollama, Modal)
✅ Gradio UI (Interface, ChatInterface, Blocks)
✅ Tool calling + function execution
✅ HuggingFace pipeline + low-level Transformers
✅ Tokenization deep dive
✅ Quantization (NF4, BitsAndBytes)
✅ Model selection + benchmarks
✅ RAG end-to-end (Chroma, embeddings, reranking)
✅ Evaluation pipelines (MRR, nDCG, LLM-as-judge)
✅ Traditional ML (RF, XGBoost, baselines)
✅ Deep Learning (PyTorch NN)
✅ Fine-tuning (OpenAI managed + QLoRA local)
✅ LoRA mathematics
✅ Cloud deployment (Modal serverless)
✅ Multi-agent orchestration

**You can now:**
- Build LLM products end-to-end
- Fine-tune open-source models on consumer GPUs
- Deploy production AI services
- Coordinate multi-agent systems
- Evaluate and iterate on AI quality

**Field này growing 30%+ year-over-year.** AI Engineer = top 5 fastest-growing roles 2024-2026.

**LinkedIn**: connect Edward Donner, share completion
**Twitter**: @edwarddonner
**Blog**: edwarddonner.com

**🎉 You did it! Now go build something amazing. The field needs builders like you.**
`
        }
    ]
});
