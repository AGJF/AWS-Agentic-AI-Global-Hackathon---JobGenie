// API Configuration
const API_CONFIG = {
  DEV_ENDPOINT: "https://l6chxgl9rj.execute-api.ap-southeast-2.amazonaws.com/dev",
  PROD_ENDPOINT: "https://l6chxgl9rj.execute-api.ap-southeast-2.amazonaws.com/prod",
  UPLOAD_ENDPOINT: "https://l6chxgl9rj.execute-api.ap-southeast-2.amazonaws.com/upload"
};

const DEFAULT_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*"
};

// --- Upload Resume to S3 ---
export async function uploadResume(file, s3Bucket, s3Key) {
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("bucket", s3Bucket);
    formData.append("key", s3Key);

    const response = await fetch(API_CONFIG.UPLOAD_ENDPOINT, {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Upload error:", error);
    throw error;
  }
}

// --- Fetch and Analyze Jobs ---
export async function analyzeResume(s3Bucket, s3Key, numJobs = 5, query = "Software Engineer Intern in Singapore") {
  try {
    const response = await fetch(API_CONFIG.DEV_ENDPOINT, {
      method: "POST",
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({
        s3_bucket: s3Bucket,
        s3_key: s3Key,
        num_jobs: numJobs,
        query: query
      })
    });

    if (!response.ok) {
      throw new Error(`Analysis failed: ${response.status}`);
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error("Invalid response format - expected array");
    }

    return data;
  } catch (error) {
    console.error("Analysis error:", error);
    throw error;
  }
}

// --- Generate Tailored Resume ---
export async function amendResume(resumeKey, jobTitle, additionalSkills = "") {
  try {
    const response = await fetch(API_CONFIG.PROD_ENDPOINT, {
      method: "POST",
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({
        resume_key: resumeKey,
        job_title: jobTitle,
        additional_skills: additionalSkills
      })
    });

    if (!response.ok) {
      throw new Error(`Amendment failed: ${response.status}`);
    }

    const data = await response.json();

    if (!data.generated_resume_key) {
      throw new Error("No generated resume key returned");
    }

    return data;
  } catch (error) {
    console.error("Amendment error:", error);
    throw error;
  }
}

// --- Fetch Resume Content from S3 ---
export async function fetchResumeContent(s3Bucket, resumeKey, region = "ap-southeast-2") {
  try {
    const url = `https://${s3Bucket}.s3.${region}.amazonaws.com/${resumeKey}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status}`);
    }

    return await response.text();
  } catch (error) {
    console.error("Fetch error:", error);
    throw error;
  }
}

// --- Validate Job Data ---
export function validateJobData(job) {
  return {
    job_title: job.job_title || "Untitled",
    company: job.company || "Unknown",
    compatibility_score: Number(job.compatibility_score) || 0,
    common_skills: Array.isArray(job.common_skills) ? job.common_skills : [],
    missing_skills: Array.isArray(job.missing_skills) ? job.missing_skills : [],
    summary: job.summary || "No summary available"
  };
}

// --- Validate Resume Data ---
export function validateResumeResponse(data) {
  if (!data.generated_resume_key) {
    throw new Error("Invalid response: missing generated_resume_key");
  }
  return data;
}

// --- Error Handler ---
export function handleApiError(error) {
  console.error("API Error:", error);
  
  if (error instanceof TypeError) {
    return "Network error - please check your connection";
  } else if (error.message.includes("401")) {
    return "Unauthorized - check your API keys";
  } else if (error.message.includes("403")) {
    return "Forbidden - insufficient permissions";
  } else if (error.message.includes("404")) {
    return "Resource not found";
  } else if (error.message.includes("500")) {
    return "Server error - please try again later";
  }
  
  return error.message || "An unknown error occurred";
}
