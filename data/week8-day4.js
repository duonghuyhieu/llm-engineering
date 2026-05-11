window.LESSONS = window.LESSONS || [];
window.LESSONS.push({
    week: 8,
    day: 4,
    title: "AutonomousPlannerAgent · Tool calling · DealAgentFramework",
    notebooks: ["week8/day4.ipynb"],
    topics: [
        "AutonomousPlannerAgent — GPT-5.1 với 3 tools",
        "Tool schemas: scan_internet, estimate_value, notify_user",
        "Agentic loop: while finish_reason='tool_calls'",
        "Fake functions cho test → swap real functions",
        "DealAgentFramework orchestrator class",
        "Memory persistence với memory.json"
    ],
    summary: `
## 1. Day 4 — Autonomous Planning

Day 1-3 build individual agents. Day 4 orchestrate qua **AutonomousPlannerAgent**:

\`\`\`
User: "Find me deals"
   ↓
PlannerAgent (GPT-5.1 với 3 tools)
   ↓ tool 1: scan_internet
   → ScannerAgent.scan() returns 5 deals
   ↓ tool 2: estimate_value cho mỗi deal
   → EnsembleAgent.price() returns estimate
   ↓ pick best (max discount %)
   ↓ tool 3: notify_user
   → MessagingAgent.notify() push notification
   ↓
"OK" reply
\`\`\`

**LLM tự quyết định:**
- Khi nào call tool
- Tool nào call trước
- Loop qua deals
- Pick best
- Send notification

**Đây là autonomous behavior** — không phải developer code "if-else" flow. LLM plan.

## 2. Tool calling protocol (recap)

LLM **không chạy code**. Cơ chế:

1. Bạn define tool schemas (JSON Schema)
2. Gửi tools + messages → LLM
3. LLM trả \`finish_reason="tool_calls"\` + \`tool_calls\` list
4. Code parse tool name + args, run function
5. Append tool result message
6. Loop về step 2 với updated context

Pattern này = **agentic loop**.

## 3. 3 tools cho deal hunting

\`\`\`json
[
  {"name": "scan_the_internet_for_bargains", "params": {}},
  {"name": "estimate_true_value", "params": {"description": "string"}},
  {"name": "notify_user_of_deal", "params": {
    "description": "string",
    "deal_price": "number",
    "estimated_true_value": "number",
    "url": "string"
  }}
]
\`\`\`

Mỗi tool wrap 1 agent từ Day 1-3.

## 4. Fake functions strategy

**Anti-pattern dev:** build full real system → debug khó vì 5 components fail simultaneously.

**Day 4 pattern:** start với **fake functions** (return hardcoded data), verify orchestration work, then **swap real functions**:

\`\`\`python
def scan_the_internet_for_bargains():
    return hardcoded_test_results.model_dump_json()

def estimate_true_value(description):
    return f"Product {description} has estimated value of $300"

def notify_user_of_deal(...):
    return "notification sent ok"
\`\`\`

Verify GPT-5.1 call đúng tools, đúng order. Sau đó swap với real ScannerAgent, EnsembleAgent, MessagingAgent.

**Production lesson:** **always test orchestration với mocks trước real backends.**

## 5. DealAgentFramework

\`deal_agent_framework.py\` — top-level class quản lý:
- All sub-agents (Scanner, Frontier, Specialist, NN, Ensemble, Messenger, Planner)
- Memory persistence (\`memory.json\`)
- Dedup: track deals đã notify để không spam

**\`init_agents_as_needed()\`**: lazy init agents (expensive operations chỉ chạy khi first used).
`,
    callouts: [
        {
            type: "info",
            text: "**Mental model cho Planner:** Coi như project manager. PM không tự code, không tự viết, không tự test. PM **gọi** developer/QA/designer/etc → wait kết quả → quyết định bước tiếp. LLM Planner làm tương tự với tools."
        },
        {
            type: "warn",
            text: "**Cẩn thận infinite loop trong agent.** ReAct có thể stuck loop nếu LLM không recognize đã đủ thông tin. Set \`max_iterations=10\` hard limit. Trace để spot pattern."
        }
    ],
    keyPoints: [
        "**Planner-Executor là kiến trúc 'safest'.** Tách smart reasoning khỏi mechanical execution.",
        "**Fake functions first.** Test orchestration với mocks → swap real. Saves debugging hours.",
        "**Multi-agent = N × cost ít nhất.** Plan cost ceiling. 'Cool architecture' không justify nếu cost unsustainable.",
        "**Schema giữa agents là contract.** No schema = nightmare debugging.",
        "**Logging trace là 'must'** cho multi-agent. Không có log = không thể debug.",
        "**\`reasoning_effort='minimal'\`** cho task simple (parse, format). Reasoning high cho complex decisions."
    ],
    code: [
        {
            title: "Bước 1 — Setup + 3 fake functions",
            lang: "python",
            before: `
**Test pattern.** Define 3 fake functions return hardcoded data. Used để verify tool calling logic work trước khi connect real backends.
`,
            code: `import json
from openai import OpenAI
from dotenv import load_dotenv
from agents.scanner_agent import ScannerAgent
import logging

load_dotenv(override=True)
openai = OpenAI()
MODEL = "gpt-5.1"

# Test data từ ScannerAgent
test_results = ScannerAgent().test_scan()
print(f"Test deals: {len(test_results.deals)}")

# Fake function 1: scan
def scan_the_internet_for_bargains() -> str:
    """ Returns hardcoded set of deals """
    print("Fake function to scan the internet")
    return test_results.model_dump_json()

# Fake function 2: estimate value
def estimate_true_value(description: str) -> str:
    """ Always returns $300 cho testing """
    print(f"Fake estimate for {description[:20]}... -> $300")
    return f"Product {description} has an estimated true value of $300"

# Fake function 3: notify
def notify_user_of_deal(description: str, deal_price: float,
                         estimated_true_value: float, url: str) -> str:
    """ Fake notification - print thay vì push """
    print(f"Fake notify: {description} for {deal_price} (est {estimated_true_value})")
    return "notification sent ok"

# Test 1 manually
notify_user_of_deal("iPhone 10", 100, 1000, "https://apple.com/iphone")`,
            after: `
**Tại sao bắt đầu với fake:**

1. **Iterate prompt nhanh**: change system_prompt → re-run → instant test (no Modal cold start, no Pushover API)
2. **Verify tool order**: PlannerAgent có call \`scan\` trước \`estimate\` trước \`notify\`?
3. **Test edge cases**: nếu scan return 0 deals, PlannerAgent có handle gracefully?

**Pattern này = TDD cho agents.** Mock → verify behavior → real implementation.

**Tránh anti-pattern:**

\`\`\`
1. Build full system with real backends
2. Run end-to-end
3. Something fails
4. Don't know if Planner / Scanner / Estimator / Messenger broken
5. 3 hours debug
\`\`\`

**With fake functions:**

\`\`\`
1. Build mock backends (fast)
2. Verify Planner orchestration
3. Replace 1 fake với real
4. Verify still work
5. Replace next
6. Done
\`\`\`

**Time savings: 5-10× faster.** Standard pattern in software engineering applied to agents.
`
        },
        {
            title: "Bước 2 — Tool schemas",
            lang: "python",
            before: `
**Define 3 tool schemas.** JSON Schema format mà OpenAI expect. Mỗi tool = 1 dict với name, description, parameters.

**Critical:** \`description\` rõ ràng — LLM dựa vào để decide khi nào call tool.
`,
            code: `# Tool 1: scan (no parameters)
scan_function = {
    "name": "scan_the_internet_for_bargains",
    "description": "Returns top bargains scraped from the internet along with the price each item is being offered for",
    "parameters": {
        "type": "object",
        "properties": {},
        "required": [],
        "additionalProperties": False,
    },
}

# Tool 2: estimate (1 parameter)
estimate_function = {
    "name": "estimate_true_value",
    "description": "Given the description of an item, estimate how much it is actually worth",
    "parameters": {
        "type": "object",
        "properties": {
            "description": {
                "type": "string",
                "description": "The description of the item to be estimated",
            },
        },
        "required": ["description"],
        "additionalProperties": False,
    },
}

# Tool 3: notify (4 parameters)
notify_function = {
    "name": "notify_user_of_deal",
    "description": "Send the user a push notification about the single most compelling deal; only call this one time",
    "parameters": {
        "type": "object",
        "properties": {
            "description": {"type": "string", "description": "The description of the item"},
            "deal_price": {"type": "number", "description": "Price offered"},
            "estimated_true_value": {"type": "number", "description": "Estimated actual value"},
            "url": {"type": "string", "description": "URL of deal"},
        },
        "required": ["description", "deal_price", "estimated_true_value", "url"],
        "additionalProperties": False,
    },
}

# Combine vào list
tools = [
    {"type": "function", "function": scan_function},
    {"type": "function", "function": estimate_function},
    {"type": "function", "function": notify_function},
]`,
            after: `
**Mổ xẻ schemas design:**

**Description style:**

- Tool 1: "Returns top bargains scraped from the internet..." — declarative
- Tool 2: "Given the description of an item, estimate how much..." — instructional
- Tool 3: "Send the user a push notification about **the single most compelling deal**; **only call this one time**" — explicit constraint

**Constraint trong description:** "only call this one time" — tránh LLM spam notifications.

**\`required\` arrays:**

- scan: \`[]\` (no args)
- estimate: \`["description"]\` (1 required)
- notify: tất cả 4 fields required

**\`additionalProperties: False\`**: strict — LLM không được pass extra fields. Reject malformed calls.

**Description quality matter:**

- Vague desc: "estimate value" → LLM confused, call wrong tool
- Clear desc: "Given the description of an item, estimate how much it is actually worth" → LLM precise

**Pattern thực tế:** write description như API doc. Include example use case ("for example when user mentions a product").
`
        },
        {
            title: "Bước 3 — Handle tool call dispatcher",
            lang: "python",
            before: `
**Dispatch logic.** When LLM call tool, code execute corresponding Python function. Use \`globals()\` cho dynamic lookup — flexible nhưng có thể security issue trong production.
`,
            code: `def handle_tool_call(message):
    """
    Actually call the tools associated with this message.
    """
    results = []
    for tool_call in message.tool_calls:
        tool_name = tool_call.function.name
        arguments = json.loads(tool_call.function.arguments)

        # Dynamic lookup function by name (use globals())
        tool = globals().get(tool_name)
        result = tool(**arguments) if tool else {}

        # Build tool message với matching tool_call_id
        results.append({
            "role": "tool",
            "content": json.dumps(result),
            "tool_call_id": tool_call.id,    # CRITICAL: match call.id
        })
    return results`,
            after: `
**Mổ xẻ:**

**\`tool_call_id\` matching:**

LLM call tool có id (vd \`call_abc123\`). Tool result must reference same id → LLM map result với call. Without matching id, LLM confused về result thuộc về call nào.

**\`globals()\` lookup:**

- **Pro**: flexible, automatic
- **Con**: security risk (arbitrary function call possible)

Production safer pattern:

\`\`\`python
TOOL_DISPATCH = {
    "scan_the_internet_for_bargains": scan_the_internet_for_bargains,
    "estimate_true_value": estimate_true_value,
    "notify_user_of_deal": notify_user_of_deal,
}

def handle_tool_call(message):
    results = []
    for tool_call in message.tool_calls:
        fn = TOOL_DISPATCH.get(tool_call.function.name)
        if fn is None:
            result = f"Unknown tool: {tool_call.function.name}"
        else:
            args = json.loads(tool_call.function.arguments)
            result = fn(**args)
        results.append({
            "role": "tool",
            "content": json.dumps(result),
            "tool_call_id": tool_call.id,
        })
    return results
\`\`\`

Explicit dispatch table — secure + auditable.

**Why \`json.dumps(result)\`:**

Tool result content phải là **string**. Result có thể là dict, list, object — serialize thành JSON.
`
        },
        {
            title: "Bước 4 — Agentic loop với fake functions",
            lang: "python",
            before: `
**Core agent execution.** Loop \`while finish_reason == "tool_calls"\` — keep running tools until LLM done.

System message + user message kick off the chain.
`,
            code: `system_message = "You find great deals on bargain products using your tools, and notify the user of the best bargain."

user_message = """
First, use your tool to scan the internet for bargain deals.
Then for each deal, use your tool to estimate its true value.
Then pick the single most compelling deal where the price is much lower than the estimated true value,
and use your tool to notify the user.
Then just reply OK to indicate success.
"""

messages = [
    {"role": "system", "content": system_message},
    {"role": "user", "content": user_message},
]

# Agentic loop
done = False
while not done:
    response = openai.chat.completions.create(
        model=MODEL,
        messages=messages,
        tools=tools,
    )

    if response.choices[0].finish_reason == "tool_calls":
        # LLM wants to call tool(s)
        message = response.choices[0].message
        results = handle_tool_call(message)
        messages.append(message)         # LLM's tool_call request
        messages.extend(results)          # Tool results
    else:
        # LLM done với tools, normal reply
        done = True

print(response.choices[0].message.content)
# Output: "OK" (when fake functions used)`,
            after: `
**Trace execution với fake functions:**

\`\`\`
[Iter 1]
Model: I'll scan the internet first.
Tool call: scan_the_internet_for_bargains()
Fake function returns 5 deals

[Iter 2-6]
Model: Now estimating each deal
Tool call: estimate_true_value("iPhone 10")  → "$300"
Tool call: estimate_true_value("AirPods Pro") → "$300"
...

[Iter 7]
Model: Best deal is AirPods Pro: deal $189 vs estimate $300 = $111 savings
Tool call: notify_user_of_deal("AirPods Pro", 189, 300, "https://...")
Fake function returns "notification sent ok"

[Iter 8]
Model: OK
finish_reason = "stop"
Loop ends.
\`\`\`

**LLM autonomously:**
- Decide order tools
- Loop estimate cho mỗi deal
- Compare estimates với deal prices
- Pick best (max savings)
- Notify ONCE (constraint trong description)

**8 LLM calls total** cho 1 user message. **Multi-agent agentic = expensive but powerful.**

**Cost analysis:**

- 5K input tokens × 8 calls = 40K input tokens
- GPT-5.1 ~$2/M input → $0.08 per scan
- Run hourly: $0.08 × 24 × 30 = ~$60/month

For personal deal scanner: acceptable. For SaaS scale: optimize (cache tool results, smaller model).
`
        },
        {
            title: "Bước 5 — Swap fake functions thành real AutonomousPlanningAgent",
            lang: "python",
            before: `
**Production class.** \`AutonomousPlanningAgent\` wrap entire workflow với real backends:
- Real ScannerAgent
- Real EnsembleAgent (FrontierAgent + SpecialistAgent + NN)
- Real MessagingAgent

\`DealAgentFramework\` quản lý lifecycle, memory.
`,
            code: `# agents/autonomous_planning_agent.py
from openai import OpenAI
from agents.scanner_agent import ScannerAgent
from agents.ensemble_agent import EnsembleAgent
from agents.messaging_agent import MessagingAgent

class AutonomousPlanningAgent:
    name = "Autonomous Planning Agent"
    MODEL = "gpt-5.1"

    def __init__(self, collection):
        self.openai = OpenAI()
        self.scanner = ScannerAgent()
        self.ensemble = EnsembleAgent(collection)
        self.messenger = MessagingAgent()
        # Tool schemas same as fake version

    def _scan(self):
        return self.scanner.scan().model_dump_json()

    def _estimate(self, description):
        price = self.ensemble.price(description)
        return f"Estimated value: \${price:.2f}"

    def _notify(self, description, deal_price, estimated_true_value, url):
        self.messenger.notify(description, deal_price, estimated_true_value, url)
        return "notification sent"

    TOOL_DISPATCH = {
        "scan_the_internet_for_bargains": "_scan",
        "estimate_true_value": "_estimate",
        "notify_user_of_deal": "_notify",
    }

    def plan(self):
        # Agentic loop (same as Bước 4 nhưng dispatch via self methods)
        ...


# In notebook:
import chromadb
client = chromadb.PersistentClient(path="products_vectorstore")
collection = client.get_or_create_collection('products')

from agents.autonomous_planning_agent import AutonomousPlanningAgent
agent = AutonomousPlanningAgent(collection)
agent.plan()
# Run real system end-to-end!`,
            after: `
**Mổ xẻ real run:**

\`\`\`
[1] Planner: scan internet
   → ScannerAgent.scan() runs RSS fetch + GPT-5-mini filter
   → Returns 5 high-quality deals

[2-6] Planner: estimate each
   → EnsembleAgent.price() runs:
     - FrontierAgent: RAG + GPT-5.1 (3-5s)
     - SpecialistAgent: Modal LLaMA call (200ms warm, 30s cold)
     - NN Agent: local inference (50ms)
   → Weighted avg

[7] Planner: compare deals vs estimates
   → Best: Sony WH-1000XM5 at $250, est $400, savings $150

[8] Planner: notify
   → MessagingAgent.notify() → Pushover → phone vibrates

[9] Planner: "OK"
\`\`\`

**Time end-to-end:** ~30-60 giây first run (Modal cold start). Subsequent: ~10-20 giây.

**Cost end-to-end:**
- RSS fetch: $0
- ScannerAgent GPT-5-mini: $0.02
- 5× EnsembleAgent calls (FrontierAgent dominant): ~$0.10-0.20
- 1× MessagingAgent (Pushover): $0
- AutonomousPlannerAgent GPT-5.1 (8 calls): $0.08
- **Total: $0.20-0.30 per scan**

**Day 4 complete:** working autonomous deal hunter. **Day 5 sẽ build UI + finalize.**
`
        }
    ]
});
