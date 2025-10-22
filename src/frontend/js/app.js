// --- Global State ---
const AppState = {
  resumeFile: null,
  jobs: [],
  currentJob: null,
  currentJobForResume: null,
  s3Bucket: "jobgenie-demo-aloysius-2025",
  s3Key: null,
  apiEndpoint: "https://l6chxgl9rj.execute-api.ap-southeast-2.amazonaws.com/dev",
  skillAnswers: {}
};

// Constants
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// --- Utility Functions ---
function switchScreen(to) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(`screen-${to}`);
  if (screen) {
    screen.classList.add('active');
  }
}

function showLoading(text = 'Processing your resume...') {
  const overlay = document.getElementById('loadingOverlay');
  const loadingText = document.getElementById('loadingText');
  if (loadingText) {
    loadingText.textContent = text;
  }
  if (overlay) {
    overlay.style.display = 'flex';
  }
}

function hideLoading() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

// --- File Upload with Drag & Drop ---
document.getElementById('resumeInput').addEventListener('change', handleFileSelect);
document.getElementById('uploadArea').addEventListener('click', () => {
  document.getElementById('resumeInput').click();
});

// Drag and drop functionality
const uploadArea = document.getElementById('uploadArea');
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  uploadArea.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
  uploadArea.addEventListener(eventName, () => uploadArea.classList.add('drag-over'), false);
});

['dragleave', 'drop'].forEach(eventName => {
  uploadArea.addEventListener(eventName, () => uploadArea.classList.remove('drag-over'), false);
});

uploadArea.addEventListener('drop', handleDrop, false);

function handleDrop(e) {
  const dt = e.dataTransfer;
  const files = dt.files;
  handleFiles(files);
}

function handleFileSelect(e) {
  const files = e.target.files;
  handleFiles(files);
}

function handleFiles(files) {
  if (files.length === 0) return;
  
  const file = files[0];
  
  // Validate file type
  const fileExtension = file.name.split('.').pop().toLowerCase();
  if (fileExtension !== 'pdf') {
    alert("Please upload a PDF file");
    return;
  }
  
  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    alert(`File size must be less than ${MAX_FILE_SIZE / 1024 / 1024}MB. Your file is ${(file.size / 1024 / 1024).toFixed(2)}MB`);
    return;
  }
  
  AppState.resumeFile = file;
  document.getElementById('fileNameText').textContent = file.name;
  document.getElementById('fileInfo').style.display = 'flex';
}

// --- Analyze Resume ---
document.getElementById('analyzeBtn').addEventListener('click', async () => {
  if (!AppState.resumeFile) {
    alert("Please upload your resume first!");
    return;
  }
  
  // Get user's job search preferences
  const jobTitle = document.getElementById('jobTitle').value.trim();
  const jobType = document.getElementById('jobType').value;
  const jobRegion = document.getElementById('jobRegion').value;
  
  if (!jobTitle) {
    alert("Please enter a job title to search for");
    return;
  }
  
  // Build the search query
  let searchQuery = jobTitle;
  
  // Add job type to query
  const jobTypeMap = {
    'intern': 'Intern',
    'fulltime': 'Full Time',
    'parttime': 'Part Time', 
    'contract': 'Contract',
    'remote': 'Remote'
  };
  
  if (jobTypeMap[jobType]) {
    searchQuery += ` ${jobTypeMap[jobType]}`;
  }
  
  // Add region to query
  if (jobRegion && jobRegion !== 'remote') {
    searchQuery += ` in ${jobRegion}`;
  } else if (jobRegion === 'remote') {
    searchQuery += ' Remote';
  }
  
  showLoading(`🔍 Searching for ${searchQuery}...`);
  
  try {
    // Convert file to base64
    const base64 = await fileToBase64(AppState.resumeFile);
    if (!base64) {
      throw new Error("Failed to convert file to base64");
    }

    // Call Lambda with dynamic query
    const s3Key = `resumes/${Date.now()}_${AppState.resumeFile.name}`;
    AppState.s3Key = s3Key;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(`${AppState.apiEndpoint}/process_resume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resume_base64: base64,
        s3_key: s3Key,
        num_jobs: 5,
        query: searchQuery  // Dynamic query from user input
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const responseText = await response.text();
    console.log("Raw response:", responseText);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} - ${responseText}`);
    }
    
    let data;
    try {
        data = JSON.parse(responseText);
    } catch (parseError) {
        throw new Error(`Invalid JSON response: ${responseText}`);
    }
    
    if (data.error) {
      throw new Error(data.error);
    }
    
    if (!data.jobs || !Array.isArray(data.jobs)) {
      throw new Error("Invalid response format from API");
    }

    AppState.jobs = data.jobs;

    if (AppState.jobs.length === 0) {
      alert(`No ${searchQuery} jobs found. Try different search terms.`);
      return;
    }

    renderJobs();
    switchScreen('jobs');
  } catch (error) {
    console.error("Error:", error);
    if (error.name === 'AbortError') {
      alert("Request timed out. Please try again with a smaller PDF file.");
    } else {
      alert("Error analyzing resume: " + error.message);
    }
  } finally {
    hideLoading();
  }
});

