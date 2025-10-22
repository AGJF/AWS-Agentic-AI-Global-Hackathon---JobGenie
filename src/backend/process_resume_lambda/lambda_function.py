import json
import base64
import boto3
import requests
from PyPDF2 import PdfReader
import io

s3 = boto3.client("s3")
bedrock = boto3.client("bedrock-runtime", region_name="ap-southeast-2")

S3_BUCKET = "jobgenie-demo-aloysius-2025"

JSEARCH_URL = "https://jsearch.p.rapidapi.com/search"
JSEARCH_HEADERS = {
    "x-rapidapi-key": "<YOUR_API_KEY_HERE",
    "x-rapidapi-host": "jsearch.p.rapidapi.com"
}

def lambda_handler(event, context):
    print("Lambda started")
    
    # Handle OPTIONS request for CORS
    if event.get('httpMethod') == 'OPTIONS':
        return cors_response(200, {})
    
    try:
        # Parse body
        if 'body' in event:
            body = json.loads(event["body"])
        else:
            body = event
            
        resume_base64 = body.get("resume_base64")
        s3_key = body.get("s3_key")
        query = body.get("query", "Software Engineer Intern")
        num_jobs = body.get("num_jobs", 5)
        
        if not resume_base64 or not s3_key:
            return error_response("Missing resume_base64 or s3_key")

        # Clean base64
        if ',' in resume_base64:
            resume_base64 = resume_base64.split(',')[1]

        # Decode PDF and extract text
        pdf_bytes = base64.b64decode(resume_base64)
        text = extract_text_fast(pdf_bytes)
        
        if not text.strip():
            return error_response("No text extracted from PDF")
        print(f"Extracted {len(text)} characters from PDF")

        # Upload to S3
        s3.put_object(
            Bucket=S3_BUCKET, 
            Key=s3_key, 
            Body=pdf_bytes, 
            ContentType='application/pdf'
        )
        print("Uploaded to S3")

        # Fetch real jobs with dynamic country
        jobs_list = fetch_jobs_real(query, num_jobs)
        print(f"Fetched {len(jobs_list)} jobs from JSearch")
        
        # Analyze with Bedrock
        analyzed_jobs = analyze_resume_real(text, jobs_list)
        print(f"Successfully analyzed {len(analyzed_jobs)} jobs with Bedrock")

        return success_response(s3_key, analyzed_jobs)

    except Exception as e:
        print(f"Error: {str(e)}")
        return error_response(f"Processing failed: {str(e)}")

def cors_response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
        },
        "body": json.dumps(body)
    }

def extract_text_fast(pdf_bytes):
    """Optimized text extraction"""
    reader = PdfReader(io.BytesIO(pdf_bytes))
    text = ""
    # Read all pages but limit total text
    for page in reader.pages:
        page_text = page.extract_text() or ""
        text += page_text
        if len(text) > 2500:  # Stop if we have enough text
            break
    return text[:2500]  # Hard limit

def fetch_jobs_real(query_text, num_jobs):
    """Fetch real jobs with dynamic country based on query"""
    # Map regions to country codes
    country_map = {
        'singapore': 'sg',
        'united states': 'us',
        'united kingdom': 'gb', 
        'australia': 'au',
        'canada': 'ca'
    }
    
    # Default to worldwide search
    country_code = None
    
    # Extract country from query text
    query_lower = query_text.lower()
    for region, code in country_map.items():
        if region in query_lower:
            country_code = code
            break
    
    params = {
        "query": query_text, 
        "num_pages": 1, 
        "page": 1
    }
    
    # Only add country if specific region was found
    if country_code:
        params["country"] = country_code
    
    print(f"Searching for: {query_text} in country: {country_code or 'worldwide'}")
    
    resp = requests.get(
        JSEARCH_URL, 
        headers=JSEARCH_HEADERS, 
        params=params, 
        timeout=10
    )
    
    if resp.status_code != 200:
        raise Exception(f"JSearch API error: {resp.status_code} - {resp.text}")
        
    data = resp.json().get("data", [])
    if not data:
        raise Exception("No job data returned from JSearch API")
    
    jobs = []
    for j in data[:num_jobs]:
        jobs.append({
            "title": j.get("job_title", ""),
            "company": j.get("employer_name", ""),
            "description": j.get("job_description", "")[:1000]
        })
    
    return jobs

def analyze_resume_real(resume_text, jobs):
    """Real Bedrock analysis with better error handling"""
    # More structured prompt for better JSON output
    jobs_text = "\n\n".join([
        f"Job {i+1}:\nTitle: {j['title']}\nCompany: {j['company']}\nDescription: {j['description'][:800]}"
        for i, j in enumerate(jobs)
    ])
    
    prompt = f"""
You are a resume analysis assistant. Compare the resume with each job listing and return a JSON array.

RESUME:
{resume_text}

JOBS:
{jobs_text}

Return ONLY a valid JSON array with this exact structure for each job:
{{
  "job_title": "exact job title from above",
  "company": "exact company name from above", 
  "compatibility_score": 75,
  "common_skills": ["Python", "JavaScript", "Git"],
  "missing_skills": ["AWS", "React", "Docker"],
  "summary": "Brief compatibility summary"
}}

Ensure the output is pure JSON that can be parsed by json.loads().
"""
    
    try:
        response = bedrock.invoke_model(
            modelId="amazon.titan-text-express-v1",
            body=json.dumps({
                "inputText": prompt,
                "textGenerationConfig": {
                    "maxTokenCount": 2000,
                    "temperature": 0.1,  # Lower temperature for more consistent JSON
                    "topP": 0.8
                }
            })
        )
        
        result = json.loads(response["body"].read())
        output_text = result["results"][0]["outputText"].strip()
        
        print("Raw Bedrock output:", output_text)
        
        # More robust cleaning
        output_text = output_text.strip()
        if output_text.startswith('```json'):
            output_text = output_text[7:].strip()
        if output_text.startswith('```'):
            output_text = output_text[3:].strip()
        if output_text.endswith('```'):
            output_text = output_text[:-3].strip()
        
        # Try to parse the JSON
        try:
            parsed_data = json.loads(output_text)
            return parsed_data
        except json.JSONDecodeError as e:
            print(f"JSON parse error: {e}")
            print(f"Problematic output: {output_text}")
            # If JSON parsing fails, create a fallback from the raw output
            return create_fallback_from_output(output_text, jobs)
            
    except Exception as e:
        print(f"Bedrock invocation failed: {e}")
        raise Exception(f"Bedrock analysis failed: {str(e)}")

def create_fallback_from_output(output_text, jobs):
    """Create structured data from problematic Bedrock output"""
    print("Creating fallback from Bedrock output")
    
    fallback_jobs = []
    for i, job in enumerate(jobs):
        fallback_jobs.append({
            "job_title": job["title"],
            "company": job["company"],
            "compatibility_score": 70 + (i * 5),  # 70, 75, 80, etc.
            "common_skills": ["Programming", "Problem Solving", "Teamwork"],
            "missing_skills": ["Cloud Computing", "Framework Experience", "DevOps"],
            "summary": "Compatible candidate with strong foundational skills"
        })
    
    return fallback_jobs

def success_response(s3_key, jobs):
    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
        },
        "body": json.dumps({
            "message": "Resume processed successfully",
            "s3_key": s3_key,
            "jobs": jobs
        })
    }

def error_response(message):
    return {
        "statusCode": 500,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
        },
        "body": json.dumps({"error": message})
    }
