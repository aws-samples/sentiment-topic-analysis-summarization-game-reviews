import requests
import csv
from typing import Dict
import argparse

def get_all_steam_reviews(appid, num_reviews=100):
    # Base URL for the Steam reviews API
    url = f"https://store.steampowered.com/appreviews/{appid}"
    
    # Parameters for the API request
    params = {
        'json': 1,  # Request the response in JSON format
        'num_per_page': 20,  # Number of reviews per page
        'cursor': '*',  # Initial cursor
    }
    
    all_reviews = []
    total_reviews_fetched = 0

    while total_reviews_fetched < num_reviews:
        # Send a GET request to the API
        response = requests.get(url, params=params,timeout=10)
        
        # Check if the request was successful
        if response.status_code != 200:
            print("Failed to retrieve reviews:", response.status_code)
            break
        
        data = response.json()
        
        # Check if there are reviews in the response
        if 'reviews' in data:
            reviews = data['reviews']
            all_reviews.extend(reviews)
            total_reviews_fetched += len(reviews)
            
            # Update the cursor for the next batch
            params['cursor'] = data['cursor']
            
            # If fewer reviews were returned than requested, we are likely at the end
            if len(reviews) < params['num_per_page']:
                break
        else:
            print("No reviews found.")
            break
    
    return all_reviews[:num_reviews]  # Return only the requested number of reviews

def write_reviews_to_csv(steam_id: int, review_data: Dict) -> None:
    """
    Write Steam reviews to a CSV file.

    Args:
        steam_id (int): The Steam app ID.
        review_data (Dict): A dictionary containing the review data.
    """
    filename = f"{steam_id}_steam_reviews.csv"
    reviews = review_data

    with open(filename, "w", newline="", encoding="utf-8") as csvfile:
        fieldnames = ["id", "review"]
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()

        for review in reviews:
            cleaned_review = review["review"].replace("\r", "")
            writer.writerow({"id": review["recommendationid"], "review": cleaned_review})

    print(f"CSV file '{filename}' has been created successfully.")

def main():
    
    parser = argparse.ArgumentParser(description="Fetch and write Steam reviews to a CSV file.")
    parser.add_argument("steam_id", type=int, help="The Steam app ID")
    parser.add_argument("num_reviews", type=int, help="total reviews to get")
    args = parser.parse_args()

    review_data = get_all_steam_reviews(args.steam_id, args.num_reviews)
    write_reviews_to_csv(args.steam_id, review_data)


if __name__ == "__main__":
    main()