// --- File to Base64 ---
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = () => {
      try {
        const result = reader.result;
        const base64 = result.split(',')[1];
        if (!base64) {
          reject(new Error("Failed to extract base64 from file"));
          return;
        }
        resolve(base64);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => {
      reject(new Error("Failed to read file"));
    };
    
    reader.readAsDataURL(file);
  });
}

// --- Render Job List ---
function renderJobs() {
  const container = document.getElementById('jobsContainer');
  
  if (!container) {
    console.error("jobsContainer not found");
    return;
  }
  
  container.innerHTML = AppState.jobs.map((job, index) => {
    const score = job.compatibility_score !== undefined ? job.compatibility_score : 0;
    const title = job.job_title || job.title || 'Untitled';
    const company = job.company || 'N/A';
    const summary = job.summary || '';
    
    return `
    <div class="job-card" data-index="${index}">
      <h2>${escapeHtml(title)}</h2>
      <p><strong>Company:</strong> ${escapeHtml(company)}</p>
      <p>${escapeHtml(summary)}</p>
      <div class="score">${score}% Match</div>
    </div>
  `;
  }).join('');

  // Add event listeners
  container.addEventListener('click', (e) => {
    const jobCard = e.target.closest('.job-card');
    if (jobCard) {
      const idx = jobCard.dataset.index;
      if (idx !== undefined && AppState.jobs[idx]) {
        AppState.currentJob = AppState.jobs[idx];
        renderJobDetails();
        switchScreen('details');
      }
    }
  });
}

// --- Render Job Details ---
function renderJobDetails() {
  const job = AppState.currentJob;
  if (!job) return;
  
  const detailsDiv = document.getElementById('jobDetails');
  if (!detailsDiv) {
    console.error("jobDetails element not found");
    return;
  }
  
  const commonSkills = Array.isArray(job.common_skills) ? job.common_skills : [];
  const missingSkills = Array.isArray(job.missing_skills) ? job.missing_skills : [];
  const score = job.compatibility_score !== undefined ? job.compatibility_score : 0;
  const title = job.job_title || job.title || 'Untitled';
  const company = job.company || 'N/A';

  detailsDiv.innerHTML = `
    <h2>${escapeHtml(title)}</h2>
    <p><strong>Company:</strong> ${escapeHtml(company)}</p>
    <p><strong>Compatibility Score:</strong> ${score}%</p>
    
    <div class="skills-section">
      <h3>✅ Your Matching Skills</h3>
      <div class="skills-list">
        ${commonSkills.map(skill => `<span class="skill-tag common">${escapeHtml(skill)}</span>`).join('')}
      </div>
    </div>
    
    <div class="skills-section">
      <h3>🔧 Skills to Highlight</h3>
      <div class="skills-list">
        ${missingSkills.map(skill => `<span class="skill-tag missing">${escapeHtml(skill)}</span>`).join('')}
      </div>
    </div>
    
    <button id="amendBtn" class="btn btn-primary btn-large">
      <i class="fas fa-wand-magic-sparkles"></i> Enhance Resume for This Job
    </button>
  `;

  const amendBtn = document.getElementById('amendBtn');
  if (amendBtn) {
    amendBtn.addEventListener('click', amendResume);
  }
}

// --- Amend Resume (Shows Q&A Screen) ---
function amendResume() {
  const job = AppState.currentJob;
  if (!job || !AppState.s3Key) {
    alert("Job or resume information missing");
    return;
  }
  
  // Store the current job for later use
  AppState.currentJobForResume = job;
  
  // Show Q&A screen with questions about missing skills
  showSkillQuestions(job);
  switchScreen('qa');
}

// --- Show Skill Questions ---
async function showSkillQuestions(job) {
  const qaContainer = document.getElementById('qaContainer');
  const submitBtn = document.getElementById('submitSkills');
  
  if (!qaContainer) return;
  
  const missingSkills = Array.isArray(job.missing_skills) ? job.missing_skills : [];
  
  // Clear previous questions
  qaContainer.innerHTML = '<div class="loading-questions"><div class="spinner small"></div><p>Generating personalized questions based on your missing skills...</p></div>';
  submitBtn.style.display = 'none';
  AppState.skillAnswers = {};
  
  if (missingSkills.length === 0) {
    qaContainer.innerHTML = '<p>No additional skills needed for this job.</p>';
    submitBtn.style.display = 'block';
    return;
  }
  
  try {
    // Get AI-generated questions from the new Lambda
    const questions = await generateQuestions(missingSkills, job.job_title || job.title);
    
    // Display the AI-generated questions
    qaContainer.innerHTML = '';
    
    questions.forEach((question, index) => {
      const skill = missingSkills[index];
      const questionDiv = document.createElement('div');
      questionDiv.className = 'skill-question';
      questionDiv.innerHTML = `
        <h3>${question}</h3>
        <textarea 
          id="skill-${index}" 
          placeholder="Describe your specific experience, projects, or examples..."
          rows="4"
        ></textarea>
      `;
      qaContainer.appendChild(questionDiv);
      
      // Store skill mapping
      AppState.skillAnswers[`skill-${index}`] = skill;
    });
    
    submitBtn.style.display = 'block';
    
  } catch (error) {
    console.error("Error generating questions:", error);
    // Fallback to simple questions if AI fails
    showFallbackQuestions(missingSkills, qaContainer);
    submitBtn.style.display = 'block';
  }
}

