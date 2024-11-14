import os
import boto3
import logging

bedrock = boto3.client(service_name="bedrock")
logger = logging.getLogger()

def lambda_handler(event, context):
    
    game_id = event['game_id']
    job_id = event['job_id']
    job_identifier = event['taskresult']['jobARN']
    
    job = bedrock.get_model_invocation_job(jobIdentifier=job_identifier)
    jobStatus = job['status']
    lastModifiedTime = job['lastModifiedTime']
    lastModifiedTime_int = int(lastModifiedTime.timestamp())
    submitTime = job['submitTime']
    submitTime_int = int(submitTime.timestamp())
    jobMessage = job.get("message", "")

    #update dynamodb table with new status
    dynamodb = boto3.resource('dynamodb')
    table = dynamodb.Table(os.environ.get('ddbTableName'))
    table.update_item(
        Key={'PK': f"GAME#{game_id}", "SK": f"JOB#{job_id}"},
        UpdateExpression="SET jobStatus = :val, jobMessage = :jobMessage, lastModifiedTime = :lastModifiedTime, submitTime = :submitTime",
        ExpressionAttributeValues={
            ':val': jobStatus,
            ':jobMessage': jobMessage,
            ':submitTime': submitTime_int,
            ':lastModifiedTime': lastModifiedTime_int
        }
    )
    return {
        'statusCode': 200,
        'status': job['status'],
        'jobARN': job_identifier
    }
