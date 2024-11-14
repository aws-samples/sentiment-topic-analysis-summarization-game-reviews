#!/bin/bash

# Set variables
UI_STACK_NAME="GameReviewsAnalysisUIStack"
REACT_APP_DIR="./resources/ui/"
OUTPUTS_FILE="cdk-outputs.json"

# Function to check if a command was successful
check_success() {
    if [ $? -ne 0 ]; then
        echo "Error: $1 failed"
        exit 1
    fi
}

# Function to create a Lambda layer
create_layer() {
    local layer_dir="$1"
    local layer_name="$2"
    local pip_args="$3"
    local docker_image="public.ecr.aws/lambda/python:3.12"

    echo "Creating layer: $layer_name"

    docker run --rm -v "$(pwd)/$layer_dir:/var/task" \
        --entrypoint /bin/sh \
        "$docker_image" \
        -c "pip install -r /var/task/requirements.txt -t python/lib/python3.12/site-packages/ $pip_args && \
            python -c \"import zipfile, os, shutil
with zipfile.ZipFile('layer.zip', 'w') as z:
    for root, dirs, files in os.walk('python'):
        for file in files:
            z.write(os.path.join(root, file))
shutil.rmtree('python')
\" && \
            echo 'Layer created successfully'"
}

should_create_layers() {
    [[ "$1" == "--create-layers" ]]
}

# Create layers
if should_create_layers "$1"; then
    create_layer "functions/lambda_layers/boto3-layer" "boto3-layer" ""
    create_layer "functions/lambda_layers/gamescrud" "gamescrud-layer" "--platform manylinux2014_x86_64 --implementation cp --python-version 3.12 --only-binary=:all: --upgrade"
    create_layer "functions/lambda_layers/converse" "converse-layer" "--platform manylinux2014_x86_64 --implementation cp --python-version 3.12 --only-binary=:all: --upgrade"
else
    echo "Skipping layer creation. Use --create-layers to create layers."
fi

check_success "Layer creation"

cd -

# Step 1: CDK deploy with outputs file
echo "Step 1: Deploying CDK stacks and generating outputs file..."
cd cdk
cdk deploy --all --outputs-file "$OUTPUTS_FILE" --require-approval never
check_success "CDK deploy"
cd -

echo "Generate UI configuration"
node ./scripts/generate-config.js
check_success "Config generation"

# Step 2: Build React app
echo "Step 2: Building React app..."
cd "$REACT_APP_DIR"
npm run build
check_success "React app build"
cd -

# Step 3: CDK deploy UI stack with context
echo "Step 3: Deploying UI stack with assets..."
cd cdk
cdk deploy "$UI_STACK_NAME" --context deployAssets=true --require-approval never
check_success "UI stack deployment"

echo "Deployment process completed successfully!"
