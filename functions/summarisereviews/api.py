import json
import boto3
from boto3.dynamodb.conditions import Key, Attr
from botocore.response import StreamingBody

dynamodb = boto3.resource('dynamodb')
table_name = 'GameReviewsAnalysisStack-GameReviewTable44E34D3B-1MGLS4ZD7M504'  # Replace with your DynamoDB table name
table = dynamodb.Table(table_name)

bedrock_client = boto3.client("bedrock-runtime")

def lambda_handler(event, context):
    # Parse path parameters
    game_id = event['pathParameters']['gameId']

    # Parse query parameters
    topic = event['queryStringParameters'].get('topic')
    sentiment = event['queryStringParameters'].get('sentiment')

    # Build DynamoDB query expression
    key_condition_expression = Key('PK').eq(f"GAME#{game_id}")
    expression_attribute_values = {}
    filter_expression = None

    if topic:
        filter_expression = Attr('classifications.topic').eq(topic)
        expression_attribute_values[':topic'] = topic

    if sentiment:
        if filter_expression:
            filter_expression = filter_expression & Attr('classifications.sentiment').eq(sentiment)
        else:
            filter_expression = Attr('classifications.sentiment').eq(sentiment)
        expression_attribute_values[':sentiment'] = sentiment

    # Query DynamoDB table
    response = table.query(
        KeyConditionExpression=Key("PK").eq(f"GAME#{game_id}"),
        FilterExpression=Attr("classifications").contains(
            {"topic": f"{topic}", "sentiment": f"{sentiment}"}
        ),
    )


    # Merge review text into a single string
    review_text = ' '.join([item['review'] for item in response['Items']])

    # Call Bedrock Claude 3 API for summarization
    summarization_params = {
        "modelId": "anthropic.claude-3-sonnet-20240229-v1:0",
        "contentType": "application/json",
        "accept": "application/json",
        "body": json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 10000,
            "messages": [
                {"role": "user", "content": [{"type": "text", "text": f"Summarize the {topic} for the following reviews:\n{review_text}"}]}
            ],
            "temperature": 0.7,
            "top_p": 0.9
        })
    }

    # Call the Bedrock API to generate the summary
    response = bedrock_client.invoke_model(**summarization_params)

    summary = response["body"].read().decode("utf-8")
    return {
        'statusCode': 200,
        'headers': {
            'Content-Type': 'application/json'
        },
        'body': json.dumps({'summary': summary})
    }
