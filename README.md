
# Game Reviews Sentiment analysis and summarisation
Collecting game feedback is crucial throughout the lifecycle of a game. Games go through several phases, including planning, pre-production, production, testing, pre-launch, launch, and post-production. Traditionally, feedback was collected during the pre-production phase following long user testing processes, and feedback collected during the post-production phase was typically used for the development of the company's next game. However, more and more games have adopted the GaaS (Game as a Service) or "live services" model, where games continue to evolve after their launch through player feedback and iteration. Examples of this type of game include Epic Games' Fortnite and Riot's League of Legends.

Video game development decisions should be data-driven. Player feedback is a vital data source collected through various methods - from spontaneous social media commentary to more structured research via user testing and surveys. Player feedback has differing values, as it may come from seasoned gamers or newcomers, and interpreting such diverse commentary is challenging.

Game reviews are one form of feedback, gathered from digital storefronts and prominent critic websites. These critiques play a vital role in driving game success in the modern age of electronic word-of-mouth (eWOM). Game designers struggle to derive insights from the deluge of reviews received by hit titles, and new AI systems could efficiently parse massive review pools to identify and summarize the most constructive design feedback.

Conducting effective analysis requires carefully engineered prompts tailored to each use case. Prompt engineering involves crafting model inputs that shape and guide language model responses, and well-designed prompts can steer models toward useful, nuanced, and benign outputs.

## Solution Overview
The solution for sentiment analysis, classification and summarization of game reviews consists of six main components:

1. User experience
2. Request management
3. Workflow orchestration for sentiment analysis and classification
4. Data and metadata storage
5. Summarization
6. Monitoring

![alt text](assets/solution2-High%20Level%20Arch.png "Solution diagram")

User experience: The solution contains a static web application hosted in Amazon Simple Storage Service (Amazon S3). We deploy an Amazon CloudFront distribution to serve this static website and implement origin access control (OAC) to restrict access to the Amazon S3 origin. Additionally, we use Amazon Cognito to protect the web application from unauthorized access.

Request management: We use Amazon API Gateway as the entry point for all near real-time communication between the UI application and the APIs exposed by the different workloads of the solution. Through this gateway, users can initiate requests for creating, reading, updating, deleting (CRUD) data, as well as running workflows. The API requests also invoke Amazon Web Services (AWS) Lambda functions that send the pre-processed requests to AWS Step Functions and retrieve and summarize reviews.

Workflow orchestration for sentiment analysis and classification: The sentiment analysis and classification of game reviews begins by creating a JSONL file containing the necessary prompt and properties required for analyzing each review. Using Anthropic Claude 3.5 Sonnet, a large language foundation model hosted in Amazon Bedrock, we process the game reviews in batches.

Amazon Bedrock is a fully managed service that offers a choice of high-performing foundation models (FMs) from leading AI companies. It also enables you to bring your own custom models and use them seamlessly on Amazon Bedrock. We encourage you to experiment with different models to find what works best for your company’s situation.

After the Amazon Bedrock job completes, the batch analysis results are stored in an S3 bucket. We then read the results from the S3 bucket and store them in Amazon DynamoDB, enabling users to query the results and filter game reviews based on their topic classification and sentiment.

Data and metadata storage: This solution leverages Amazon S3 for storing uploaded game reviews and output results, providing durable, highly available, and scalable data storage at a low cost. We use Amazon DynamoDB, a NoSQL database service, to store all analysis and job metadata, allowing users to track batch job status and other relevant information efficiently.

Monitoring: The solution stores the logs in Amazon CloudWatch Logs, providing invaluable monitoring information during both development and live operations.

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

