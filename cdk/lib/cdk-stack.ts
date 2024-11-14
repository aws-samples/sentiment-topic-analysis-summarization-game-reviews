import { CfnOutput, Duration, Stack, StackProps, aws_ssm as ssm } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ddb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as dotenv from "dotenv";
import * as fs from "fs";
import path = require("path");
import * as yaml from 'js-yaml';
import { AmplifyAuth } from '@aws-amplify/auth-construct'
import * as cr from 'aws-cdk-lib/custom-resources';
import * as logs from 'aws-cdk-lib/aws-logs';


dotenv.config({ path: path.resolve(__dirname, "../.env") });

interface GameReviewsAnalysisStackProps extends cdk.StackProps {
  websiteDomain: string;
}


export class GameReviewsAnalysisStack extends Stack {
  constructor(scope: Construct, id: string, props?: GameReviewsAnalysisStackProps) {
    super(scope, id, props);

    const appEnv = this.node.tryGetContext('APP_ENV') || 'production'
    const allowedOrigins: string[] = []

    if (appEnv === 'development') {
      allowedOrigins.concat(["http://localhost:5173", "http://localhost:5174"])
    } else {
      allowedOrigins.push(`https://${props?.websiteDomain}`)
    }



    const lifecycleRules = [
      {
        expiration: cdk.Duration.days(365),
        transitions: [
          {
            storageClass: s3.StorageClass.INFREQUENT_ACCESS,
            transitionAfter: cdk.Duration.days(30),
          },
          {
            storageClass: s3.StorageClass.GLACIER,
            transitionAfter: cdk.Duration.days(90),
          },
        ],
      },
    ]

    // Cognito auth stack
    const frontendAuth = new AmplifyAuth(this, 'frontendAuth', {
      loginWith: {
        email: true
      }
    });

    const userPoolId = frontendAuth.resources.userPool.userPoolId;
    const userPoolClientId = frontendAuth.resources.userPoolClient.userPoolClientId;
    const identityPoolId = frontendAuth.resources.cfnResources.cfnIdentityPool.ref;


    const filepath = path.join(__dirname, 'variables.yml');
    const fileContents = fs.readFileSync(filepath, 'utf-8');

    const data = yaml.load(fileContents) as Record<string, string>;

    for (const key in data) {
      new ssm.StringParameter(this, `${key}_SSMParameter`, {
        parameterName: `/${this.stackName}/default/${key}`,
        stringValue: data[key]
      })
    }

    const gameReviewTable = new ddb.Table(this, 'GameReviewTable', {
      partitionKey: { name: 'PK', type: ddb.AttributeType.STRING },
      sortKey: { name: 'SK', type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      encryption: ddb.TableEncryption.AWS_MANAGED,
    })

    gameReviewTable.addGlobalSecondaryIndex({
      indexName: 'GameUserIndex',
      partitionKey: { name: 'user_id', type: ddb.AttributeType.STRING },
      sortKey: { name: 'created_on', type: ddb.AttributeType.STRING },
      projectionType: ddb.ProjectionType.ALL,
    })

    const logBucket = new s3.Bucket(this, 'MainLogBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      versioned: true,
      lifecycleRules: lifecycleRules
    });

    const privateS3Bucket = new s3.Bucket(this, 'gamereviews', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      serverAccessLogsBucket: logBucket,
      serverAccessLogsPrefix: 'access-logs/',
      lifecycleRules: lifecycleRules,
      cors: [
        {
          allowedHeaders: ['*'],
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.DELETE,
            s3.HttpMethods.HEAD,
          ],
          allowedOrigins: allowedOrigins,
          exposedHeaders: ['ETag'],
          maxAge: 3000,
        },
      ],
    })



    const gameReviewsAnalysisSuccessTopic = new sns.Topic(this, 'GameReviewsAnalysisSuccessTopic', {
      displayName: 'Game Reviews Analysis Success Topic'
    })

    const gameReviewsAnalysisFailureTopic = new sns.Topic(this, 'GameReviewsAnalysisFailureTopic', {
      displayName: 'Game Reviews Analysis Failure Topic'
    })

    const gamesCrudLayer = new lambda.LayerVersion(this, 'GameCrudLayer', {
      code: lambda.Code.fromAsset('../functions/lambda_layers/gamescrud/layer.zip'),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_12],
      description: 'Game CRUD Layer',
    })

    const prepareForInferenceLambda = new lambda.Function(this, 'PrepareForInferenceLambda', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('../functions/prepareforinference'),
      handler: 'index.lambda_handler',
      timeout: Duration.seconds(300),
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        stackName: this.stackName,
        s3SourceBucketName: privateS3Bucket.bucketName,
        s3DestinationBucketName: privateS3Bucket.bucketName,
        ddbTableName: gameReviewTable.tableName
      },
    })

    const prepareForInferenceRole = prepareForInferenceLambda.role
    prepareForInferenceRole?.attachInlinePolicy(new iam.Policy(this, 'prepareForInferencePolicy', {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            's3:GetObject',
            's3:PutObject',
            's3:ListBucket'
          ],
          resources: [
            `${privateS3Bucket.bucketArn}`,
            `${privateS3Bucket.bucketArn}/*`
          ]
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'ssm:GetParameter',
            'ssm:GetParameters',
            'ssm:PutParameter'
          ],
          resources: [
            `arn:aws:ssm:${this.region}:${this.account}:parameter/${this.stackName}/default/*`
          ]
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'dynamodb:BatchGetItem',
            'dynamodb:BatchWriteItem',
            'dynamodb:ConditionCheckItem',
            'dynamodb:DeleteItem',
            'dynamodb:GetItem',
            'dynamodb:PutItem',
            'dynamodb:Query',
            'dynamodb:Scan',
            'dynamodb:UpdateItem'
          ],
          resources: [
            gameReviewTable.tableArn
          ]
        })
      ]
    }))

    const bedrockBatchInferenceLambdaLayer = new lambda.LayerVersion(this, 'BedrockBatchInferenceLayer', {
      code: lambda.Code.fromAsset('../functions/lambda_layers/boto3-layer/layer.zip'),
      compatibleRuntimes: [
        lambda.Runtime.PYTHON_3_12
      ]
    })

    const bedrockBatchInferenceRole = new iam.Role(this, "BedrockBatchInferenceRole", {
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonDynamoDBFullAccess")
      ],
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal("bedrock.amazonaws.com"),
        new iam.AccountRootPrincipal().withConditions({
          StringEquals: {
            "aws:SourceAccount": this.account,
          },
          ArnEquals: {
            "aws:SourceArn": `arn:aws:bedrock:${this.region}:${this.account}:model-invocation-job/*`,
          },
        })
      ),
    })

    bedrockBatchInferenceRole.attachInlinePolicy(new iam.Policy(this, 'access s3', {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            's3:GetObject',
            's3:PutObject',
            's3:ListBucket'
          ],
          resources: [
            `${privateS3Bucket.bucketArn}`,
            `${privateS3Bucket.bucketArn}/*`
          ]
        })
      ]
    }))

    const bedrockBatchInferenceLambda = new lambda.Function(this, 'BedrockBatchInferenceLambda', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('../functions/bedrockbatchinference'),
      handler: 'index.lambda_handler',
      layers: [bedrockBatchInferenceLambdaLayer],
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        stackName: this.stackName,
        BEDROCK_ROLE_ARN: bedrockBatchInferenceRole.roleArn,
        ddbTableName: gameReviewTable.tableName
      }
    })

    const bedrockBatchInferenceLambdaRole = bedrockBatchInferenceLambda.role
    bedrockBatchInferenceLambdaRole?.addToPrincipalPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["iam:PassRole"],
      resources: [bedrockBatchInferenceRole.roleArn]
    }))
    bedrockBatchInferenceLambdaRole?.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonBedrockFullAccess'))
    bedrockBatchInferenceLambdaRole?.attachInlinePolicy(new iam.Policy(this, 'bedrockBatchInferenceLambdaPolicy', {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            's3:GetObject',
            's3:PutObject'
          ],
          resources: [
            `${privateS3Bucket.bucketArn}/*`
          ]
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'ssm:GetParameter',
            'ssm:GetParameters',
            'ssm:PutParameter'
          ],
          resources: [
            `arn:aws:ssm:${this.region}:${this.account}:parameter/${this.stackName}/default/*`
          ]
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'dynamodb:UpdateItem'
          ],
          resources: [
            gameReviewTable.tableArn
          ]
        })
      ]
    }))

    const checkJobStatusLambda = new lambda.Function(this, 'CheckJobStatusLambda', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('../functions/checkjobstatus'),
      handler: 'index.lambda_handler',
      layers: [bedrockBatchInferenceLambdaLayer],
      role: bedrockBatchInferenceLambdaRole,
      timeout: Duration.seconds(120),
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        stackName: this.stackName,
        ddbTableName: gameReviewTable.tableName
      }
    })

    const stopBatchInference = new lambda.Function(this, 'StopBatchInferenceLambda', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('../functions/stopbatchinference'),
      handler: 'index.lambda_handler',
      layers: [bedrockBatchInferenceLambdaLayer],
      role: bedrockBatchInferenceLambdaRole,
      tracing: lambda.Tracing.ACTIVE,
    })

    const listBatchInferenceJobs = new lambda.Function(this, 'ListBatchInferenceJobsLambda', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('../functions/listbatchinferencejobs'),
      handler: 'index.lambda_handler',
      layers: [bedrockBatchInferenceLambdaLayer],
      role: bedrockBatchInferenceLambdaRole,
      tracing: lambda.Tracing.ACTIVE,
    })

    const parseAndStoreResults = new lambda.Function(this, 'ParseAndStoreResultsLambda', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('../functions/parseandstoreresults'),
      handler: 'index.lambda_handler',
      role: prepareForInferenceRole,
      timeout: Duration.seconds(120),
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        ddbTableName: gameReviewTable.tableName,
        gameDataBucketName: privateS3Bucket.bucketName
      }
    })

    const summarizeReviews = new lambda.Function(this, 'SummarizeReviewsLambda', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('../functions/summarisereviews'),
      handler: 'api.lambda_handler',
      role: prepareForInferenceRole,
      timeout: Duration.seconds(120),
      tracing: lambda.Tracing.ACTIVE,
    })

    const prepareforinferenceTask = new tasks.LambdaInvoke(this, 'PrepareForInference', {
      lambdaFunction: prepareForInferenceLambda,
      payload: sfn.TaskInput.fromJsonPathAt('$'),
      resultPath: '$.taskresult',
      resultSelector: {
        "s3_input_data_uri.$": "$.Payload.body.s3_input_data_uri",
        "s3_output_data_uri.$": "$.Payload.body.s3_output_data_uri"
      }

    })

    const BedrockBatchInferenceTask = new tasks.LambdaInvoke(this, 'BedrockBatchInference', {
      lambdaFunction: bedrockBatchInferenceLambda,
      payload: sfn.TaskInput.fromJsonPathAt('$'),
      resultPath: '$.taskresult',
      resultSelector: {
        "jobARN.$": "$.Payload.body.jobARN"
      }

    })

    const waitTask = new sfn.Wait(this, 'Wait', {
      time: sfn.WaitTime.duration(Duration.seconds(30))
    })

    const checkJobStatusTask = new tasks.LambdaInvoke(this, 'CheckJobStatus', {
      lambdaFunction: checkJobStatusLambda,
      resultPath: '$.taskresult',
      resultSelector: {
        "status.$": "$.Payload.status",
        "jobARN.$": "$.Payload.jobARN"
      }
    })

    const sendSuccessMessage = new tasks.SnsPublish(this, "Publish Message - Analysis Successful", {
      topic: sns.Topic.fromTopicArn(this, `Send job status - Successful`, gameReviewsAnalysisSuccessTopic.topicArn),
      message: sfn.TaskInput.fromObject({
        "gameID": sfn.JsonPath.stringAt("$.game_id"),
        "jobARN": sfn.JsonPath.stringAt("$.taskresult.jobARN")
      })
    })

    const sendFailureMessage = new tasks.SnsPublish(this, "Analysis Failed", {
      topic: sns.Topic.fromTopicArn(this, `Send job status - Failed`, gameReviewsAnalysisFailureTopic.topicArn),
      message: sfn.TaskInput.fromJsonPathAt('$')
    })

    const sendStoppedMessage = new tasks.SnsPublish(this, "Analysis Stopped", {
      topic: sns.Topic.fromTopicArn(this, `Send job status - Stopped`, gameReviewsAnalysisFailureTopic.topicArn),
      message: sfn.TaskInput.fromJsonPathAt('$')
    })

    const storeResultsToDB = new tasks.LambdaInvoke(this, 'StoreResultsToDB', {
      lambdaFunction: parseAndStoreResults,
      payload: sfn.TaskInput.fromJsonPathAt('$'),
      resultPath: '$.taskresult'
    })

    const stateMachine = new sfn.StateMachine(this, 'BedrockBatchInferenceStateMachine', {
      tracingEnabled: true,
      definitionBody: sfn.DefinitionBody
        .fromChainable(
          prepareforinferenceTask
            .next(BedrockBatchInferenceTask.addRetry(
              {
                errors: ['ServiceQuotaExceededException'],
                maxAttempts: 3,
                interval: Duration.minutes(6),
                backoffRate: 2
              }
            ))
            .next(waitTask)
            .next(checkJobStatusTask)
            .next(new sfn.Choice(this, 'Job Complete?')
              .when(sfn.Condition.stringEquals(
                '$.taskresult.status', 'Completed'
              ), storeResultsToDB
                .next(new sfn.Succeed(this, 'Job Succeeded')))
              .when(sfn.Condition.stringEquals(
                '$.taskresult.status', 'Failed'
              ), sendFailureMessage.next(new sfn.Fail(this, 'Job Failed')))
              .when(sfn.Condition.stringEquals(
                '$.taskresult.status', 'Stopped'
              ), sendStoppedMessage.next(new sfn.Succeed(this, 'Job Stopped')))
              .otherwise(waitTask)
            )
        )
    })

    const gamescrudRole = new iam.Role(this, 'GamesCrudRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    gamescrudRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
        'dynamodb:Query',
        'dynamodb:Scan'
      ],
      resources: [gameReviewTable.tableArn]
    }));

    gamescrudRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:DeleteObject',
        's3:ListBucket'
      ],
      resources: [
        `${privateS3Bucket.bucketArn}/*`
      ]
    }));

    gamescrudRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:ListBucket'
      ],
      resources: [
        privateS3Bucket.bucketArn
      ]
    }));

    gamescrudRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'states:StartExecution'
      ],
      resources: [stateMachine.stateMachineArn]
    }));

    gamescrudRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
    );

    const gamescrud = new lambda.Function(this, 'GamesCrud', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('../functions/gamescrud'),
      handler: 'index.lambda_handler',
      timeout: Duration.seconds(300),
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        ddbTableName: gameReviewTable.tableName,
        gameDataBucketName: privateS3Bucket.bucketName,
        stateMachineArn: stateMachine.stateMachineArn,
        APP_ENV: appEnv
      },
      layers: [gamesCrudLayer],
      role: gamescrudRole
    })

    // Create API Gateway Lambda integration
    const gameCrudIntegration = new apigateway.LambdaIntegration(gamescrud);

    const apiGatewayLoggingRole = new iam.Role(this, 'ApiGatewayLoggingRole', {
      assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonAPIGatewayPushToCloudWatchLogs')
      ]
    });

    const passRolePolicy = new iam.PolicyStatement({
      actions: ['iam:PassRole'],
      resources: [apiGatewayLoggingRole.roleArn],
      effect: iam.Effect.ALLOW
    });


    new cr.AwsCustomResource(this, 'SetApiGatewayLoggingRole', {
      onUpdate: {
        service: 'ApiGateway',
        action: 'updateAccount',
        parameters: {
          patchOperations: [
            {
              op: 'replace',
              path: '/cloudwatchRoleArn',
              value: apiGatewayLoggingRole.roleArn
            }
          ]
        },
        physicalResourceId: cr.PhysicalResourceId.of('ApiGatewayAccountUpdate')
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['apigateway:GET', 'apigateway:PATCH'],
          resources: ['arn:aws:apigateway:*::/account']
        }),
        passRolePolicy
      ])
    });

    const apiLogGroup = new logs.LogGroup(this, 'ApiGatewayLogs', {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const gamesAPI = new apigateway.RestApi(this, 'GameCrudApi', {
      restApiName: 'Game CRUD API',
      description: 'This service serves game CRUD operations.',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: apigateway.Cors.DEFAULT_HEADERS,
        allowCredentials: true,
        maxAge: cdk.Duration.days(10),
      },
      deployOptions: {
        tracingEnabled: true,
        accessLogDestination: new apigateway.LogGroupLogDestination(apiLogGroup),
        accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields(),
        loggingLevel: apigateway.MethodLoggingLevel.INFO,  // Add this line
        dataTraceEnabled: true,  // Add this line for full request/response logging
        throttlingBurstLimit: 10,
        throttlingRateLimit: 10
      }
    });

    const requestValidator = new apigateway.RequestValidator(this, 'GameCrudRequestValidator', {
      restApi: gamesAPI,
      requestValidatorName: 'GameCrudRequestValidator',
      validateRequestBody: true,
      validateRequestParameters: true,
    });

    const auth = new apigateway.CognitoUserPoolsAuthorizer(this, 'GameCrudAuthorizer', {
      cognitoUserPools: [frontendAuth.resources.userPool],
      authorizerName: 'GameCrudAuthorizer',
    });

    const GameModel = new apigateway.Model(this, 'GameModel', {
      restApi: gamesAPI,
      contentType: 'application/json',
      description: 'Game model',
      modelName: 'Game',
      schema: {
        type: apigateway.JsonSchemaType.OBJECT,
        required: ['title'],
        properties: {
          title: {
            type: apigateway.JsonSchemaType.STRING,
            description: 'The title of the game',
            minLength: 3
          },
        },
      },
    })

    const JobModel = new apigateway.Model(this, 'JobModel', {
      restApi: gamesAPI,
      contentType: 'application/json',
      description: 'Job model',
      modelName: 'Job',
      schema: {
        type: apigateway.JsonSchemaType.OBJECT,
        required: ['gameId', 'job_name'],
        properties: {
          gameId: { type: apigateway.JsonSchemaType.STRING },
          job_name: { type: apigateway.JsonSchemaType.STRING },
          job_description: { type: apigateway.JsonSchemaType.STRING },
        }
      },
    })

    const UploadFileModel = new apigateway.Model(this, 'UploadFileModel', {
      restApi: gamesAPI,
      contentType: 'application/json',
      description: 'Upload file model',
      modelName: 'UploadFile',
      schema: {
        type: apigateway.JsonSchemaType.OBJECT,
        properties: {
          filename: { type: apigateway.JsonSchemaType.STRING },
        }
      },
    })


    // Create API resources and methods
    const gamesResource = gamesAPI.root.addResource('games');

    gamesResource.addMethod('GET', gameCrudIntegration, {
      authorizer: auth,
      requestValidator: requestValidator,
    });
    gamesResource.addMethod('POST', gameCrudIntegration, {
      authorizer: auth,
      requestValidator: requestValidator,
      requestModels: {
        'application/json': GameModel,
      },
    });

    //add openapi.json response
    const openAPIResource = gamesAPI.root.addResource('openapi.json');
    openAPIResource.addMethod('GET', gameCrudIntegration);

    const uploadResource = gamesAPI.root.addResource('upload-url');
    uploadResource.addMethod('GET', gameCrudIntegration, {
      authorizer: auth,
    });

    const analyseCSV = gamesAPI.root.addResource('process-csv');
    analyseCSV.addMethod('POST', gameCrudIntegration, {
      authorizer: auth,
    });

    const docsResource = gamesAPI.root.addResource('docs');
    docsResource.addMethod('GET', gameCrudIntegration, {
      authorizer: auth,
    });

    const gameResource = gamesResource.addResource('{game_id}');
    gameResource.addMethod('GET', gameCrudIntegration, {
      authorizer: auth,
    });  // Get game
    gameResource.addMethod('PUT', gameCrudIntegration, {
      authorizer: auth,
    });
    gameResource.addMethod('DELETE', gameCrudIntegration, {
      authorizer: auth,
    });

    const jobsResource = gameResource.addResource('analysis-jobs');
    jobsResource.addMethod('GET', gameCrudIntegration, { authorizer: auth, });
    jobsResource.addMethod('POST', gameCrudIntegration, {
      authorizer: auth,
      requestValidator: requestValidator,
      requestModels: {
        'application/json': JobModel,
      },
    });

    const jobResource = jobsResource.addResource('{job_id}');
    jobResource.addMethod('GET', gameCrudIntegration, { 
      authorizer: auth 
    });
    jobResource.addMethod('DELETE', gameCrudIntegration, {
      authorizer: auth,
    });
    jobResource.addMethod('PUT', gameCrudIntegration, {
      authorizer: auth,
    });
    jobResource.addMethod('POST', gameCrudIntegration, {
      authorizer: auth,
    });

    const reviewsResource = jobResource.addResource('reviews');
    reviewsResource.addMethod('GET', gameCrudIntegration, { authorizer: auth, });

    const analysisResource = gameResource.addResource('analysis');
    analysisResource.addMethod('DELETE', gameCrudIntegration, {
      authorizer: auth,
    });

    // Create a Lambda Layer for the 'requests' module
    const converseLayer = new lambda.LayerVersion(this, 'ConverseLayer', {
      code: lambda.Code.fromAsset(path.join(__dirname, '../../functions/lambda_layers/converse/layer.zip')), // Path to the directory containing the layer code
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_12], // Specify the compatible runtime(s)
      description: 'Layer containing the requests module',
    });

    const converseLambda = new lambda.Function(this, 'ConverseLambda', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('../functions/converse'),
      handler: 'index.lambda_handler',
      timeout: Duration.seconds(120),
      layers: [converseLayer],
      tracing: lambda.Tracing.ACTIVE,
    })

    converseLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream'
        ],
        resources: ['*']
      })
    )

    converseLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ssm:GetParameter'],
        resources: ['*']
      })
    )

    const converseIntegration = new apigateway.LambdaIntegration(converseLambda);
    const converseResource = jobResource.addResource('converse');
    converseResource.addMethod('GET', converseIntegration, {
      authorizer: auth,
    });

    //update gamecrud lambda and add the webDistribution url
    gamescrud.addEnvironment('WEB_DISTRIBUTION_URL', props?.websiteDomain!);

    const updateConverseLambdaEnv = new cr.AwsCustomResource(this, 'UpdateConverseLambdaEnv', {
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['lambda:UpdateFunctionConfiguration'],
          resources: [converseLambda.functionArn]
        })
      ]),
      onUpdate: {
        service: 'Lambda',
        action: 'updateFunctionConfiguration',
        parameters: {
          FunctionName: converseLambda.functionName,
          Environment: {
            Variables: {
              GAMECRUD_ENDPOINT: gamesAPI.url,
              ALLOWED_ORIGINS: allowedOrigins.join(","),
              FORCE_UPDATE: Date.now().toString(),
              stackName: this.stackName,
            }
          }
        },
        physicalResourceId: cr.PhysicalResourceId.of('UpdateConverseLambdaEnv')
      }
    });


    new CfnOutput(this, 'userPoolClientId', {
      value: userPoolClientId
    })

    new CfnOutput(this, 'gameCrudAPIEndpoint', {
      value: gamesAPI.url
    })



  }
}
