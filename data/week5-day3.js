window.LESSONS = window.LESSONS || [];
window.LESSONS.push({
    week: 5,
    day: 3,
    title: "Production RAG pipeline · LangChain Retriever · ChatOpenAI · Gradio",
    notebooks: ["week5/day3.ipynb"],
    topics: [
        "Load Chroma DB từ disk (persisted Day 2)",
        "Retriever abstraction trong LangChain",
        "ChatOpenAI wrapper + temperature concept",
        "SystemMessage và HumanMessage objects",
        "answer_question() function ráp toàn bộ pipeline",
        "Gradio ChatInterface 1 dòng"
    ],
    summary: `
## 1. RAG pipeline đầy đủ Day 3

**Load → Retrieve → Augment → Generate** trong vài chục dòng.

\`\`\`
DB Chroma (đã có từ Day 2)
   ↓ load_persisted_vectorstore
Retriever
   ↓ invoke(question)
Top-k chunks
   ↓ format vào system_prompt
LLM
   ↓ invoke(messages)
Answer
\`\`\`

## 2. Khái niệm mới Day 3

| Concept | Vai trò |
|---|---|
| **Retriever** | Abstraction wrap vectorstore. \`invoke(query) → list[Document]\` |
| **ChatOpenAI** | LangChain wrapper for OpenAI client |
| **SystemMessage / HumanMessage** | LangChain typed message objects (thay dict) |
| **\`temperature\`** | Decoding randomness param |

## 3. Temperature deep-dive

\`temperature=0\` thường được mô tả sai là "creativity".

**Thực tế:** controls **token selection** trong inference:
- \`temperature=0\` → luôn pick token có probability cao nhất (greedy)
- \`temperature=1\` → token với 10% probability sẽ được pick 10% lần
- \`temperature=2\` → flatten distribution → outputs lạ

**Cho RAG factual Q&A:** \`temperature=0\`. Cần consistency, không creativity.

**Cho creative writing:** \`temperature=0.7-1.0\`. Cho variety.

**\`temperature=0\` không phải fully deterministic.** Cần fix seed nữa (sẽ học Tuần 6-8). Vẫn có nondeterminism từ floating point precision và GPU scheduling.

## 4. "Admit it - you thought RAG would be more complicated"

Cuối notebook Edward joke vậy. Đúng — RAG core chỉ vài chục dòng. Phức tạp đến từ:
- Eval pipeline (Day 4)
- Re-ranking, query rewriting (Day 5)
- Production concerns (monitoring, latency, fallback)

Day 3 = "vanilla RAG working".
`,
    callouts: [
        {
            type: "info",
            text: "**Mental model cho retriever:** Coi như SQL query 'WHERE meaning ≈ X'. Không phải keyword match, không phải exact match — semantic similarity. Pure abstraction — không quan tâm vector DB nào, chỉ cần \`invoke(query)\`."
        },
        {
            type: "warn",
            text: "**Đừng nhầm temperature với 'thinking effort'.** Reasoning effort (Tuần 2) là ngân sách thinking nội bộ. Temperature là randomness selection. Hai concept hoàn toàn khác."
        }
    ],
    keyPoints: [
        "**Chroma persistent — load 1 dòng từ disk.** Không cần re-embed mỗi session. Setup cost 1 lần.",
        "**Retriever abstraction tách 'how' khỏi 'what'.** Đổi vector DB (Chroma → Pinecone) không ảnh hưởng RAG logic.",
        "**LangChain message types > raw dict** cho large codebase. Type safety, IDE autocomplete. Nhưng raw dict vẫn work fine cho simple case.",
        "**\`temperature=0\` cho factual task** (Q&A, classification, extraction). \`0.7+\` cho creative task.",
        "**\`as_retriever()\` default k=4.** Tune theo task: k=3 cho query specific, k=10 cho query broad.",
        "**RAG core = 3 dòng:** retrieve docs → format prompt → call LLM. Mọi RAG framework đều wrap pattern này."
    ],
    code: [
        {
            title: "Bước 1 — Load Chroma DB đã persist từ Day 2",
            lang: "python",
            before: `
**Resume từ Day 2.** Vector store đã save vào \`vector_db/\` folder. Day 3 không re-embed — chỉ load lại.

**Critical:** dùng **cùng embedding function** với Day 2. Tạo DB với \`all-MiniLM-L6-v2\` → load phải dùng cùng model.
`,
            code: `from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_chroma import Chroma
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_huggingface import HuggingFaceEmbeddings
import gradio as gr

MODEL = "gpt-4.1-nano"
DB_NAME = "vector_db"
load_dotenv(override=True)

# Cùng embedding function với Day 2
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

# Load Chroma DB từ disk
vectorstore = Chroma(persist_directory=DB_NAME, embedding_function=embeddings)`,
            after: `
**Mổ xẻ:**

- **\`Chroma(persist_directory=..., embedding_function=...)\`**: constructor, không phải factory \`from_documents\`. Load existing DB thay vì create new.

- **Tại sao pass \`embedding_function\` khi DB đã có vectors:**
  - Vectors stored sẵn cho documents (Day 2 đã embed)
  - Nhưng khi **query**, phải embed query text → cần embedding function
  - LangChain không lưu embedding function trong DB → phải pass mỗi lần load

**Common pitfall:** quên load embeddings → error khi query. Hoặc load **wrong embedding model** → query embeddings không cùng space với doc embeddings → garbage results.

**Pattern production:**

\`\`\`python
EMBEDDING_MODEL = "all-MiniLM-L6-v2"   # constant config
\`\`\`

Dùng constant chia sẻ giữa indexing và query code. Tránh divergence.
`
        },
        {
            title: "Bước 2 — Setup retriever và LLM",
            lang: "python",
            before: `
**2 LangChain objects chính của RAG.**

- **\`retriever\`**: \`.invoke(query) → list[Document]\`
- **\`llm\`**: \`.invoke(messages) → AIMessage\`

Cả 2 đều có \`invoke()\` — pattern uniform của LangChain Runnables.
`,
            code: `# Retriever wrap vectorstore
retriever = vectorstore.as_retriever()

# LLM với temperature=0 cho deterministic
llm = ChatOpenAI(temperature=0, model_name=MODEL)

# Test retriever
docs = retriever.invoke("Who is Avery?")
print(f"Retrieved {len(docs)} chunks")
for d in docs:
    print(d.metadata['source'], '|', d.page_content[:80])

# Test LLM (không có context)
response = llm.invoke("Who is Avery?")
print(response.content)
# Output: "Avery is a common given name. Without more context..."`,
            after: `
**Mổ xẻ:**

**\`vectorstore.as_retriever()\`**:
- Default \`k=4\` (top 4 chunks)
- Default similarity metric (cosine)
- Customize: \`as_retriever(search_kwargs={"k": 10, "filter": {"doc_type": "employees"}})\`

**\`ChatOpenAI(temperature=0, model_name=MODEL)\`**:
- Wrapper LangChain cho \`openai.chat.completions.create\`
- \`temperature=0\` → deterministic
- LangChain auto-handle messages format, retry, etc.

**Test scenarios:**

1. **\`retriever.invoke("Who is Avery?")\`**:
   - Embed query → search Chroma → top-4 chunks
   - Returns chunks về Avery Lancaster (CEO)

2. **\`llm.invoke("Who is Avery?")\`** (no context):
   - LLM trả lời từ general knowledge → "Avery is a common name..."
   - **Không** biết về Avery Lancaster của Insurellm

**Để LLM trả lời cụ thể**, cần combine retriever + LLM = RAG. Bước tiếp theo.
`
        },
        {
            title: "Bước 3 — answer_question(): ráp pipeline RAG",
            lang: "python",
            before: `
**The 3-line core of RAG.** Toàn bộ Day 5 logic gói trong 1 function:

1. \`retriever.invoke(question)\` → chunks
2. Format chunks thành context string
3. Pass system + user message vào LLM
`,
            code: `SYSTEM_PROMPT_TEMPLATE = """
You are a knowledgeable, friendly assistant representing the company Insurellm.
You are chatting with a user about Insurellm.
If relevant, use the given context to answer any question.
If you don't know the answer, say so.
Context:
{context}
"""

def answer_question(question: str, history):
    # 1. Retrieve relevant chunks
    docs = retriever.invoke(question)

    # 2. Format chunks thành single context string
    context = "\\n\\n".join(doc.page_content for doc in docs)

    # 3. Build system prompt + ask LLM
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(context=context)
    response = llm.invoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=question),
    ])
    return response.content

# Test
answer_question("Who is Averi Lancaster?", [])
# Output: "Avery Lancaster is the CEO and founder of Insurellm. They started the company in..."`,
            after: `
**Mổ xẻ design:**

**System prompt template:**

- **Persona**: "knowledgeable, friendly assistant for Insurellm"
- **Format**: "use given context to answer" — instruct dùng context
- **Fallback**: "If you don't know, say so" — chống hallucinate
- **\`{context}\`**: placeholder cho retrieved chunks

**Format context:**

\`\`\`python
context = "\\n\\n".join(doc.page_content for doc in docs)
\`\`\`

Đơn giản nhất: nối 4 chunks với double newline. Production có thể format hơn:

\`\`\`python
context = "\\n\\n---\\n\\n".join(
    f"Source: {doc.metadata['source']}\\n\\n{doc.page_content}"
    for doc in docs
)
\`\`\`

Thêm source giúp LLM cite. Thêm separator (\`---\`) giúp LLM phân biệt chunks.

**\`SystemMessage\` vs \`HumanMessage\`:**

LangChain typed messages thay raw dict:

\`\`\`python
# LangChain way
[SystemMessage(content=...), HumanMessage(content=...)]

# Equivalent raw dict (Tuần 2 Day 1)
[{"role": "system", "content": ...}, {"role": "user", "content": ...}]
\`\`\`

Cả 2 work. Typed messages có IDE autocomplete, ít typo hơn. Cho large codebase nên dùng typed.

**\`history\` param** chưa được dùng (Day 3 keep simple). Day 5 sẽ implement multi-turn properly.
`
        },
        {
            title: "Bước 4 — Gradio ChatInterface + launch UI",
            lang: "python",
            before: `
**1 dòng để có web app.** Pattern y hệt Tuần 2 Day 3.

\`gr.ChatInterface\` auto-handle history rendering. Bạn chỉ cần function \`fn(message, history) → reply\`.
`,
            code: `gr.ChatInterface(answer_question).launch()

# Output:
# Running on local URL:  http://127.0.0.1:7860`,
            after: `
**Test cases manual:**

\`\`\`
User: "Who is the CEO?"
Bot: "Avery Lancaster is the CEO and founder of Insurellm..."

User: "What products do you offer?"
Bot: "Insurellm offers several products: Carllm (car insurance),
      Homellm (home), Markellm (insurance marketplace)..."

User: "How much does Carllm cost?"
Bot: "Based on the pricing information, Carllm has tiered pricing..."

User: "What's the weather today?"
Bot: "I'm not able to provide weather information. I'm here to help with
      questions about Insurellm."
\`\`\`

**Pattern thành công:**

- LLM trả lời từ context, không bịa info ngoài
- Nếu không có context → polite refusal
- Multi-product question → retrieve nhiều chunks

**Edward joke:** "Admit it — you thought RAG would be more complicated than that!"

Đúng. **Core RAG là 1 function với 3 dòng.** Phức tạp đến từ:
- Quality evaluation (Day 4)
- Edge cases (typo, ambiguous query, multi-step reasoning)
- Production concerns (latency, cost, monitoring)

Day 4 sẽ build eval pipeline để **đo** quality của Day 3 baseline này.
`
        }
    ]
});
