import json
import boto3
from boto3.dynamodb.conditions import Key, Attr


# summarise with Bedrock Claude 3
def summarise(reviews):
    # Initialize Bedrock client
    bedrock_client = boto3.client("bedrock-runtime")
    # Define the prompt and parameters for the Bedrock model
    prompt = f"Summarize the following reviews:\n{reviews}"
    summarization_params = {
        "modelId": "anthropic.claude-3-sonnet-20240229-v1:0",
        "contentType": "application/json",
        "accept": "application/json",
        "body": json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 10000,
            "messages": [
                {"role": "user", "content": [{"type": "text", "text": prompt}]}
            ],
            "temperature": 0.7,
            "top_p": 0.9
        }),
    }

    # Call the Bedrock API to generate the summary
    response = bedrock_client.invoke_model(**summarization_params)

    # Extract the summary from the response
    summary = response["body"].read().decode("utf-8")

    # Print the summary
    print(f"Summary: {summary}")

    return summary


def query_positive_gameplay_reviews(game_name):
    # Initialize DynamoDB client
    dynamodb = boto3.resource("dynamodb")

    # Reference the table
    table = dynamodb.Table(
        "GameReviewsAnalysisStack-GameReviewTable44E34D3B-1MGLS4ZD7M504"
    )

    # Perform the query
    response = table.query(
        KeyConditionExpression=Key("PK").eq(f"GAME#{game_name}"),
        FilterExpression=Attr("classifications").contains(
            {"topic": "Gameplay", "sentiment": "Negative"}
        ),
    )

    # Process and return the results
    items = response["Items"]

    # while 'LastEvaluatedKey' in response:
    #     response = table.query(
    #         KeyConditionExpression=Key('PK').eq(f'GAME#{game_name}'),
    #         FilterExpression=Attr('classifications').contains({
    #             'topic': 'Gameplay',
    #             'sentiment': 'Positive'
    #         }),
    #         ExclusiveStartKey=response['LastEvaluatedKey']
    #     )
    #     items.extend(response['Items'])

    return items


# Execute the query and print results
if __name__ == "__main__":
    game_name = "elden-ring"  # You can change this to query different games
    positive_gameplay_reviews = query_positive_gameplay_reviews(game_name)

    print(
        f"Found {len(positive_gameplay_reviews)} positive Gameplay reviews for {game_name}:"
    )
    reviewText = ""
    for review in positive_gameplay_reviews:
        print(f"Review ID: {review['SK'].split('#')[1]}")
        print(
            f"Review: {review['review']}..."
        )  # Print first 100 characters of the review
        print("-" * 50)
        reviewText += review['review']

    summary = summarise(reviewText)

    print(summary)
