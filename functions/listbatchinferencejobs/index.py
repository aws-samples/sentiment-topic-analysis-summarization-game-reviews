import boto3

def lambda_handler(event, context):
    
    bedrock = boto3.client(service_name="bedrock")
    jobs = bedrock.list_model_invocation_jobs()
    invocationJobs = jobs['invocationJobSummaries']

    #list jonArna and status
    for job in invocationJobs:
        jobArn = job['jobArn']
        status = job['status']
        print(f"Job ARN: {jobArn}, Status: {status}")

    
    return {
        'statusCode': 200
    }