// --- Generate Questions via AI ---
async function generateQuestions(missingSkills, jobTitle) {
  // Add timeout for question generation
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

  try {
    const response = await fetch(`${AppState.apiEndpoint}/generate_resume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "generate_questions",
        missing_skills: missingSkills,
        job_title: jobTitle
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to generate questions: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error);
    }
    
    return data.questions;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error("Question generation timed out. Using default questions.");
    }
    throw error;
  }
}

// --- Fallback Questions ---
function showFallbackQuestions(missingSkills, qaContainer) {
  qaContainer.innerHTML = '';
  
  missingSkills.forEach((skill, index) => {
    const questionDiv = document.createElement('div');
    questionDiv.className = 'skill-question';
    questionDiv.innerHTML = `
      <h3>What experience do you have with ${skill}?</h3>
      <textarea 
        id="skill-${index}" 
        placeholder="Describe your experience, projects, or coursework..."
        rows="4"
      ></textarea>
    `;
    qaContainer.appendChild(questionDiv);
    
    AppState.skillAnswers[`skill-${index}`] = skill;
  });
}

// --- Generate Resume with Answers ---
async function generateResumeWithAnswers() {
  showLoading("✨ Creating your tailored resume...");
  
  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);
  
  try {
    const job = AppState.currentJobForResume;
    if (!job || !AppState.s3Key) {
      throw new Error("Job information missing");
    }

    // Collect all skill answers
    const skillDetails = [];
    for (const [elementId, skill] of Object.entries(AppState.skillAnswers)) {
      const textarea = document.getElementById(elementId);
      if (textarea && textarea.value.trim()) {
        const answer = textarea.value.trim();
        skillDetails.push(`${skill}: ${answer}`);
      }
    }
    
    const jobTitle = job.job_title || job.title || '';
    const additionalSkillsText = skillDetails.join('\n\n');

    const response = await fetch(`${AppState.apiEndpoint}/generate_resume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "generate_resume",
        resume_key: AppState.s3Key,
        job_title: jobTitle,
        additional_skills: additionalSkillsText
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const responseText = await response.text();
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} - ${responseText}`);
    }

    let data;
    try {
        data = JSON.parse(responseText);
    } catch (parseError) {
        throw new Error(`Invalid JSON response: ${responseText}`);
    }
    
    if (!data.generated_resume_url) {
      throw new Error("No resume URL returned from API");
    }

    const resumeUrl = data.generated_resume_url;
    const previewDiv = document.getElementById('resumePreview');
    
    if (!previewDiv) {
      throw new Error("Resume preview element not found");
    }

    // Fetch and display the resume content
    const resumeResponse = await fetch(resumeUrl);
    if (!resumeResponse.ok) {
      throw new Error(`Failed to fetch resume: ${resumeResponse.status}`);
    }
    
    const resumeText = await resumeResponse.text();
    previewDiv.textContent = resumeText;

    switchScreen('generated');
  } catch (error) {
    console.error("Error generating resume:", error);
    if (error.name === 'AbortError') {
      alert("Request timed out. Please try again with shorter answers.");
    } else {
      alert("Error generating resume: " + error.message);
    }
  } finally {
    hideLoading();
    clearTimeout(timeoutId);
  }
}

// --- Download Resume ---
document.getElementById('downloadResume').addEventListener('click', () => {
  const previewDiv = document.getElementById('resumePreview');
  if (!previewDiv) {
    alert("Resume preview not found");
    return;
  }
  
  const content = previewDiv.textContent;
  if (!content) {
    alert("No resume content to download");
    return;
  }
  
  const blob = new Blob([content], { type: 'text/plain' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tailored_resume_${Date.now()}.txt`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
});

// --- Submit Resume ---
document.getElementById('submitResume').addEventListener('click', () => {
  const job = AppState.currentJobForResume;
  if (!job) {
    alert("Job information missing");
    return;
  }
  
  const jobTitle = job.job_title || job.title || 'this position';
  alert(`Resume submitted for: ${jobTitle}\n\nIn a real app, this would send your application to the employer.`);
  switchScreen('jobs');
});

// --- Navigation ---
document.getElementById('backToUpload').addEventListener('click', () => switchScreen('upload'));
document.getElementById('backToJobs').addEventListener('click', () => switchScreen('jobs'));
document.getElementById('backToDetails').addEventListener('click', () => switchScreen('details'));
document.getElementById('backToJobsFromResume').addEventListener('click', () => switchScreen('jobs'));

// --- Add event listener for submit skills button ---
document.getElementById('submitSkills').addEventListener('click', generateResumeWithAnswers);

// --- Utility: Escape HTML ---
function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, m => map[m]);
}
