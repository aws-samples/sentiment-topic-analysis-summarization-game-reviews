const fs = require('fs');

// Read the CDK outputs file
const cdkOutputs = JSON.parse(fs.readFileSync('./cdk/cdk-outputs.json', 'utf8'));

// Extract the relevant outputs
const config = {
  VITE_APP_AWS_REGION: process.env.CDK_DEFAULT_REGION,
  VITE_APP_API_GATEWAY_ENDPOINT: cdkOutputs['GameReviewsAnalysisMainStack'].gameCrudAPIEndpoint,
  VITE_APP_AWS_USER_POOL_ID: cdkOutputs['GameReviewsAnalysisMainStack'].userPoolId,
  VITE_APP_AWS_IDENTITY_POOL_ID: cdkOutputs['GameReviewsAnalysisMainStack'].identityPoolId,
  VITE_APP_AWS_USER_POOL_CLIENT_ID: cdkOutputs['GameReviewsAnalysisMainStack'].userPoolClientId,
  VITE_APP_AWS_USER_POOL_WEB_CLIENT_ID: cdkOutputs['GameReviewsAnalysisMainStack'].userPoolClientId,
};

// Create the content for .env.local file
const envContent = Object.entries(config)
  .map(([key, value]) => `${key}=${value}`)
  .join('\n');

// Write the config to .env.local file
fs.writeFileSync('./resources/ui/.env.local', envContent);

console.log('.env.local file created successfully.');