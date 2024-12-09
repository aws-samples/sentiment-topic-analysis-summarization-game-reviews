
# Game Reviews Sentiment analysis and summarisation
Collecting game feedback is crucial throughout the lifecycle of a game. Games go through several phases, including planning, pre-production, production, testing, pre-launch, launch, and post-production. Traditionally, feedback was collected during the pre-production phase following long user testing processes, and feedback collected during the post-production phase was typically used for the development of the company's next game. However, more and more games have adopted the GaaS (Game as a Service) or "live services" model, where games continue to evolve after their launch through player feedback and iteration. Examples of this type of game include Epic Games' Fortnite and Riot's League of Legends.

Video game development decisions should be data-driven. Player feedback is a vital data source collected through various methods - from spontaneous social media commentary to more structured research via user testing and surveys. Player feedback has differing values, as it may come from seasoned gamers or newcomers, and interpreting such diverse commentary is challenging.

Game reviews are one form of feedback, gathered from digital storefronts and prominent critic websites. These critiques play a vital role in driving game success in the modern age of electronic word-of-mouth (eWOM). Game designers struggle to derive insights from the deluge of reviews received by hit titles, and new AI systems could efficiently parse massive review pools to identify and summarize the most constructive design feedback.

Conducting effective analysis requires carefully engineered prompts tailored to each use case. Prompt engineering involves crafting model inputs that shape and guide language model responses, and well-designed prompts can steer models toward useful, nuanced, and benign outputs.

## Solution Overview

![alt text](assets/solution2-High%20Level%20Arch.png "Solution diagram")

These following steps talk through the sequence of actions that enable game reviews sentiment analysis and summarization with AWS AI/ML services.

1. Amazon Simple Storage Service (Amazon S3) hosts a static website for the video summarization workload, served by an Amazon CloudFront distribution. Amazon Cognito provides customer identity and sign-in functionality to the web application.
2. Amazon S3 stores the source CSV files which are uploaded through Pre-signed URLs.
3. To perform sentiment and analysis for each review, make an API call to Amazon API Gateway that invokes a Lambda function that executes a new AWS Step Functions workflow.
4. Geenetate JSONL file from the uploaded CSV which is the required format for Amazon Bedrock batch inference API
5. Amazon Bedrock endpoint initiates the batch inference for all reviews.
6. An AWS Lambda function is checking the job status and updates the status of the job in Amazon DynamoDB.
7. AWS Lambda function store the results as Amazon DynamoDB entries in a table
8. Amazon S3 stores the Amazon Bedrock analysis results that offers durable, highly available and scalable data storage at low cost.
9. Amazon Bedrock Converse API is used to chat with LLMs
10. Amazon Bedrock Converse API is using tools to make external requests to the Amazon DynamoDB table in order to get reviews relavant to the prompt from the user.
11. Amazon CloudWatch and Amazon EventBridge monitor in near real-time every component, and can be used to integrate this workflow into other systems.

# Prerequisites

* Create an AWS account if you do not already have one. The IAM user that you will use must have sufficient permissions to make necessary AWS service calls and manage AWS resources
* AWS CLI installed and configured
* Git installed
* Python 3.12 installed
* AWS Cloud Development Kit ( CDK ) installed
* AWS Serverless Application Model (AWS SAM) installed
* Node
    * The front end for this solution is a React web application that can be run locally using Node
* NPM
* Docker
    * Is required to create the AWS Lambda layers needed by Lambda functions

## Amazon Bedrock requirements

Base Models Access

If you are looking to interact with models from Amazon Bedrock, you need to request access to the base models in one of the regions where Amazon Bedrock is available. Make sure to read and accept models' end-user license agreements or EULA.
Note:

You can deploy the solution to a different region from where you requested Base Model access.
While the Base Model access approval is instant, it might take several minutes to get access and see the list of models in the console.

## Deployment

* Clone the repository:

```
git clone git@ssh.gitlab.aws.dev:tolischr_content/game-reviews-analysis-and-summarisation.git
```

* Move into the cloned repository:

```
cd game-reviews-summarization
```

* Prepare the deployment

```
cd cdk
npm install
cd resources/ui
npm install
```

* Deploy

```
./scripts/deploy-app.sh --create-layers
```

Cleaning up

Initially, clear or remove the objects present in both the S3 primary and processing buckets. Ideally, the processing bucket should be empty, but if there are any objects, ensure to delete them.
Then run the command

```
cdk destroy --all
```

