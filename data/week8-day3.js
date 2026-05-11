window.LESSONS = window.LESSONS || [];
window.LESSONS.push({
    week: 8,
    day: 3,
    title: "ScannerAgent · RSS feeds · MessengerAgent · Pushover notifications",
    notebooks: ["week8/day3.ipynb"],
    topics: [
        "ScrapedDeal class — fetch RSS feeds parallel",
        "Structured Output với Pydantic (DealSelection)",
        "ScannerAgent: GPT-5-mini parse + rank top deals",
        "Pushover.net — push notification service",
        "MessagingAgent class wrap notification",
        "Anti-pattern: deals with '$XXX off' marketing"
    ],
    summary: `
## 1. Day 3 — Input + Output agents

Day 1-2 build **estimation agents** (price prediction). Day 3 build:

1. **ScannerAgent** (INPUT) — scan RSS feeds, parse deals, structure output
2. **MessengerAgent** (OUTPUT) — push notifications cho user

Đây là 2 **edge agents** của system — interact với external world.

## 2. RSS feeds = input source

**Đa số deal websites có RSS feeds.** Format chuẩn cho structured content syndication.

Day 3 fetch từ:
- slickdeals.net/newsearch.php?mode=frontpage
- dealnews.com/rss
- (other deal aggregators)

**Structure RSS feed:**

\`\`\`xml
<rss>
  <channel>
    <item>
      <title>Boss DS-1 Distortion Pedal $49.99 (was $89)</title>
      <link>https://...</link>
      <description>HTML content describing deal</description>
      <pubDate>...</pubDate>
    </item>
    ...
  </channel>
</rss>
\`\`\`

\`ScrapedDeal\` class parse RSS với \`feedparser\` library.

## 3. LLM curate top deals

Raw feeds có 50-200 items per scan. Most không phải good deals (marketing spam, generic listings). LLM filter:

\`\`\`
50 raw items
   ↓ GPT-5-mini parse
5 high-quality deals với clear price + description
   ↓ format DealSelection (Pydantic)
Structured output ready cho downstream
\`\`\`

## 4. Pydantic schema enforcement

\`DealSelection\` model:

\`\`\`python
class Deal(BaseModel):
    product_description: str
    price: float
    url: str

class DealSelection(BaseModel):
    deals: list[Deal]
\`\`\`

\`openai.chat.completions.parse(response_format=DealSelection)\` ép GPT output match schema. **No parsing**, no JSON validation — direct typed Python object.

## 5. Pushover = simple notifications

\`pushover.net\` — service push notification.

Setup:
1. Signup pushover.net (free)
2. Create app → get API token
3. Install mobile app → get user key
4. POST to API → notification appears on phone

Simple HTTP POST:

\`\`\`python
requests.post("https://api.pushover.net/1/messages.json", data={
    "user": "u_key...",
    "token": "a_token...",
    "message": "MASSIVE DEAL!!"
})
\`\`\`

**Day 3 wraps thành \`MessagingAgent\` class** với clean API: \`agent.push(message)\`.

## 6. Anti-pattern cảnh báo trong prompt

System prompt cho ScannerAgent **explicitly warn:**

> Be careful with products that are described as "$XXX off" or "reduced by $XXX" - this isn't the actual price of the product.

**Tại sao critical:** "$50 off" ≠ "$50 price". Misidentify → notification user về "deal $50" cho item thực ra $500.

Always **anti-patterns** trong system prompt khi LLM dễ confuse common scenarios.
`,
    callouts: [
        {
            type: "info",
            text: "**Mental model cho Scanner+Messenger:** Coi như mắt và miệng của agent. Scanner 'thấy' deals từ internet. Messenger 'nói' user về deals. Estimation agents (Day 1-2) là 'não' giữa 2 edges này."
        },
        {
            type: "warn",
            text: "**Test ScannerAgent trên real data trước trust.** RSS feeds có nhiều noise, format inconsistent. LLM có thể bịa price hoặc URL. Spot-check sample output trước deploy."
        }
    ],
    keyPoints: [
        "**RSS feeds là source structured data.** Hầu hết news / deal sites cung cấp RSS — easy to scrape.",
        "**Pydantic schema bảo vệ downstream code.** Type-safe parsing, no JSON validation errors.",
        "**\`response_format=Pydantic\`** thay vì manual JSON parse → cleaner code, less bug.",
        "**Pushover free tier đủ cho personal use.** 7500 messages/month free. Alternatives: Slack webhook, Telegram bot, email.",
        "**Anti-pattern in system prompt** quan trọng. Liệt kê common confusions để LLM avoid.",
        "**Parallel fetch RSS feeds** dùng \`concurrent.futures\` — 5 feeds đồng thời thay tuần tự."
    ],
    code: [
        {
            title: "Bước 1 — Fetch RSS feeds với ScrapedDeal",
            lang: "python",
            before: `
**\`ScrapedDeal.fetch()\`** class method — gọi nhiều RSS feeds parallel, parse vào uniform format.

Implementation trong \`agents/deals.py\` của course:
\`\`\`python
class ScrapedDeal:
    @classmethod
    def fetch(cls, show_progress=False) -> list['ScrapedDeal']:
        # Use feedparser to fetch + parse multiple RSS feeds
        # Returns list of ScrapedDeal objects
\`\`\`
`,
            code: `import os
from dotenv import load_dotenv
from openai import OpenAI
from agents.deals import ScrapedDeal, DealSelection
import logging

load_dotenv(override=True)
openai = OpenAI()
MODEL = 'gpt-5-mini'

# Fetch deals từ RSS feeds
deals = ScrapedDeal.fetch(show_progress=True)
print(f"Found {len(deals)} deals")

# Inspect 1 deal
print(deals[10].describe())
# Output:
# Title: Apple AirPods Pro 2 with USB-C $189 (was $249)
# Details: New Apple AirPods Pro (2nd Gen) with USB-C charging case for $189...
# Features: ANC, Adaptive Transparency, USB-C, Sweat Resistant, MagSafe...
# URL: https://slickdeals.net/...`,
            after: `
**Output:** typically 50-200 deals từ 3-5 RSS feeds.

**\`describe()\`** format unified output cho LLM consume. Bao gồm:
- Title (concise)
- Details (full description, may contain marketing fluff)
- Features (bullet list)
- URL (for notification + dedup)

**Anti-pattern trong raw data:**

- "Best deal of the year!!" — clickbait
- "Was $300, now $99" — discount marketing
- "Save 70% on..." — percentage discount, no absolute price
- Generic listings (not specific product)

LLM (Bước 2) sẽ filter các noise này.
`
        },
        {
            title: "Bước 2 — System prompt + Pydantic schema",
            lang: "python",
            before: `
**Define expected output structure.** \`DealSelection\` Pydantic model. GPT sẽ output match schema strict.

System prompt **liệt kê anti-patterns** — LLM aware common confusions.
`,
            code: `from pydantic import BaseModel

# Schema cho structured output
class Deal(BaseModel):
    product_description: str
    price: float
    url: str

class DealSelection(BaseModel):
    deals: list[Deal]


SYSTEM_PROMPT = """You identify and summarize the 5 most detailed deals from a list, by selecting deals that have the most detailed, high quality description and the most clear price.
Respond strictly in JSON with no explanation, using this format. You should provide the price as a number derived from the description. If the price of a deal isn't clear, do not include that deal in your response.
Most important is that you respond with the 5 deals that have the most detailed product description with price. It's not important to mention the terms of the deal; most important is a thorough description of the product.
Be careful with products that are described as "$XXX off" or "reduced by $XXX" - this isn't the actual price of the product. Only respond with products when you are highly confident about the price.
"""

USER_PROMPT_PREFIX = """Respond with the most promising 5 deals from this list, selecting those which have the most detailed, high quality product description and a clear price that is greater than 0.
You should rephrase the description to be a summary of the product itself, not the terms of the deal.
Remember to respond with a short paragraph of text in the product_description field for each of the 5 items that you select.
Be careful with products that are described as "$XXX off" or "reduced by $XXX" - this isn't the actual price of the product. Only respond with products when you are highly confident about the price.

Deals:

"""

USER_PROMPT_SUFFIX = "\\n\\nInclude exactly 5 deals, no more."`,
            after: `
**Mổ xẻ prompt design:**

**System prompt 4 instructions:**

1. **Task**: "identify 5 most detailed deals"
2. **Selection criteria**: "detailed description + clear price"
3. **Format**: "JSON strict, no explanation"
4. **Anti-pattern**: "Be careful with '$XXX off'" — critical warning

**User prompt 3 parts:**

- **Prefix**: re-emphasize task + criteria
- **Body**: concat all scraped deals (each via \`describe()\`)
- **Suffix**: "exactly 5 deals" — hard constraint on output count

**Tại sao redundancy:**

LLM dễ "drift" trong long context. Repeating critical instructions tăng compliance. Pattern phổ biến cho complex tasks.

**Pydantic schema simple:**

- \`product_description: str\` — paragraph summary
- \`price: float\` — extracted number
- \`url: str\` — for later reference

\`DealSelection.deals: list[Deal]\` — list 5 items.

**Why Pydantic vs raw JSON:**

\`\`\`python
# Raw JSON pattern (old)
response = openai.chat.completions.create(...)
data = json.loads(response.choices[0].message.content)
price = float(data["deals"][0]["price"])   # may raise

# Pydantic pattern (Day 3)
response = openai.chat.completions.parse(..., response_format=DealSelection)
deals = response.choices[0].message.parsed   # typed!
price = deals.deals[0].price   # IDE autocomplete + type-safe
\`\`\`

Cleaner, safer.
`
        },
        {
            title: "Bước 3 — Run LLM với structured output",
            lang: "python",
            before: `
**Magic API: \`openai.chat.completions.parse()\`** thay vì \`.create()\`. Pass Pydantic class as \`response_format\` → GPT output guaranteed match.
`,
            code: `def make_user_prompt(scraped):
    user_prompt = USER_PROMPT_PREFIX
    user_prompt += '\\n\\n'.join([scrape.describe() for scrape in scraped])
    user_prompt += USER_PROMPT_SUFFIX
    return user_prompt

# Build messages
user_prompt = make_user_prompt(deals)
messages = [
    {"role": "system", "content": SYSTEM_PROMPT},
    {"role": "user", "content": user_prompt},
]

# Call GPT với structured output
response = openai.chat.completions.parse(
    model=MODEL,
    messages=messages,
    response_format=DealSelection,
    reasoning_effort="minimal",
)

# Parsed Pydantic object - type safe!
results = response.choices[0].message.parsed
print(f"Selected {len(results.deals)} deals")
for deal in results.deals:
    print(f"\\n\${deal.price:.2f}: {deal.product_description[:100]}...")
    print(f"   URL: {deal.url}")`,
            after: `
**Output sample:**

\`\`\`
Selected 5 deals

$189.00: Apple AirPods Pro (2nd Generation) with USB-C charging case.
         Features active noise cancellation, adaptive transparency mode,
         personalized spatial audio with dynamic head tracking...
   URL: https://slickdeals.net/...

$249.99: Samsung 27-inch 4K UHD Monitor (S27D80) with USB-C connectivity.
         Features IPS panel with 100% sRGB color accuracy, 60Hz refresh rate...
   URL: https://...

[3 more deals...]
\`\`\`

**\`results\` là Pydantic object** — direct attribute access:

\`\`\`python
results.deals          # list[Deal]
results.deals[0].price # float
results.deals[0].url   # str
\`\`\`

**No JSON parsing**, no \`json.loads()\` exception handling. Type-safe.

**Time + cost:**

- 50-100 deals input → ~5000-10000 tokens prompt
- GPT-5-mini call: ~10 seconds, ~$0.02
- One scan / hour = ~$15/month

Acceptable cho personal deal scanner.
`
        },
        {
            title: "Bước 4 — ScannerAgent class",
            lang: "python",
            before: `
**Wrap workflow thành class với clean API.** \`agents/scanner_agent.py\`:
`,
            code: `# agents/scanner_agent.py
from openai import OpenAI
from agents.deals import ScrapedDeal, DealSelection
import logging

class ScannerAgent:
    name = "Scanner Agent"
    MODEL = "gpt-5-mini"
    SYSTEM_PROMPT = """..."""    # as defined above

    def __init__(self):
        self.openai = OpenAI()

    def scan(self) -> DealSelection:
        """Fetch RSS feeds + LLM filter → top 5 deals."""
        logging.info("Scanner Agent: fetching RSS feeds")
        deals = ScrapedDeal.fetch()
        logging.info(f"Scanner Agent: found {len(deals)} raw deals")

        user_prompt = self.make_user_prompt(deals)
        messages = [
            {"role": "system", "content": self.SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ]

        response = self.openai.chat.completions.parse(
            model=self.MODEL,
            messages=messages,
            response_format=DealSelection,
            reasoning_effort="minimal",
        )

        results = response.choices[0].message.parsed
        logging.info(f"Scanner Agent: selected {len(results.deals)} top deals")
        return results

# Usage
import logging
logging.basicConfig(level=logging.INFO)

agent = ScannerAgent()
result = agent.scan()
# INFO: Scanner Agent: fetching RSS feeds
# INFO: Scanner Agent: found 87 raw deals
# INFO: Scanner Agent: selected 5 top deals`,
            after: `
**Mổ xẻ:**

**Class structure** match SpecialistAgent (Day 1):
- \`name\` class attribute
- \`__init__\` setup expensive resources
- Main method (\`scan\`, \`price\`...) — clean API

**Logging pattern xuyên suốt agents:**

\`\`\`
INFO: Scanner Agent: fetching RSS feeds
INFO: Scanner Agent: found 87 raw deals
INFO: Scanner Agent: selected 5 top deals
INFO: Frontier Agent: pricing 'Apple AirPods Pro...'
INFO: Frontier Agent: estimate $185
...
\`\`\`

Trace agent activity → debug easy, monitor production.

**\`test_scan()\`** method bonus — fetch fewer items cho fast iteration:

\`\`\`python
def test_scan(self) -> DealSelection:
    """Quick scan with limited items for testing."""
    deals = ScrapedDeal.fetch(limit=20)
    # ... rest same as scan()
\`\`\`

Day 4 PlannerAgent sẽ dùng \`test_scan()\` để dev nhanh.
`
        },
        {
            title: "Bước 5 — Pushover setup + MessagingAgent",
            lang: "python",
            before: `
**Pushover signup workflow:**

1. Visit [pushover.net](https://pushover.net), Login/Signup
2. Home screen: copy "User Key" (top right, starts with \`u\`)
3. Click "Create an Application/API Token" → name "AIEngineer" → copy "API Token" (starts with \`a\`)
4. Install Pushover mobile app
5. Add to \`.env\`:

\`\`\`
PUSHOVER_USER=u_...
PUSHOVER_TOKEN=a_...
\`\`\`
`,
            code: `import os
import requests
from dotenv import load_dotenv

load_dotenv(override=True)
pushover_user = os.getenv('PUSHOVER_USER')
pushover_token = os.getenv('PUSHOVER_TOKEN')
pushover_url = "https://api.pushover.net/1/messages.json"

# Verify tokens
print(f"User: {pushover_user[:3]}...")
print(f"Token: {pushover_token[:3]}...")

# Simple push function
def push(message):
    print(f"Push: {message}")
    payload = {
        "user": pushover_user,
        "token": pushover_token,
        "message": message,
    }
    requests.post(pushover_url, data=payload)

# Test
push("MASSIVE DEAL!!")
# Phone receives notification

# MessagingAgent class wrap
# agents/messaging_agent.py
class MessagingAgent:
    name = "Messaging Agent"

    def __init__(self):
        self.user = os.getenv('PUSHOVER_USER')
        self.token = os.getenv('PUSHOVER_TOKEN')
        self.url = "https://api.pushover.net/1/messages.json"

    def push(self, message):
        logging.info(f"Messaging Agent: {message}")
        requests.post(self.url, data={
            "user": self.user,
            "token": self.token,
            "message": message,
        })

    def notify(self, description, deal_price, estimated_value, url):
        """Structured notification cho deal."""
        message = (
            f"💰 DEAL ALERT 💰\\n\\n"
            f"{description}\\n\\n"
            f"Deal price: \${deal_price:.2f}\\n"
            f"Estimated true value: \${estimated_value:.2f}\\n"
            f"Savings: \${estimated_value - deal_price:.2f}\\n\\n"
            f"{url}"
        )
        self.push(message)

# Usage
agent = MessagingAgent()
agent.notify(
    "Sumsung 60 inch LED TV going at a great bargain",
    300, 1000, "www.samsung.com"
)`,
            after: `
**Notification on phone:**

\`\`\`
💰 DEAL ALERT 💰

Sumsung 60 inch LED TV going at a great bargain

Deal price: $300.00
Estimated true value: $1000.00
Savings: $700.00

www.samsung.com
\`\`\`

**Pushover free tier limits:**
- 10,000 messages/month per user
- Plenty for personal deal scanner (~10 deals/day)

**Alternatives nếu cần features khác:**

| Service | Free | Strengths |
|---|---|---|
| **Pushover** | 10K/mo | Simple, mobile-first |
| **Slack webhook** | Unlimited | Team coordination |
| **Telegram bot** | Unlimited | Rich UI (buttons, images) |
| **Email (SendGrid)** | 100/day | Universal, no app needed |
| **Discord webhook** | Unlimited | Embedded rich content |

**Production note:** wrap notification trong **rate limiter** + **dedup**. Same deal scanned 10× → don't spam user 10×.

**Day 3 complete:**
- ✅ ScannerAgent: RSS → top 5 deals (Pydantic schema)
- ✅ MessagingAgent: Pushover notification

**Day 4 sẽ orchestrate** tất cả với AutonomousPlannerAgent — agent tự gọi tools (scan, estimate, notify) qua **tool calling**.
`
        }
    ]
});
