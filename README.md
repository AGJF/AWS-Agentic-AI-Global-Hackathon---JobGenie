# AWS-Agentic-AI-Global-Hackathon---JobGenie
✨JobGenie - No lamp needed, your resume grants the wish.  JobGenie is an agentic AI that transforms your resume into a perfect match for your dream job! 

## Inspiration
Finding the right job can be frustrating and time-consuming. You spend hours hunting for positions that match your skills, only to realize each application needs a slightly different resume. It’s tedious, repetitive, and honestly, exhausting.

What if there was an agent that could look at your resume, show which jobs you’re a good fit for, and point out what skills you’re missing? It could help you focus on the right opportunities and improve where it matters most.

In this era, many people just mass submit resumes online, trusting on luck. The problem? Most of those applications are generic and get lost in the crowd. JobGenie take this to a whole new level. It shows you the missing skills for the job, so that you can continue develop yourself and if you have the skill but forget to add it in your resume, it helps you tailor each resume to the job, while letting you add your own input, so every application actually counts. No time to tailor made your resume? JobGenie got your back!

With JobGenie, you don’t just save time, you apply smarter, show off your strengths, and know exactly where you can grow.

## What it does
JobGenie helps job seekers apply smarter. You upload your resume, and it checks which jobs you’re a good fit for. It shows a compatibility score, matching skills, highlights missing skills, and helps you tailor your resume for each position, so you don’t waste time sending generic applications. 

## How I built it
I built JobGenie as a serverless web app using AWS services. Users upload their resume via a web interface, which stores it in S3. Lambda functions extract the text, fetch relevant job listings, and interact with Bedrock AI to analyze skills and generate tailored resumes. The frontend displays job matches, compatibility scores, and allows users to refine their resume interactively if needed.

## Challenges I ran into
-Handling PDF resume extraction reliably across different formats.
-Setting up CORS correctly for API Gateway to avoid frustrating 403 errors.
-Ensuring Bedrock AI responses were parsed safely, even when output formats varied.
-Balancing speed and accuracy when generating resumes for multiple job listings.
-Trying to learn AWS services

## Accomplishments that I am proud of
-Gained hands-on experience with multiple AWS services like S3, Lambda, API Gateway, and Bedrock, understanding how each service works and their benefits.
-Successfully implemented these services to build a fully functional project that automates resume analysis and job matching.
-Learned how to combine cloud infrastructure and AI to solve a real-world problem, turning a personal idea into a working application.

## What we learned
-The importance of robust error handling for cloud functions and API integrations.
-How to orchestrate multiple AWS services (S3, Lambda, API Gateway, Bedrock) into a seamless workflow.
-Practical experience in working with AI models for text analysis and generation.
-How small UX details, like real-time skill feedback, dramatically improve user engagement.

## What's next for JobGenie
-Allow other form of input such as .docx
-Integrate stronger APIs (e.g., LinkedIn, JobStreet) to access a larger pool of job postings.
-Expand AI capabilities to suggest personalized learning paths and upskilling opportunities for missing skills.
-Add multi-language support for both job listings and resume tailoring.
-Enable direct submission of tailored resumes to companies or job portals, possibly in partnership with large employers.
-Implement a dashboard to track resumes submitted, application status, and company responses.
-Introduce advanced analytics to measure success rates and compatibility improvements over time.
-Offer personalized career insights based on users’ application history and skill development.
-Explore mobile app support for on-the-go resume tailoring and job tracking.

## Tech Stack
- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Python Lambda functions
- **Cloud:** AWS Lambda, S3, API Gateway, Bedrock AI
- **APIs:** JSearch API

## Requirements
-A valid API key for the job listings API (e.g., RapidAPI).

## Testing Procedure
1) Access the Application
-Open the deployed JobGenie web app in a browser.

2)Upload Resume
-Click the Upload Resume button.
-Select a PDF file containing your resume.

3)Analyze Resume
-After uploading, click Analyze Resume.
-The application will process the resume and fetch relevant job listings.

4)Review Job Matches
-Browse the job listings and check the compatibility scores.
-View the missing skills highlighted for each job.

5)Amend Resume
-Click View Details on a job.
-Use the Amend Resume feature to add additional skills or information.
-The system will generate a new tailored resume.

6)Download Tailored Resume
-Once the tailored resume is generated, download it via the provided link.
-Verify that the content reflects the added skills and job-specific tailoring.



