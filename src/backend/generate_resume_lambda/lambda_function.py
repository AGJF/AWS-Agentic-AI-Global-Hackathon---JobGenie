import json
import boto3
from PyPDF2 import PdfReader
import io

s3 = boto3.client("s3")
bedrock = boto3.client("bedrock-runtime", region_name="ap-southeast-2")

BUCKET_NAME = "jobgenie-demo-aloysius-2025"

def lambda_handler(event, context):
    print("Generate resume Lambda started")
    
    # Handle OPTIONS request for CORS
    if event.get('httpMethod') == 'OPTIONS':
        return cors_response(200, {})
    
    try:
        # Parse body
        body = json.loads(event.get("body", "{}"))
        action = body.get("action")
        
        if action == "generate_questions":
            return handle_generate_questions(body)
        elif action == "generate_resume":
            return handle_generate_resume(body)
        else:
            return error_response("Missing or invalid action parameter")
            
    except Exception as e:
        print(f"Error in generate_resume lambda: {str(e)}")
        return error_response(f"Processing failed: {str(e)}")

def handle_generate_questions(body):
    """Handle question generation request"""
    missing_skills = body.get("missing_skills", [])
    job_title = body.get("job_title", "")
    
    if not missing_skills:
        return success_response({"questions": []})
    
    # Generate questions using AI
    questions = generate_skill_questions(missing_skills, job_title)
    
    return success_response({"questions": questions})

def handle_generate_resume(body):
    """Handle resume generation request"""
    resume_key = body.get("resume_key")
    job_title = body.get("job_title")
    additional_skills = body.get("additional_skills", "")
    
    if not resume_key or not job_title:
        return error_response("Missing resume_key or job_title")

    # Fetch resume from S3
    s3_obj = s3.get_object(Bucket=BUCKET_NAME, Key=resume_key)
    resume_bytes = s3_obj['Body'].read()
    
    # Extract text from PDF
    reader = PdfReader(io.BytesIO(resume_bytes))
    resume_text = ""
    for i, page in enumerate(reader.pages):
        if i >= 2:  # Only read first 2 pages
            break
        page_text = page.extract_text() or ""
        resume_text += page_text
        if len(resume_text) > 1500:
            break
            
    resume_text = resume_text[:1500]
    print(f"Extracted {len(resume_text)} characters from resume")

    # Prepare prompt for Bedrock
    prompt = f"""
IMPROVE THIS RESUME FOR: {job_title}

ORIGINAL RESUME:
{resume_text}

ADDITIONAL EXPERIENCE:
{additional_skills}

Instructions:
- Keep original structure and content
- Add relevant skills from additional experience naturally
- Make it professional and tailored for {job_title}
- Return only the improved resume text

Improved Resume:
"""

    # Call Bedrock
    response = bedrock.invoke_model(
        modelId="amazon.titan-text-express-v1",
        body=json.dumps({
            "inputText": prompt,
            "textGenerationConfig": {
                "maxTokenCount": 1200,
                "temperature": 0.3,
                "topP": 0.9
            }
        })
    )
    
    result = json.loads(response["body"].read())
    generated_resume = result["results"][0]["outputText"].strip()

    # Save new resume to S3
    new_key = f"generated_resumes/{resume_key.split('/')[-1].replace('.pdf', '')}_tailored.txt"
    s3.put_object(
        Bucket=BUCKET_NAME, 
        Key=new_key, 
        Body=generated_resume.encode("utf-8"),
        ContentType='text/plain'
    )

    # Generate pre-signed URL
    presigned_url = s3.generate_presigned_url(
        'get_object',
        Params={'Bucket': BUCKET_NAME, 'Key': new_key},
        ExpiresIn=3600
    )

    return success_response({
        "generated_resume_url": presigned_url,
        "generated_resume_key": new_key,
        "message": "Resume tailored successfully"
    })

def generate_skill_questions(missing_skills, job_title):
    """Use AI to generate contextual questions for missing skills"""
    
    skills_text = ", ".join(missing_skills)
    
    prompt = f"""
Generate one specific question for each missing skill. Make questions practical and job-focused.

Job: {job_title}
Skills: {skills_text}

Return ONLY a JSON array of questions in the same order.

Example: ["What Python projects have you built?", "Describe your AWS experience"]
"""
    
    response = bedrock.invoke_model(
        modelId="amazon.titan-text-express-v1",
        body=json.dumps({
            "inputText": prompt,
            "textGenerationConfig": {
                "maxTokenCount": 800,
                "temperature": 0.3,
                "topP": 0.9
            }
        })
    )
    
    result = json.loads(response["body"].read())
    output_text = result["results"][0]["outputText"].strip()
    
    # Clean response
    output_text = output_text.strip()
    if output_text.startswith('```json'):
        output_text = output_text[7:]
    if output_text.startswith('```'):
        output_text = output_text[3:]
    if output_text.endswith('```'):
        output_text = output_text[:-3]
    
    # Parse JSON
    try:
        questions = json.loads(output_text)
    except json.JSONDecodeError:
        # Fallback if JSON parsing fails
        questions = [f"What experience do you have with {skill}?" for skill in missing_skills]
    
    # Ensure we have correct number of questions
    if len(questions) != len(missing_skills):
        questions = [f"What experience do you have with {skill}?" for skill in missing_skills]
    
    return questions

def success_response(data):
    return cors_response(200, data)

def error_response(message):
    return cors_response(500, {"error": message})

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
