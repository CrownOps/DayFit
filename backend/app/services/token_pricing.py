# USD per 1M tokens. Update manually when Anthropic pricing changes.
MODEL_PRICING = {
    "claude-opus-4": {"input": 15.0, "output": 75.0},
    "claude-sonnet-4": {"input": 3.0, "output": 15.0},
    "claude-haiku-4": {"input": 0.8, "output": 4.0},
}

DEFAULT_PRICING = {"input": 3.0, "output": 15.0}


def estimate_cost_usd(model: str, input_tokens: int, output_tokens: int) -> float:
    pricing = MODEL_PRICING.get(model, DEFAULT_PRICING)
    return round(
        (input_tokens / 1_000_000) * pricing["input"] + (output_tokens / 1_000_000) * pricing["output"], 6
    )
