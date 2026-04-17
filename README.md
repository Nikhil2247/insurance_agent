# AI Insurance Placement Agent

An AI-powered insurance carrier recommendation system built with LangChain and OpenRouter.

## Features

- Natural language interface for insurance placement queries
- Access to 177 carriers, 459 lines of business, 13,600+ appetite records
- 855 structured rules for eligibility checking
- Top 3 carrier recommendations with reasoning
- Explanation of exclusions

## Quick Start

### 1. Install Dependencies

```bash
cd ai_agent
pip install -r requirements.txt
```

### 2. Configure Environment

Create a `.env` file:

```bash
cp .env.example .env
```

Edit `.env` and add your OpenRouter API key:

```
OPENROUTER_API_KEY=your_key_here
LLM_MODEL=anthropic/claude-3-sonnet
```

### 3. Run the Chat Interface

```bash
python run_chat.py
```

Or run Streamlit directly:

```bash
streamlit run frontend/app.py
```

### 4. Run the API Server (Optional)

```bash
python run_api.py
```

Or:

```bash
uvicorn api.main:app --reload
```

API will be available at http://localhost:8000

## Usage Examples

### Chat Interface

Ask questions like:
- "I need home insurance in Texas for $500K"
- "What carriers write auto in California?"
- "Why was Travelers excluded?"
- "Compare Foremost and State Auto for FL home"

### API Endpoints

**Chat:**
```bash
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "I need home insurance in TX for $400K"}'
```

**Quick Recommendation:**
```bash
curl -X POST http://localhost:8000/recommend \
  -H "Content-Type: application/json" \
  -d '{"lob": "Home", "state": "TX", "coverage_amount": 400000}'
```

**List Carriers:**
```bash
curl http://localhost:8000/carriers
```

**Search Carriers:**
```bash
curl "http://localhost:8000/search/carriers?state=TX&lob=Home"
```

## Project Structure

```
ai_agent/
├── api/
│   ├── main.py           # FastAPI application
│   ├── agent.py          # LangChain agent with OpenRouter
│   ├── data_loader.py    # Data loading utilities
│   ├── models/
│   │   └── schemas.py    # Pydantic models
│   └── tools/
│       └── carrier_tools.py  # Agent tools
├── frontend/
│   └── app.py            # Streamlit chat interface
├── requirements.txt
├── .env.example
├── run_api.py
├── run_chat.py
└── README.md
```

## Models Available via OpenRouter

- `anthropic/claude-3-sonnet` (recommended)
- `anthropic/claude-3-opus`
- `openai/gpt-4-turbo`
- `openai/gpt-4`
- `meta-llama/llama-3-70b-instruct`

Set the model in your `.env` file:

```
LLM_MODEL=anthropic/claude-3-sonnet
```

## Data Sources

The agent uses pre-processed data from:
- `04_data_outputs/CBIG_AI_READY_LONGFORM.csv` - 13,637 appetite records
- `04_data_outputs/CBIG_STRUCTURED_RULE_CANDIDATES.csv` - 855 rules
- `04_data_outputs/CBIG_CLEANED_CARRIER_CROSSWALK.csv` - Carrier mappings
- `04_data_outputs/CBIG_CLEANED_LOB_CROSSWALK.csv` - LOB mappings
