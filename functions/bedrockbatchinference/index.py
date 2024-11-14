import os
import boto3
import logging
from botocore.exceptions import ClientError

# Set up logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize clients outside the handler
bedrock = boto3.client(service_name="bedrock")
ssm = boto3.client("ssm")
dynamodb = boto3.resource("dynamodb")

# Get environment variables
stack_name = os.getenv("stackName")
ddb_table_name = os.environ.get("ddbTableName")
bedrock_role_arn = os.getenv("BEDROCK_ROLE_ARN")

table = dynamodb.Table(ddb_table_name)

def lambda_handler(event, context):
    try:
        # Input validation
        required_fields = ["taskresult", "job_name", "job_id", "game_id"]
        for field in required_fields:
            if field not in event:
                raise ValueError(f"Missing required field: {field}")

        s3_input_uri = event["taskresult"]["s3_input_data_uri"]
        s3_output_uri = event["taskresult"]["s3_output_data_uri"]
        job_name = event["job_name"]
        job_id = event["job_id"]
        game_id = event["game_id"]

        # Get model ID from SSM Parameter Store
        model_id = ssm.get_parameter(Name=f"/{stack_name}/default/MODEL_ID")["Parameter"]["Value"]

        input_data_config = {"s3InputDataConfig": {"s3Uri": s3_input_uri, "s3InputFormat": "JSONL"}}
        output_data_config = {"s3OutputDataConfig": {"s3Uri": s3_output_uri}}

        # Create model invocation job
        response = bedrock.create_model_invocation_job(
            roleArn=bedrock_role_arn,
            modelId=model_id,
            jobName=job_name,
            inputDataConfig=input_data_config,
            outputDataConfig=output_data_config,
        )

        logger.info(f"Created model invocation job: {response}")

        job_arn = response.get("jobArn")
        if job_arn is None:
            raise Exception("Failed to create model invocation job")

        date = response.get("ResponseMetadata", {}).get("HTTPHeaders", {}).get("date", "Not Found")

        # Update DynamoDB table
        table.update_item(
            Key={"PK": f"GAME#{game_id}", "SK": f"JOB#{job_id}"},
            UpdateExpression="SET jobARN = :jobARN, jobStatus = :jobStatus, s3OutputURI = :s3OutputURI, invokedAt = :invokedAt",
            ExpressionAttributeValues={":jobARN": job_arn, ":jobStatus": "Submitted", ":s3OutputURI": s3_output_uri, ":invokedAt": date},
        )

        return {"statusCode": 200, "body": {"jobARN": job_arn}}

    except ValueError as ve:
        logger.error(f"Input validation error: {str(ve)}")
        return {"statusCode": 400, "body": str(ve)}
    except ClientError as ce:
        logger.error(f"AWS service error: {str(ce)}")
        return {"statusCode": 500, "body": f"AWS service error: {str(ce)}"}
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        return {"statusCode": 500, "body": f"Unexpected error: {str(e)}"}
