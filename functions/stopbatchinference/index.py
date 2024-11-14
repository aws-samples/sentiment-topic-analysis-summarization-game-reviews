import boto3

def lambda_handler(event, context):
    
    job_identifier = event['jobARN']
    bedrock = boto3.client(service_name="bedrock")
    job = bedrock.stop_model_invocation_job(jobIdentifier=job_identifier)
    print(job)
    
    return {
        'statusCode': 200
    }
