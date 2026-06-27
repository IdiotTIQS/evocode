from evocode_runtime.llm.gateway import LlmGateway
from evocode_runtime.llm.stub_provider import StubLlmProvider
from evocode_runtime.llm.openai_provider import OpenAiLlmProvider


def get_llm_gateway() -> LlmGateway:
    """默认 stub；若配置了 OPENAI_API_KEY 则用 OpenAI provider。"""
    if OpenAiLlmProvider.is_available():
        return OpenAiLlmProvider()
    return StubLlmProvider()
