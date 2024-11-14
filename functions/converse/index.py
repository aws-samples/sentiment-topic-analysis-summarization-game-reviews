import logging
import json
import os
import boto3
import requests
import re
from requests.exceptions import RequestException
from fastapi import Depends, FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum
from botocore.exceptions import ClientError

app = FastAPI()
ssm = boto3.client("ssm")
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
stackName = os.environ.get("stackName")
gamescrudendpoint = os.environ.get("GAMECRUD_ENDPOINT")
logger.info(f"Gamecrudendpoint: {gamescrudendpoint}")
logger.info(f"Stackname: {stackName}")
model_id = ssm.get_parameter(Name=f"/{stackName}/default/MODEL_ID_CONVERSE")[
    "Parameter"
]["Value"]

allowed_origins = os.environ.get("ALLOWED_ORIGINS", "").split(",")


def get_lambda_event(request: Request):
    return request.scope.get("aws.event", {})

def sanitize_input(input_string):
    """Sanitize input to prevent injection attacks."""
    return re.sub(r'[^\w\s-]', '', input_string)


def get_authenticated_user_id(event: dict = Depends(get_lambda_event)):
    try:
        request_context = event["requestContext"]
        authorizer = request_context.get("authorizer", {})
        claims = authorizer.get("claims", {})
        user_id = claims.get("sub")

        if not user_id:
            logger.warning("Authentication failed: User ID not found in claims")
            raise HTTPException(status_code=401, detail="User not authenticated")

        logger.info(f"User authenticated successfully: {user_id}")
        return user_id
    except KeyError:
        logger.error("Invalid event structure in authentication", exc_info=True)
        raise HTTPException(status_code=500, detail="Invalid event structure")


def get_reviews(game_id, job_id, sentiment, classification, user_token):

    safe_game_id = sanitize_input(game_id)
    safe_job_id = sanitize_input(job_id)

    logger.info(f"Fetching reviews for game {safe_game_id}, job {safe_job_id}")

    url = f"{gamescrudendpoint}games/{game_id}/analysis-jobs/{job_id}/reviews"

    params = {}

    if sentiment:
        params["sentiment"] = sentiment
    if classification:
        params["classification"] = classification

    headers = {"Authorization": f"Bearer {user_token}"}

    try:
        
        response = requests.get(url, params=params, headers=headers, timeout=10)
        response.raise_for_status()
        reviews = response.json()
        reviews = [review["original_review"] for review in reviews]

        return "\n".join(reviews)
    except RequestException as e:
        logger.error(f"Error fetching reviews for game {safe_game_id}, job {safe_job_id}: {e}")
        raise


def stream_messages(bedrock_client, model_id, messages, tool_config):

    response = bedrock_client.converse_stream(
        modelId=model_id, messages=messages, toolConfig=tool_config
    )

    stop_reason = ""

    message = {}
    content = []
    message["content"] = content
    text = ""
    tool_use = {}

    # stream the response into a message.
    for chunk in response["stream"]:
        if "messageStart" in chunk:
            message["role"] = chunk["messageStart"]["role"]
        elif "contentBlockStart" in chunk:
            tool = chunk["contentBlockStart"]["start"]["toolUse"]
            tool_use["toolUseId"] = tool["toolUseId"]
            tool_use["name"] = tool["name"]
        elif "contentBlockDelta" in chunk:
            delta = chunk["contentBlockDelta"]["delta"]
            if "toolUse" in delta:
                if "input" not in tool_use:
                    tool_use["input"] = ""
                tool_use["input"] += delta["toolUse"]["input"]
            elif "text" in delta:
                text += delta["text"]
                print(delta["text"], end="")
        elif "contentBlockStop" in chunk:
            if "input" in tool_use:
                tool_use["input"] = json.loads(tool_use["input"])
                content.append({"toolUse": tool_use})
                tool_use = {}
            else:
                content.append({"text": text})
                text = ""

        elif "messageStop" in chunk:
            stop_reason = chunk["messageStop"]["stopReason"]

    return stop_reason, message


@app.get("/games/{game_id}/analysis-jobs/{job_id}/converse")
async def converse(
    game_id: str,
    job_id: str,
    input_text: str,
    event: dict = Depends(get_lambda_event),
):

    try:
        bedrock_client = boto3.client(service_name="bedrock-runtime")

        logger.info("Calling converse")

        user_token = event["headers"].get("Authorization", "").split("Bearer ")[-1]

        # Create the initial message from the user input.
        messages = [{"role": "user", "content": [{"text": input_text}]}]

        # Define the tool to send to the model.
        tool_config = {
            "tools": [
                {
                    "toolSpec": {
                        "name": "review_analysis",
                        "description": "Analyse reviews",
                        "inputSchema": {
                            "json": {
                                "type": "object",
                                "properties": {
                                    "sentiment": {
                                        "type": "string",
                                        "description": "The sentiment for your game based on player reviews. Examples are Positive, Neutral, Negative",
                                    },
                                    "classification": {
                                        "type": "string",
                                        "description": "The classification for your game based on player reviews. Examples are Price, Sound, Story, Support, Controls, Gameplay, Graphics, Multiplayer, Performance, All ",
                                    },
                                },
                                "required": ["sentiment", "classification"],
                            }
                        },
                    }
                }
            ]
        }

        # Send the message and get the tool use request from response.
        while True:
            stop_reason, message = stream_messages(
                bedrock_client, model_id, messages, tool_config
            )

            messages.append(message)

            if stop_reason == "end_turn":
                return {
                    "status_code": 200,
                    "body": json.dumps(message),
                }

            if stop_reason == "tool_use":

                logger.info("Tool use detected")

                for content in message["content"]:
                    if "toolUse" in content:
                        print(content)
                        tool = content["toolUse"]

                        if tool["name"] == "review_analysis":
                            tool_result = {}

                            try:
                                
                                sentiment = tool["input"].get("sentiment", "")
                                classification = tool["input"].get("classification", "")

                                logger.info(
                                    "Calling get_reviews with sentiment %s and classification %s",
                                    sentiment,
                                    classification,
                                )

                                tool_result = {
                                    "toolUseId": tool["toolUseId"],
                                    "content": [
                                        {
                                            "json": {
                                                "reviews": get_reviews(
                                                    game_id,
                                                    job_id,
                                                    sentiment,
                                                    classification,
                                                    user_token,
                                                )
                                            }
                                        }
                                    ],
                                }

                            except Exception as err:
                                tool_result = {
                                    "toolUseId": tool["toolUseId"],
                                    "content": [{"text": err.args[0]}],
                                    "status": "error",
                                }
                                logger.error(err, exc_info=True)
                        tool_result_message = {
                            "role": "user",
                            "content": [{"toolResult": tool_result}],
                        }
                        # Add the result info to message.
                        messages.append(tool_result_message)

    except ClientError as err:
        message = err.response["Error"]["Message"]
        logger.error("A client error occurred: %s", message)


app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

lambda_handler = Mangum(app)
