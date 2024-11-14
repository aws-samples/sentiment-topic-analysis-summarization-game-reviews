from abc import ABC, abstractmethod
import json


class Payload(ABC):
    @abstractmethod
    def generate(self, properties):
        pass


class Claudev2_1PayloadGenerator(Payload):

    def generate(self, properties):
        prompt = f"Human: {properties['prompt']}\n\nAssistant:"
        return {**properties, "prompt": prompt}


class Claude3PayloadGenerator(Payload):

    def generate(self, properties):
        properties['max_tokens'] = properties.pop("max_tokens_to_sample")
        prompt = properties.pop("prompt")
        return {
            **properties,
            "anthropic_version": "bedrock-2023-05-31",
            "messages": [{
                "role": "user",
                "content": [{"type": "text", "text": prompt}],
            }],
        }


class ModelPayloadGeneratorFactory:

    def create_payload_generator(self, model_id):
        if model_id == "anthropic.claude-v2:1":
            return Claudev2_1PayloadGenerator()
        if "anthropic.claude-3" in model_id:
            return Claude3PayloadGenerator()
        else:
            raise ValueError("Invalid model name")
