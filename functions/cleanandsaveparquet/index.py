import boto3
import json
import io
import pandas as pd
import re

s3 = boto3.client("s3")

def lambda_handler(event, context):

    jobArn = event['taskresult']['jobARN']
    jobId = jobArn.split("/")[-1]
    gameID = event['game_id']
    bucket = event['bucket']
    keypath = f"{gameID}/output/{jobId}"

    print("bucket", bucket)
    print("keypath", keypath)
    
    
    s3_object = s3.get_object(
        Bucket=bucket,
        Key=f"{keypath}/data.jsonl.out"
    )

    json_data = s3_object["Body"].read().decode("utf-8").splitlines()
    
    records = []
    pattern = r"<result>(.*?)</result>"
    regex = r"Game Review:(.*?)Assistant"
    
    for item in json_data:
        json_item = json.loads(item)
        prompt = json_item["modelInput"]["prompt"]
        result = json_item["modelOutput"]["completion"]
        match = re.search(pattern, result)
        gamereviewmatch = re.search(regex,prompt, re.DOTALL)
        gamereview = ""
        if(gamereviewmatch):
            gamereview = gamereviewmatch.group(1)
        else:
            gamereview = "not found"
        if match:
            result_string = match.group(1).replace('\\"', '"')

            json_data = remove_extra_data(result_string)
            
        else:
            json_data = {"overall_sentiment":"null","classifications":[]}
            
        
        record = {
            "recordId": json_item["recordId"],
            "prompt": json_item["modelInput"]["prompt"],
            "gamereview": gamereview,
            "overall_sentiment": json_data["overall_sentiment"],
            "classifications": json_data["classifications"],
        }

        records.append(record)
        
    df = pd.DataFrame(records)
    exploded = df.explode('classifications').reset_index(drop=True)

    new_df = exploded['classifications'].apply(pd.Series)
    new_df = pd.concat([exploded['recordId'], exploded['overall_sentiment'], exploded['prompt'], exploded['gamereview'], new_df], axis=1)
    new_df = new_df.drop(0, axis=1)
    parquet_buffer = io.BytesIO()
    
    new_df.to_parquet(parquet_buffer, engine='pyarrow')
    try:
        response = s3.put_object(Body=parquet_buffer.getvalue(), Bucket=bucket, Key=f"{keypath}/output.parquet")
        print(f'Object saved successfully! Response: {response}')
    except Exception as e:
        print(f'Error saving object to S3: {e}')

    return {
        'statusCode': 200,
        'jobARN': jobArn,
        'gameID': gameID,
        'bucket': bucket,
    }


def remove_extra_data(json_str):
    try:
        data = json.loads(json_str)
        return data
    except json.JSONDecodeError as e:
        # Find the position of the error
        idx = e.pos

        # Remove extra data from the string
        cleaned_json_str = json_str[:idx]

        # Try parsing the cleaned string
        try:
            data = json.loads(cleaned_json_str)
            return data
        except json.JSONDecodeError:
            raise ValueError("Invalid JSON")