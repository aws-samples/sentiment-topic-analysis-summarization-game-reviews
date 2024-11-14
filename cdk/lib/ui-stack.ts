import { RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as iam from 'aws-cdk-lib/aws-iam';

interface UIStackProps extends cdk.StackProps {
    deployAssets?: boolean;
}

export class UIStack extends Stack {

    public readonly distributionDomainName: string;

    constructor(scope: Construct, id: string, props?: UIStackProps) {
        super(scope, id, props)

        const deployAssets = props?.deployAssets ?? false;

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

        const logBucket = new s3.Bucket(this, 'UILogBucket', {
            encryption: s3.BucketEncryption.S3_MANAGED,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            enforceSSL: true,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            versioned: true,
            lifecycleRules: lifecycleRules,
            objectOwnership: s3.ObjectOwnership.OBJECT_WRITER,
        });

        logBucket.addToResourcePolicy(new iam.PolicyStatement({
            actions: ['s3:PutObject'],
            resources: [logBucket.arnForObjects('AWSLogs/*')],
            principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
            conditions: {
                StringEquals: {
                    'aws:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/*`
                }
            }
        }));

        const websiteBucket = new s3.Bucket(this, 'UIBucket', {
            versioned: true,
            encryption: s3.BucketEncryption.S3_MANAGED,
            removalPolicy: RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            serverAccessLogsBucket: logBucket,
            serverAccessLogsPrefix: 'access-logs/',
            lifecycleRules: lifecycleRules
        });

        const oai = new cloudfront.OriginAccessIdentity(this, 'OAI');

        const webDistribution = new cloudfront.Distribution(this, 'UIDistribution', {
            defaultBehavior: {
                origin: new origins.OriginGroup({
                    primaryOrigin: origins.S3BucketOrigin.withOriginAccessControl(websiteBucket),
                    fallbackOrigin: new origins.HttpOrigin('www.example.com'),
                }),
                viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,

                allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
            },
            defaultRootObject: 'index.html',
            errorResponses: [
                {
                    httpStatus: 404,
                    responseHttpStatus: 200,
                    responsePagePath: '/index.html',
                },
                {
                    httpStatus: 403,
                    responseHttpStatus: 200,
                    responsePagePath: '/index.html',
                },
            ],
            enableLogging: true,
            logBucket: logBucket,
            logFilePrefix: 'cloudfront-logs/',
            additionalBehaviors: {
                '/games/*': {
                    origin: new origins.OriginGroup({
                        primaryOrigin: origins.S3BucketOrigin.withOriginAccessControl(websiteBucket),
                        fallbackOrigin: new origins.HttpOrigin('www.example.com'),
                    }),
                    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                    allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
                }
            }
        })


        if (deployAssets) {
            new s3deploy.BucketDeployment(this, 'UIDeploy', {
                sources: [s3deploy.Source.asset('../resources/ui/dist')],
                destinationBucket: websiteBucket,
                distribution: webDistribution,
                distributionPaths: ['/*'],
            });
        }

        new cdk.CfnOutput(this, 'DistributionDomainName', {
            value: webDistribution.distributionDomainName,
            description: 'CloudFront Distribution Domain Name',
        });

        this.distributionDomainName = webDistribution.distributionDomainName;

    }
}