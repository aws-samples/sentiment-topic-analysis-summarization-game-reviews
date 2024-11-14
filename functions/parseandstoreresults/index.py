import json
import os
import re
import boto3
import logging
from decimal import Decimal
from boto3.dynamodb.conditions import Key

s3 = boto3.client("s3")
ddb = boto3.resource("dynamodb")
logger = logging.getLogger()
logger.setLevel(logging.INFO)

def extract_game_review(text):
    pattern = r"Game Review:\s*(.*)"
    match = re.search(pattern, text, re.DOTALL)
    if match:
        return match.group(1).strip()
    else:
        return None

def lambda_handler(event, context):

    #extract bucket name from string
    bucket_name  = os.getenv("gameDataBucketName")
    tableName = os.getenv("ddbTableName")

    game_id = event["game_id"]
    job_id = event["job_id"]
    table = ddb.Table(tableName)

    response = response = table.get_item(Key={'PK': f"GAME#{game_id}", "SK": f"JOB#{job_id}"})
    
    s3OutputURI = response["Item"]["s3OutputURI"]
    jobArn = response["Item"]["jobARN"].split("/")[-1]
    key = "/".join(s3OutputURI.split("/")[3:])
    key = f"{key}{jobArn}"
    

    response = s3.list_objects_v2(
        Bucket=bucket_name,
        Prefix=key
    )

    for obj in response["Contents"]:
        if obj["Key"].endswith(".jsonl.out"):
            print(obj["Key"])
            s3Key = obj["Key"]

    response = s3.get_object(
        Bucket=bucket_name,
        Key=s3Key
    )

    data = response["Body"].read().decode("utf-8").splitlines()

    pattern = r"<result>(.*?)</result>"

    with table.batch_writer() as batch:
        for item in data:
            json_item = json.loads(item)
            inferenceResult = json_item["modelOutput"]["content"][0]["text"]
            match = re.search(pattern, inferenceResult)
            if match:
                json_inferenceResult = json.loads(match.group(1))
                if json_inferenceResult is not None:
                    overall_sentiment = json_inferenceResult["overall_sentiment"]
                    classifications = json_inferenceResult["classifications"]
                    original_review = extract_game_review(json_item["modelInput"]["messages"][0]["content"][0]["text"])

                    # Convert floats to Decimal
                    for key in json_item["modelInput"]:
                        if isinstance(json_item["modelInput"][key], float):
                            json_item["modelInput"][key] = Decimal(str(json_item["modelInput"][key]))

                    # Add item to batch
                    batch.put_item(
                        Item={
                            "PK": f"GAME#{game_id}",
                            "SK": f"REVIEW#{job_id}#{json_item['recordId']}",
                            "overall_sentiment": overall_sentiment,
                            "classifications": classifications,
                            "modelInput": json_item["modelInput"],
                            "original_review": original_review
                        }
                    )
            else:
                logger.error(f"No match found in {inferenceResult}")

        #convert all floats in json_item["model"] to decimal
        for key in json_item["modelInput"]:
            if isinstance(json_item["modelInput"][key], float):
                json_item["modelInput"][key] = Decimal(str(json_item["modelInput"][key]))
        
    return {
        'statusCode': 200
    }