from datetime import datetime, timezone
import json
from fastapi import Depends, FastAPI, HTTPException, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from mangum import Mangum
from pydantic import BaseModel, Field, validator
import boto3
from boto3.dynamodb.conditions import Key, Attr
from typing import Optional
import os
import uuid
from typing import Dict
import logging
import mimetypes

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

app = FastAPI()

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ.get("ddbTableName"))

app_env = os.environ.get("APP_ENV", "production").lower()

webdistributionurl = f"https://{os.environ.get("WEB_DISTRIBUTION_URL")}"

if app_env == "development":
    origins = [
        "http://localhost",
        "http://localhost:5173",
        "http://localhost:5174"
    ]
else:
    origins = []

if webdistributionurl:
    origins.append(webdistributionurl)

class GameBase(BaseModel):
    title: str = Field(..., min_length=3, max_length=500)
    rawreviewsfilename: Optional[str] = None

class Game(GameBase):
    id: str

class GameCreate(GameBase):
    pass

class JobRequest(BaseModel):
    job_name: str
    job_description: Optional[str] = None

def handle_error(e: Exception, log_message: str, user_message: str):
    logger.error(f"{log_message}: {str(e)}", exc_info=True)
    if app_env == "production":
        raise HTTPException(status_code=500, detail=user_message)
    else:
        raise HTTPException(status_code=500, detail=str(e))


def get_lambda_event(request: Request):
    return request.scope.get("aws.event", {})

def get_authenticated_user_id(event: dict = Depends(get_lambda_event)):
    try:
        request_context = event['requestContext']
        authorizer = request_context.get('authorizer', {})
        claims = authorizer.get('claims', {})
        user_id = claims.get('sub')
        
        if not user_id:
            logger.warning("Authentication failed: User ID not found in claims")
            raise HTTPException(status_code=401, detail="User not authenticated")

        logger.info(f"User authenticated successfully: {user_id}")
        return user_id
    except KeyError:
        logger.error("Invalid event structure in authentication", exc_info=True)
        raise HTTPException(status_code=500, detail="Invalid event structure")

@app.get("/games/{game_id}")
async def get_game(game_id: str, user_id:str = Depends(get_authenticated_user_id)):
    try:
        response = table.get_item(
            Key={"PK": f"GAME#{game_id}", "SK": f"METADATA#{game_id}"}
        )
        item = response.get("Item")
        #get jobs from ddb
        if item:
            response = table.query(
                KeyConditionExpression=Key("PK").eq(f"GAME#{game_id}")
                & Key("SK").begins_with("JOB#")
            )
            jobs = response.get("Items", [])
            item["jobs"] = sorted(jobs, key=lambda x: x.get("jobCreatedOn", 0), reverse=True)

        if not item:
            logger.warning(f"Game not found: {game_id}")
            raise HTTPException(status_code=404, detail="Game not found")
        return item
    except HTTPException:
        raise
    except Exception as e:
        handle_error(e, f"Error retrieving game {game_id}", "An error occurred while retrieving the game")

@app.post("/games", status_code=201)
async def create_game(game: GameCreate, user_id: str = Depends(get_authenticated_user_id)):
    try:
        logger.info(f"Creating game: {game.title}")
        # Create a new game
        game_id = str(uuid.uuid4())
        item = {
            "PK": f"GAME#{game_id}",
            "SK": f"METADATA#{game_id}",
            "title": game.title,
            "id": game_id,
            "user_id": user_id,
            "created_on": datetime.now(timezone.utc).isoformat(),
        }
        table.put_item(Item=item)
        return item
    except HTTPException:
        raise
    except Exception as e:
        handle_error(e, f"Error creating game: {game.title}", "An error occurred while creating the game")


@app.put("/games/{game_id}")
async def update_game(game_id: str, game: GameCreate, user_id: str = Depends(get_authenticated_user_id)):
    try:
        update_expression = "SET " + ", ".join(
            f"#{k}=:{k}" for k in game.dict(exclude_unset=True)
        )
        expression_attribute_values = {
            f":{k}": v for k, v in game.dict(exclude_unset=True).items()
        }
        expression_attribute_names = {f"#{k}": k for k in game.dict(exclude_unset=True)}

        if not expression_attribute_values:
            return await get_game(game_id)  # No updates to apply

        response = table.update_item(
            Key={"PK": f"GAME#{game_id}", "SK": f"METADATA#{game_id}"},
            UpdateExpression=update_expression,
            ExpressionAttributeValues=expression_attribute_values,
            ExpressionAttributeNames=expression_attribute_names,
            ReturnValues="ALL_NEW",
        )
        return response["Attributes"]
    except HTTPException:
        raise
    except Exception as e:
        handle_error(e, f"Error updating game {game_id}", "An error occurred while updating the game")


