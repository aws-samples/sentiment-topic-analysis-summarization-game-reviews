import json
import csv
import boto3
import os
import io
from datetime import datetime
from utils.ModelFactory import ModelPayloadGeneratorFactory

s3 = boto3.client("s3")
ssm = boto3.client("ssm")
ddb = boto3.resource("dynamodb")
stackName = os.getenv("stackName")

def process_row(factory,record, prompt, model_properties):
    
    model_input = factory.generate(
        {**model_properties, "prompt": prompt + record["review"]}
    )
    return {"recordId": record["id"], "modelInput": model_input}


def lambda_handler(event, context):

    ssmParams = getSSMParams()

    game_id = event["game_id"]
    #extract s3 key from s3_raw_data_source_key. example s3_raw_data_source_key: https://gamereviewsanalysisstack-gamereviews0f797a9d-zbgj5bs2wpej.s3.amazonaws.com/31d995a7-6324-47db-a5ad-fb555ac06928/jobs/b732afc7-0666-4d22-b3fd-a1a1f02a6acb/raw-data/elden_ring_steam_reviews_reduced.csv

    s3_source_key = event["s3_raw_data_source_key"].split("/",3)[-1]
    
    print(f"Processing CSV file: {s3_source_key}")
    
    
    job_name = event["job_name"]

    source_bucket_name = os.getenv("s3SourceBucketName")
    target_bucket_name = os.getenv("s3DestinationBucketName")

    prompt = ssmParams["PROMPT"]
    model_id = ssmParams["MODEL_ID"]
    model_temperature = ssmParams["MODEL_TEMPERATURE"]
    model_top_k = ssmParams["MODEL_TOP_K"]
    model_top_p = ssmParams["MODEL_TOP_P"]
    model_max_tokens_to_sample = ssmParams["MODEL_MAX_TOKENS_TO_SAMPLE"]

    model_properties = {
        "temperature": model_temperature,
        "top_k": model_top_k,
        "top_p": model_top_p,
        "max_tokens_to_sample": model_max_tokens_to_sample,
    }

    ModelPayloadFactory = ModelPayloadGeneratorFactory().create_payload_generator(
        model_id
    )

    now = datetime.now()

    s3_job_prefix = f"{game_id}/jobs/{job_name}/{now.year}/{now.month:02d}/{now.day:02d}/{now.hour:02d}"
    s3_input_data_path = f"{s3_job_prefix}/input"
    s3_output_data_path = f"{s3_job_prefix}/output/"

    jsonl_data = f"{s3_input_data_path}/{game_id}_{job_name}_{now.strftime('%Y%m%d%H%M%S')}.jsonl"

    try:
        response = s3.get_object(
            Bucket=f"{source_bucket_name}", Key=s3_source_key
        )
    except Exception as e:
        raise Exception(f"Error retrieving object from S3: {e}")

    csv_data = response["Body"].read().decode("utf-8")
    #validate if csv has id and review columns
    if not ("id" in csv_data and "review" in csv_data):
        raise Exception("Invalid CSV file, missing 'id' or 'review' columns")
    records = csv.DictReader(csv_data.splitlines())

    with io.BytesIO() as jsonl_buffer:

        for record in records:

            try:
                json_object = process_row(ModelPayloadFactory,record, prompt, model_properties)
            except Exception as e:
                print(f"Error processing record: {e}")
                break

            jsonl_buffer.write(f"{json.dumps(json_object)}\n".encode("utf-8"))

        s3.put_object(
            Bucket=target_bucket_name,
            Key=jsonl_data,
            Body=jsonl_buffer.getvalue(),
        )

    return {
        "statusCode": 200,
        "body": {
            "s3_input_data_uri": f"s3://{target_bucket_name}/{jsonl_data}",
            "s3_output_data_uri": f"s3://{target_bucket_name}/{s3_output_data_path}",
        },
    }


def getSSMParams():
    return {
        "S3_SOURCE_BUCKET_NAME": ssm.get_parameter(
            Name=f"/{stackName}/default/S3_SOURCE_BUCKET_NAME"
        )["Parameter"]["Value"],
        "S3_TARGET_BUCKET_NAME": ssm.get_parameter(
            Name=f"/{stackName}/default/S3_TARGET_BUCKET_NAME"
        )["Parameter"]["Value"],
        "MODEL_ID": ssm.get_parameter(Name=f"/{stackName}/default/MODEL_ID")[
            "Parameter"
        ]["Value"],
        "MODEL_TEMPERATURE": float(
            ssm.get_parameter(Name=f"/{stackName}/default/MODEL_TEMPERATURE")[
                "Parameter"
            ]["Value"]
        ),
        "MODEL_TOP_K": int(
            ssm.get_parameter(Name=f"/{stackName}/default/MODEL_TOP_K")["Parameter"][
                "Value"
            ]
        ),
        "MODEL_TOP_P": float(
            ssm.get_parameter(Name=f"/{stackName}/default/MODEL_TOP_P")["Parameter"][
                "Value"
            ]
        ),
        "MODEL_MAX_TOKENS_TO_SAMPLE": int(
            ssm.get_parameter(Name=f"/{stackName}/default/MODEL_MAX_TOKENS_TO_SAMPLE")[
                "Parameter"
            ]["Value"]
        ),
        "PROMPT": ssm.get_parameter(Name=f"/{stackName}/default/PROMPT")["Parameter"][
            "Value"
        ],
    }