@app.delete("/games/{game_id}", status_code=204)
async def delete_game(game_id: str, user_id:str =  Depends(get_authenticated_user_id)):
    try:
        table.delete_item(Key={"PK": f"GAME#{game_id}", "SK": f"METADATA#{game_id}"})
        # delete all reviews in dynamodb as well
        response = table.query(
            KeyConditionExpression=Key("PK").eq(f"GAME#{game_id}")
            & Key("SK").begins_with("REVIEW#")
        )
        reviews = response["Items"]
        with table.batch_writer() as batch:
            for review in reviews:
                batch.delete_item(Key={"PK": review["PK"], "SK": review["SK"]})
        # delete s3 files for game
        s3 = boto3.client("s3")
        bucket_name = os.environ.get("gameDataBucketName")
        prefix = f"{game_id}/"
        response = s3.list_objects_v2(Bucket=bucket_name, Prefix=prefix)
        if "Contents" in response:
            for obj in response["Contents"]:
                s3.delete_object(Bucket=bucket_name, Key=obj["Key"])
                print(f"Deleted {obj['Key']}")

        return {"message": "Game deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        handle_error(e, f"Error deleting game {game_id}", "An error occurred while deleting the game")


@app.get("/games")
async def list_games(user_id: str = Depends(get_authenticated_user_id)):

    try:
        filter_expression = Attr("SK").begins_with("METADATA#")
        if user_id:
            filter_expression = filter_expression & Attr("user_id").eq(user_id)
        games = []
        last_evaluated_key = None

        while True:
            if last_evaluated_key:
                response = table.scan(
                    FilterExpression=filter_expression,
                    ExclusiveStartKey=last_evaluated_key
                )
            else:
                response = table.scan(
                    FilterExpression=filter_expression
                )
            
            games.extend(response["Items"])

            last_evaluated_key = response.get("LastEvaluatedKey")
            if not last_evaluated_key:
                break

        for game in games:
            response = table.query(
                KeyConditionExpression=Key("PK").eq(game["PK"])
                & Key("SK").begins_with("JOB#")
            )
            game["jobs"] = response["Items"]

        return games
    except Exception as e:
        logger.error("Error listing games", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# generate presigned url for S3 to upload csv file
@app.get("/upload-url")
async def get_upload_url(game_id: str, job_id: str, filename: str = Query(..., regex=r"^.*\.csv$"), user_id: str = Depends(get_authenticated_user_id)):
    try:
        # validate game exists
        response = table.get_item(
            Key={"PK": f"GAME#{game_id}", "SK": f"METADATA#{game_id}"}
        )
        if not response.get("Item"):
            logger.warning(f"Game {game_id} not found")
            raise HTTPException(status_code=404, detail="Game not found")

        mime_type, _ = mimetypes.guess_type(filename)
        if not mime_type or not mime_type.startswith("text/csv"):
            raise HTTPException(status_code=400, detail="Invalid file type. Only CSV files are allowed.")
        s3 = boto3.client("s3")
        bucket_name = os.environ.get("gameDataBucketName")
        key = f"{game_id}/jobs/{job_id}/raw-data/{filename}"
        url = s3.generate_presigned_url(
            ClientMethod="put_object",
            Params={"Bucket": bucket_name, "Key": key, "ContentType": "text/csv"},
            ExpiresIn=3600,
            HttpMethod="PUT",
        )
        return {"upload_url": url}
    except HTTPException:
        raise
    except Exception as e:
        handle_error(e, f"Error generating upload URL for game {game_id}, job {job_id}", "An error occurred while generating the upload URL")


# endpoint that triggers a statemachine to process the csv file
@app.post("/process-csv")
async def process_csv(game_id: str, job_id: str, user_id: str =  Depends(get_authenticated_user_id)):
    try:
        # validate game exists
        response = table.get_item(
            Key={"PK": f"GAME#{game_id}", "SK": f"JOB#{job_id}"}
        )
        if not response.get("Item"):
            raise HTTPException(status_code=404, detail="Job not found")
        
        #if job is not Completed or Not Sumbitted don't start execution
        if response["Item"]["jobStatus"] not in ["Completed", "Not Submitted"]:
            raise HTTPException(
                status_code=400, detail="Job is not in Completed or Not Submitted state"
            )
        # trigger statemachine
        stepfunctions = boto3.client("stepfunctions")
        state_machine_arn = os.environ.get("stateMachineArn")
        input = {
            "game_id": game_id,
            "job_id": job_id,
            "s3_raw_data_source_key": response["Item"]["rawreviewsfilename"],
            "job_name": job_id,
        }
        response = stepfunctions.start_execution(
            stateMachineArn=state_machine_arn, input=json.dumps(input)
        )
        return {"message": "CSV file processing started"}
    except HTTPException:
        raise
    except Exception as e:
        handle_error(e, f"Error processing CSV for game {game_id}, job {job_id}", "An error occurred while processing the CSV file")


@app.get("/games/{game_id}/analysis-jobs/{job_id}", status_code=200)
async def get_analysis_job(game_id: str, job_id: str, user_id: str =  Depends(get_authenticated_user_id)):
    try:
        response = table.get_item(
            Key={"PK": f"GAME#{game_id}", "SK": f"JOB#{job_id}"}
        )
        item = response.get("Item")
        return item
    except HTTPException:
        raise
    except Exception as e:
        handle_error(e, f"Error retrieving analysis job for game {game_id}, job {job_id}", "An error occurred while retrieving the analysis job")

@app.post("/games/{game_id}/analysis-jobs", status_code=201)
async def create_analysis_job(game_id: str, job_request: JobRequest, user_id: str =  Depends(get_authenticated_user_id)):
    try:
        # validate game exists
        response = table.get_item(
            Key={"PK": f"GAME#{game_id}", "SK": f"METADATA#{game_id}"}
        )
        if not response.get("Item"):
            raise HTTPException(status_code=404, detail="Game not found")
        # create a new dynamodb item for the analysis job. Id must have length less than or equal to 63
        job_id = str(uuid.uuid4())
        item = {
            "PK": f"GAME#{game_id}",
            "SK": f"JOB#{job_id}",
            "id": job_id,
            "jobName": job_request.job_name,
            "jobDescription": job_request.job_description,
            "jobCreatedOn": str(datetime.now(timezone.utc)),
            "jobStatus": "Not Submitted",
            "jobARN": "",
            "rawreviewsfilename": "",
        }
        table.put_item(Item=item)
        return item
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    

#PUT analysis job
@app.put("/games/{game_id}/analysis-jobs/{job_id}")
async def update_analysis_job(game_id: str, job_id: str, job: dict, user_id: str =  Depends(get_authenticated_user_id)):
    try:
        update_expression = "SET " + ", ".join(
            f"#{k}=:{k}" for k in job.keys() if k != "job_id"
        )
        expression_attribute_values = {
            f":{k}": v for k, v in job.items() if k != "job_id"
        }
        expression_attribute_names = {f"#{k}": k for k in job.keys() if k != "job_id"}

        # if not expression_attribute_values:
        #     return await get_analysis_job(game_id, job_id)  # No updates to apply

        response = table.update_item(
            Key={"PK": f"GAME#{game_id}", "SK": f"JOB#{job_id}"},
            UpdateExpression=update_expression,
            ExpressionAttributeValues=expression_attribute_values,
            ExpressionAttributeNames=expression_attribute_names,
            ReturnValues="ALL_NEW",
        )
        return response["Attributes"]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# delete analysis job
@app.delete("/games/{game_id}/analysis-jobs/{job_id}", status_code=204)
async def delete_analysis_job(game_id: str, job_id: str, user_id: str =  Depends(get_authenticated_user_id)):
    try:
        response = table.get_item(
            Key={"PK": f"GAME#{game_id}", "SK": f"JOB#{job_id}"})

        table.delete_item(Key={"PK": f"GAME#{game_id}", "SK": f"JOB#{job_id}"})
        # delete s3 files for analysis job
        s3 = boto3.client("s3")
        bucket_name = os.environ.get("gameDataBucketName")
        prefix = f"{game_id}/jobs/{job_id}/"
        response = s3.list_objects_v2(Bucket=bucket_name, Prefix=prefix)
        if "Contents" in response:
            for obj in response["Contents"]:
                s3.delete_object(Bucket=bucket_name, Key=obj["Key"])
                print(f"Deleted {obj['Key']}")
        return {"message": "Analysis job deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/games/{game_id}/analysis-jobs/{job_id}/reviews")
async def filter_analysis_job_reviews(
    game_id: str, 
    job_id: str, 
    overall_sentiment: Optional[str] = None, 
    topic: Optional[str] = None, 
    sentiment: Optional[str] = None, 
    user_id: str =  Depends(get_authenticated_user_id)):
    
    try:
        filter_expression = Attr("overall_sentiment").eq(overall_sentiment) if overall_sentiment else None

        #if topic and sentiment is provided find the classification that contains topic and sentiment
        if topic and sentiment:
            if filter_expression:
                filter_expression = filter_expression & Attr("classifications").contains({"topic": topic, "sentiment": sentiment})
                
            else:
                filter_expression = Attr("classifications").contains({"topic": topic, "sentiment": sentiment})
                

        if filter_expression:
            response = table.query(
                KeyConditionExpression=Key("PK").eq(f"GAME#{game_id}")
                & Key("SK").begins_with(f"REVIEW#{job_id}"),
                FilterExpression=filter_expression
            )
        else:
            response = table.query(
                KeyConditionExpression=Key("PK").eq(f"GAME#{game_id}")
                & Key("SK").begins_with(f"REVIEW#{job_id}")
            )
        return response["Items"]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    openapi_schema = get_openapi(
        title="Games Analysis Jobs",
        version="1.0.0",
        description="Query games reviews analysis",
        routes=app.routes,
    )
    openapi_schema["info"]["x-logo"] = {
        "url": "https://fastapi.tiangolo.com/img/logo-margin/logo-teal.png"
    }
    openapi_schema["servers"] = [{"url": "/prod"}]
    app.openapi_schema = openapi_schema
    return app.openapi_schema

app.openapi = custom_openapi


app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Lambda handler
lambda_handler = Mangum(app)
